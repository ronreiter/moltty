package proxy

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/url"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	ws "github.com/gorilla/websocket"
	"github.com/moltty/server/internal/session"
	"github.com/moltty/server/internal/worker"
)

type WSProxy struct {
	sessionRepo *session.Repository
	jwtSecret   string
	hub         *worker.Hub
}

func NewWSProxy(sessionRepo *session.Repository, jwtSecret string, hub *worker.Hub) *WSProxy {
	return &WSProxy{sessionRepo: sessionRepo, jwtSecret: jwtSecret, hub: hub}
}

// UpgradeMiddleware validates JWT from query param before WebSocket upgrade.
func (p *WSProxy) UpgradeMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		tokenStr := c.Query("token")
		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing token"})
		}

		token, err := jwtlib.Parse(tokenStr, func(t *jwtlib.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwtlib.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(p.jwtSecret), nil
		})
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}

		claims := token.Claims.(jwt.MapClaims)
		c.Locals("userID", claims["sub"].(string))

		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	}
}

// Handler proxies WebSocket connections between client and container/worker PTY.
func (p *WSProxy) Handler() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		userIDStr := c.Locals("userID").(string)
		userID, _ := uuid.Parse(userIDStr)

		sessionID, err := uuid.Parse(c.Params("id"))
		if err != nil {
			log.Printf("invalid session id: %v", err)
			return
		}

		sess, err := p.sessionRepo.FindByID(sessionID)
		if err != nil || sess.UserID != userID {
			log.Printf("session not found or unauthorized")
			return
		}

		// Route based on session type
		if sess.SessionType == session.SessionTypeWorker {
			p.relayViaHub(c, sess)
		} else {
			p.relayViaContainer(c, sess)
		}
	})
}

// relayViaHub registers a viewer and relays I/O through the worker hub.
func (p *WSProxy) relayViaHub(c *websocket.Conn, sess *session.Session) {
	vc := p.hub.RegisterViewer(sess.ID, c)
	defer p.hub.UnregisterViewer(sess.ID, vc)

	for {
		msgType, data, err := c.ReadMessage()
		if err != nil {
			return
		}

		if msgType == websocket.TextMessage {
			// Parse JSON messages (resize)
			var msg struct {
				Type string `json:"type"`
				Cols int    `json:"cols"`
				Rows int    `json:"rows"`
			}
			if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "resize" {
				p.hub.SendResize(sess.ID, msg.Cols, msg.Rows)
				continue
			}
		}

		// Binary message = terminal input, encode to base64 and send to hub
		encoded := base64.StdEncoding.EncodeToString(data)
		p.hub.SendInput(sess.ID, encoded)
	}
}

// relayViaContainer directly proxies to the container PTY bridge (existing behavior).
func (p *WSProxy) relayViaContainer(c *websocket.Conn, sess *session.Session) {
	if sess.Status != session.StatusRunning {
		log.Printf("session %s not running (status: %s)", sess.ID, sess.Status)
		return
	}

	// Connect to the PTY bridge on the worker node
	targetURL := url.URL{
		Scheme: "ws",
		Host:   fmt.Sprintf("%s:%d", sess.WorkerHost, sess.ContainerPort),
		Path:   "/",
	}

	backend, _, err := ws.DefaultDialer.Dial(targetURL.String(), nil)
	if err != nil {
		log.Printf("failed to connect to pty bridge at %s: %v", targetURL.String(), err)
		return
	}
	defer backend.Close()

	done := make(chan struct{})

	// Client -> Backend
	go func() {
		defer close(done)
		for {
			msgType, data, err := c.ReadMessage()
			if err != nil {
				return
			}
			if err := backend.WriteMessage(msgType, data); err != nil {
				return
			}
		}
	}()

	// Backend -> Client
	go func() {
		for {
			msgType, data, err := backend.ReadMessage()
			if err != nil {
				return
			}
			if err := c.WriteMessage(msgType, data); err != nil {
				return
			}
		}
	}()

	<-done
}
