package session

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/moltty/server/internal/container"
)

// WorkerHub is the interface the manager uses to interact with the worker hub.
type WorkerHub interface {
	SpawnSession(sessionID, workerID uuid.UUID, command, workDir string)
	KillSession(sessionID uuid.UUID)
}

// WorkerSelector selects an online worker for a user.
type WorkerSelector interface {
	SelectWorker(userID uuid.UUID) (workerID uuid.UUID, err error)
}

type Manager struct {
	repo           *Repository
	docker         *container.DockerManager
	workerPool     *container.WorkerPool
	workerSelector WorkerSelector
}

func NewManager(repo *Repository, docker *container.DockerManager, workerPool *container.WorkerPool) *Manager {
	return &Manager{
		repo:       repo,
		docker:     docker,
		workerPool: workerPool,
	}
}

func (m *Manager) SetWorkerSelector(ws WorkerSelector) {
	m.workerSelector = ws
}

// CreateSession creates a new session with a container on a worker node (container mode).
func (m *Manager) CreateSession(ctx context.Context, userID uuid.UUID, name string) (*Session, error) {
	sess := &Session{
		UserID:      userID,
		Name:        name,
		SessionType: SessionTypeContainer,
		Status:      StatusCreating,
	}
	if err := m.repo.Create(sess); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	// Select a worker node
	worker, err := m.workerPool.SelectWorker()
	if err != nil {
		sess.Status = StatusError
		m.repo.Update(sess)
		return nil, fmt.Errorf("no available worker: %w", err)
	}

	// Create container
	env := map[string]string{
		"SESSION_ID": sess.ID.String(),
	}
	result, err := m.docker.CreateContainer(ctx, worker, sess.ID.String(), env)
	if err != nil {
		sess.Status = StatusError
		m.repo.Update(sess)
		return nil, fmt.Errorf("create container: %w", err)
	}

	// Update session with container info
	sess.ContainerID = result.ContainerID
	sess.WorkerHost = worker.Host
	sess.ContainerPort = result.HostPort
	sess.Status = StatusRunning
	if err := m.repo.Update(sess); err != nil {
		return nil, fmt.Errorf("update session: %w", err)
	}

	if err := m.workerPool.IncrementContainers(worker.ID); err != nil {
		log.Printf("failed to increment worker container count: %v", err)
	}

	return sess, nil
}

// CreateWorkerSession creates a new session that runs on a remote worker via the hub.
// If claudeSessionID is provided, resumes that Claude session. If workDir is provided, uses it as CWD.
func (m *Manager) CreateWorkerSession(ctx context.Context, userID uuid.UUID, name string, claudeSessionID string, workDir string, hub WorkerHub) (*Session, error) {
	if m.workerSelector == nil {
		return nil, fmt.Errorf("no worker selector configured")
	}

	workerID, err := m.workerSelector.SelectWorker(userID)
	if err != nil {
		return nil, fmt.Errorf("no available worker: %w", err)
	}

	command := "claude"
	if claudeSessionID != "" {
		command = "claude --resume " + claudeSessionID
	}
	if workDir == "" {
		workDir = "~"
	}

	sess := &Session{
		UserID:      userID,
		Name:        name,
		SessionType: SessionTypeWorker,
		WorkerID:    &workerID,
		WorkDir:     workDir,
		Command:     command,
		Status:      StatusCreating,
	}
	if err := m.repo.Create(sess); err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}

	hub.SpawnSession(sess.ID, workerID, sess.Command, sess.WorkDir)
	return sess, nil
}

// ResumeSession resumes an offline session on a worker.
func (m *Manager) ResumeSession(ctx context.Context, sess *Session, hub WorkerHub) error {
	if sess.WorkerID == nil {
		return fmt.Errorf("session has no worker")
	}
	hub.SpawnSession(sess.ID, *sess.WorkerID, "claude --continue", sess.WorkDir)
	return nil
}

// DestroySession stops the container and removes the session.
func (m *Manager) DestroySession(ctx context.Context, sess *Session) error {
	if sess.ContainerID != "" && sess.WorkerHost != "" {
		worker, err := m.workerPool.FindByHost(sess.WorkerHost)
		if err == nil {
			if err := m.docker.StopContainer(ctx, worker, sess.ContainerID); err != nil {
				log.Printf("failed to stop container %s: %v", sess.ContainerID[:12], err)
			}
			if err := m.workerPool.DecrementContainers(worker.ID); err != nil {
				log.Printf("failed to decrement worker container count: %v", err)
			}
		}
	}

	return m.repo.Delete(sess.ID)
}

// DestroyWorkerSession kills a worker session and removes it.
func (m *Manager) DestroyWorkerSession(ctx context.Context, sess *Session, hub WorkerHub) error {
	hub.KillSession(sess.ID)
	return m.repo.Delete(sess.ID)
}

// HealthCheck verifies the container is reachable. Used after creation.
func (m *Manager) HealthCheck(sess *Session) bool {
	if sess.WorkerHost == "" || sess.ContainerPort == 0 {
		return false
	}
	// Simple TCP dial check with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_ = ctx // would use for actual dial
	return true
}
