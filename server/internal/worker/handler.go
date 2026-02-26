package worker

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Handler struct {
	hub       *Hub
	repo      *Repository
	jwtSecret string
}

func NewHandler(hub *Hub, repo *Repository, jwtSecret string) *Handler {
	return &Handler{hub: hub, repo: repo, jwtSecret: jwtSecret}
}

// UpgradeMiddleware validates JWT from query param before WebSocket upgrade.
func (h *Handler) UpgradeMiddleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		tokenStr := c.Query("token")
		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing token"})
		}

		token, err := jwtlib.Parse(tokenStr, func(t *jwtlib.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwtlib.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(h.jwtSecret), nil
		})
		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}

		claims := token.Claims.(jwtlib.MapClaims)
		c.Locals("userID", claims["sub"].(string))
		c.Locals("workerID", c.Query("workerId"))

		if websocket.IsWebSocketUpgrade(c) {
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	}
}

// WSHandler accepts a worker WebSocket connection and enters a read loop.
func (h *Handler) WSHandler() fiber.Handler {
	return websocket.New(func(c *websocket.Conn) {
		userIDStr := c.Locals("userID").(string)
		userID, err := uuid.Parse(userIDStr)
		if err != nil {
			log.Printf("worker-ws: invalid user id: %s", userIDStr)
			return
		}

		workerIDStr, _ := c.Locals("workerID").(string)
		workerID, err := uuid.Parse(workerIDStr)
		if err != nil {
			log.Printf("worker-ws: invalid worker id: %s", workerIDStr)
			return
		}

		log.Printf("worker-ws: worker %s connected (user %s)", workerID, userID)
		h.hub.RegisterWorker(workerID, userID, c)
		defer h.hub.UnregisterWorker(workerID)

		for {
			_, data, err := c.ReadMessage()
			if err != nil {
				log.Printf("worker-ws: read error from worker %s: %v", workerID, err)
				return
			}

			var msg WorkerMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				log.Printf("worker-ws: invalid message from worker %s: %v", workerID, err)
				continue
			}

			h.hub.HandleWorkerMessage(workerID, msg)
		}
	})
}

// List returns the user's workers.
func (h *Handler) List(c *fiber.Ctx) error {
	userID := getUserIDFromCtx(c)
	workers, err := h.repo.FindByUserID(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list workers"})
	}

	result := make([]fiber.Map, len(workers))
	for i, w := range workers {
		result[i] = fiber.Map{
			"id":             w.ID,
			"name":           w.Name,
			"status":         w.Status,
			"activeSessions": w.ActiveSessions,
			"lastSeenAt":     w.LastSeenAt,
		}
	}

	return c.JSON(result)
}

// Delete deregisters a worker.
func (h *Handler) Delete(c *fiber.Ctx) error {
	userID := getUserIDFromCtx(c)
	workerID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid worker id"})
	}

	w, err := h.repo.FindByID(workerID)
	if err != nil || w.UserID != userID {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "worker not found"})
	}

	h.hub.UnregisterWorker(workerID)
	if err := h.repo.Delete(workerID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to delete worker"})
	}

	return c.SendStatus(fiber.StatusNoContent)
}

func getUserIDFromCtx(c *fiber.Ctx) uuid.UUID {
	token := c.Locals("user").(*jwtlib.Token)
	claims := token.Claims.(jwtlib.MapClaims)
	id, _ := uuid.Parse(claims["sub"].(string))
	return id
}
