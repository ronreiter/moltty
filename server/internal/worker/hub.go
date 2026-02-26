package worker

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
	"github.com/moltty/server/internal/session"
)

// WorkerConn represents a live WebSocket connection from a worker.
type WorkerConn struct {
	WorkerID   uuid.UUID
	UserID     uuid.UUID
	Conn       *websocket.Conn
	WriteMu    sync.Mutex
	SessionIDs map[uuid.UUID]bool
}

// SessionRelay holds per-session state: scrollback buffer, worker association, and viewer fan-out.
type SessionRelay struct {
	SessionID  uuid.UUID
	WorkerID   uuid.UUID
	Viewers    map[*ViewerConn]bool
	Scrollback *ScrollbackBuffer
	mu         sync.Mutex
}

// ViewerConn represents a viewer WebSocket connection.
type ViewerConn struct {
	Conn    *websocket.Conn
	WriteMu sync.Mutex
}

// Hub is the core in-memory relay for worker and viewer connections.
type Hub struct {
	workers     map[uuid.UUID]*WorkerConn
	sessions    map[uuid.UUID]*SessionRelay
	mu          sync.RWMutex
	workerRepo  *Repository
	sessionRepo *session.Repository
	scrollbackSize int
}

func NewHub(workerRepo *Repository, sessionRepo *session.Repository, scrollbackSize int) *Hub {
	if scrollbackSize <= 0 {
		scrollbackSize = DefaultScrollbackSize
	}
	return &Hub{
		workers:        make(map[uuid.UUID]*WorkerConn),
		sessions:       make(map[uuid.UUID]*SessionRelay),
		workerRepo:     workerRepo,
		sessionRepo:    sessionRepo,
		scrollbackSize: scrollbackSize,
	}
}

// RegisterWorker registers a worker WebSocket connection and auto-resumes offline sessions.
func (h *Hub) RegisterWorker(workerID, userID uuid.UUID, conn *websocket.Conn) {
	wc := &WorkerConn{
		WorkerID:   workerID,
		UserID:     userID,
		Conn:       conn,
		SessionIDs: make(map[uuid.UUID]bool),
	}

	h.mu.Lock()
	h.workers[workerID] = wc
	h.mu.Unlock()

	// Update worker status in DB
	w, err := h.workerRepo.FindByID(workerID)
	if err != nil {
		// Worker not yet registered in DB, create it
		w = &Worker{
			ID:     workerID,
			UserID: userID,
			Name:   "Worker",
			Status: StatusOnline,
		}
		w.LastSeenAt = time.Now()
		h.workerRepo.Upsert(w)
	} else {
		w.Status = StatusOnline
		w.LastSeenAt = time.Now()
		h.workerRepo.Update(w)
	}

	// Auto-resume offline sessions
	resumable, err := h.sessionRepo.FindResumable(workerID)
	if err != nil {
		log.Printf("hub: error finding resumable sessions for worker %s: %v", workerID, err)
		return
	}

	for _, sess := range resumable {
		cmd := "claude --continue"
		workDir := sess.WorkDir
		if workDir == "" {
			workDir = "~"
		}
		log.Printf("hub: auto-resuming session %s on worker %s", sess.ID, workerID)
		h.SpawnSession(sess.ID, workerID, cmd, workDir)
	}
}

// UnregisterWorker marks all sessions as offline and updates DB.
func (h *Hub) UnregisterWorker(workerID uuid.UUID) {
	h.mu.Lock()
	wc, ok := h.workers[workerID]
	if !ok {
		h.mu.Unlock()
		return
	}
	delete(h.workers, workerID)

	// Mark associated sessions as offline
	for sessID := range wc.SessionIDs {
		if relay, exists := h.sessions[sessID]; exists {
			sess, err := h.sessionRepo.FindByID(sessID)
			if err == nil {
				sess.Status = session.StatusOffline
				h.sessionRepo.Update(sess)
			}
			// Notify viewers
			relay.mu.Lock()
			relay.WorkerID = uuid.Nil
			relay.mu.Unlock()
		}
	}
	h.mu.Unlock()

	// Update worker status in DB
	w, err := h.workerRepo.FindByID(workerID)
	if err == nil {
		w.Status = StatusOffline
		h.workerRepo.Update(w)
	}

	log.Printf("hub: worker %s unregistered", workerID)
}

// HandleWorkerMessage dispatches messages from a worker.
func (h *Hub) HandleWorkerMessage(workerID uuid.UUID, msg WorkerMessage) {
	// Handle messages that don't need a session ID
	if msg.Type == "pong" {
		return
	}

	sessID, err := uuid.Parse(msg.SessionID)
	if err != nil {
		log.Printf("hub: invalid session ID in worker message: %s", msg.SessionID)
		return
	}

	switch msg.Type {
	case "session-started":
		h.mu.Lock()
		if wc, ok := h.workers[workerID]; ok {
			wc.SessionIDs[sessID] = true
		}
		h.mu.Unlock()

		// Update session status
		sess, err := h.sessionRepo.FindByID(sessID)
		if err == nil {
			sess.Status = session.StatusRunning
			h.sessionRepo.Update(sess)
		}
		log.Printf("hub: session %s started on worker %s", sessID, workerID)

	case "session-exited":
		exitCode := 0
		if msg.ExitCode != nil {
			exitCode = *msg.ExitCode
		}

		h.mu.Lock()
		if wc, ok := h.workers[workerID]; ok {
			delete(wc.SessionIDs, sessID)
		}
		h.mu.Unlock()

		// Update session status
		sess, err := h.sessionRepo.FindByID(sessID)
		if err == nil {
			sess.Status = session.StatusStopped
			sess.ExitCode = msg.ExitCode
			h.sessionRepo.Update(sess)
		}
		log.Printf("hub: session %s exited with code %d", sessID, exitCode)

	case "output":
		data, err := base64.StdEncoding.DecodeString(msg.Data)
		if err != nil {
			log.Printf("hub: invalid base64 output for session %s", sessID)
			return
		}

		h.mu.RLock()
		relay, exists := h.sessions[sessID]
		h.mu.RUnlock()

		if !exists {
			// Create relay on first output
			relay = &SessionRelay{
				SessionID:  sessID,
				WorkerID:   workerID,
				Viewers:    make(map[*ViewerConn]bool),
				Scrollback: NewScrollbackBuffer(h.scrollbackSize),
			}
			h.mu.Lock()
			h.sessions[sessID] = relay
			h.mu.Unlock()
		}

		// Append to scrollback
		relay.Scrollback.Write(data)

		// Fan out to viewers
		relay.mu.Lock()
		for vc := range relay.Viewers {
			vc.WriteMu.Lock()
			if err := vc.Conn.WriteMessage(websocket.BinaryMessage, data); err != nil {
				log.Printf("hub: failed to write to viewer: %v", err)
			}
			vc.WriteMu.Unlock()
		}
		relay.mu.Unlock()

	}
}

// SpawnSession sends a spawn command to a worker.
func (h *Hub) SpawnSession(sessionID, workerID uuid.UUID, command, workDir string) {
	h.mu.RLock()
	wc, ok := h.workers[workerID]
	h.mu.RUnlock()

	if !ok {
		log.Printf("hub: worker %s not connected, cannot spawn session %s", workerID, sessionID)
		return
	}

	// Ensure relay exists
	h.mu.Lock()
	if _, exists := h.sessions[sessionID]; !exists {
		h.sessions[sessionID] = &SessionRelay{
			SessionID:  sessionID,
			WorkerID:   workerID,
			Viewers:    make(map[*ViewerConn]bool),
			Scrollback: NewScrollbackBuffer(h.scrollbackSize),
		}
	} else {
		h.sessions[sessionID].WorkerID = workerID
	}
	h.mu.Unlock()

	msg := ServerMessage{
		Type:      "spawn",
		SessionID: sessionID.String(),
		Command:   command,
		WorkDir:   workDir,
	}

	data, _ := json.Marshal(msg)
	wc.WriteMu.Lock()
	defer wc.WriteMu.Unlock()
	if err := wc.Conn.WriteMessage(websocket.TextMessage, data); err != nil {
		log.Printf("hub: failed to send spawn to worker %s: %v", workerID, err)
	}
}

// SendInput sends keystroke data to a session's worker.
func (h *Hub) SendInput(sessionID uuid.UUID, data string) {
	h.mu.RLock()
	relay, exists := h.sessions[sessionID]
	h.mu.RUnlock()

	if !exists {
		return
	}

	h.mu.RLock()
	wc, ok := h.workers[relay.WorkerID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	msg := ServerMessage{
		Type:      "input",
		SessionID: sessionID.String(),
		Data:      data,
	}

	msgData, _ := json.Marshal(msg)
	wc.WriteMu.Lock()
	defer wc.WriteMu.Unlock()
	wc.Conn.WriteMessage(websocket.TextMessage, msgData)
}

// SendResize sends a resize command to a session's worker.
func (h *Hub) SendResize(sessionID uuid.UUID, cols, rows int) {
	h.mu.RLock()
	relay, exists := h.sessions[sessionID]
	h.mu.RUnlock()

	if !exists {
		return
	}

	h.mu.RLock()
	wc, ok := h.workers[relay.WorkerID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	msg := ServerMessage{
		Type:      "resize",
		SessionID: sessionID.String(),
		Cols:      cols,
		Rows:      rows,
	}

	data, _ := json.Marshal(msg)
	wc.WriteMu.Lock()
	defer wc.WriteMu.Unlock()
	wc.Conn.WriteMessage(websocket.TextMessage, data)
}

// KillSession sends a kill command to a session's worker.
func (h *Hub) KillSession(sessionID uuid.UUID) {
	h.mu.RLock()
	relay, exists := h.sessions[sessionID]
	h.mu.RUnlock()

	if !exists {
		return
	}

	h.mu.RLock()
	wc, ok := h.workers[relay.WorkerID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	msg := ServerMessage{
		Type:      "kill",
		SessionID: sessionID.String(),
	}

	data, _ := json.Marshal(msg)
	wc.WriteMu.Lock()
	defer wc.WriteMu.Unlock()
	wc.Conn.WriteMessage(websocket.TextMessage, data)
}

// RegisterViewer registers a viewer connection for a session.
// Sends existing scrollback data to the viewer immediately.
func (h *Hub) RegisterViewer(sessionID uuid.UUID, conn *websocket.Conn) *ViewerConn {
	vc := &ViewerConn{Conn: conn}

	h.mu.Lock()
	relay, exists := h.sessions[sessionID]
	if !exists {
		relay = &SessionRelay{
			SessionID:  sessionID,
			WorkerID:   uuid.Nil,
			Viewers:    make(map[*ViewerConn]bool),
			Scrollback: NewScrollbackBuffer(h.scrollbackSize),
		}
		h.sessions[sessionID] = relay
	}
	h.mu.Unlock()

	// Send existing scrollback
	scrollback := relay.Scrollback.Bytes()
	if len(scrollback) > 0 {
		vc.WriteMu.Lock()
		conn.WriteMessage(websocket.BinaryMessage, scrollback)
		vc.WriteMu.Unlock()
	}

	relay.mu.Lock()
	relay.Viewers[vc] = true
	relay.mu.Unlock()

	return vc
}

// UnregisterViewer removes a viewer connection from a session.
func (h *Hub) UnregisterViewer(sessionID uuid.UUID, vc *ViewerConn) {
	h.mu.RLock()
	relay, exists := h.sessions[sessionID]
	h.mu.RUnlock()

	if !exists {
		return
	}

	relay.mu.Lock()
	delete(relay.Viewers, vc)
	relay.mu.Unlock()
}

// StartPingLoop periodically pings all connected workers.
func (h *Hub) StartPingLoop(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			h.mu.RLock()
			for _, wc := range h.workers {
				msg := ServerMessage{Type: "ping"}
				data, _ := json.Marshal(msg)
				wc.WriteMu.Lock()
				wc.Conn.WriteMessage(websocket.TextMessage, data)
				wc.WriteMu.Unlock()
			}
			h.mu.RUnlock()
		}
	}()
}
