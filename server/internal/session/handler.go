package session

import (
	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Handler struct {
	repo    *Repository
	manager *Manager
	hub     WorkerHub
}

func NewHandler(repo *Repository, manager *Manager, hub WorkerHub) *Handler {
	return &Handler{repo: repo, manager: manager, hub: hub}
}

type createRequest struct {
	Name            string `json:"name"`
	SessionType     string `json:"sessionType"`     // "worker" or "container", defaults to "worker"
	ClaudeSessionID string `json:"claudeSessionId"` // optional: resume a specific Claude session
	WorkDir         string `json:"workDir"`          // optional: working directory
}

type renameRequest struct {
	Name string `json:"name"`
}

func getUserID(c *fiber.Ctx) uuid.UUID {
	token := c.Locals("user").(*jwt.Token)
	claims := token.Claims.(jwt.MapClaims)
	id, _ := uuid.Parse(claims["sub"].(string))
	return id
}

func (h *Handler) List(c *fiber.Ctx) error {
	userID := getUserID(c)
	sessions, err := h.repo.FindByUserID(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to list sessions"})
	}

	result := make([]fiber.Map, len(sessions))
	for i, s := range sessions {
		result[i] = fiber.Map{
			"id":          s.ID,
			"name":        s.Name,
			"status":      s.Status,
			"sessionType": s.SessionType,
			"workDir":     s.WorkDir,
			"createdAt":   s.CreatedAt,
		}
	}

	return c.JSON(result)
}

func (h *Handler) Create(c *fiber.Ctx) error {
	userID := getUserID(c)

	var req createRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}

	if req.Name == "" {
		req.Name = "New Session"
	}

	// Default to worker session type
	if req.SessionType == "" || req.SessionType == "worker" {
		sess, err := h.manager.CreateWorkerSession(c.Context(), userID, req.Name, req.ClaudeSessionID, req.WorkDir, h.hub)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusCreated).JSON(fiber.Map{
			"id":          sess.ID,
			"name":        sess.Name,
			"status":      sess.Status,
			"sessionType": sess.SessionType,
			"workDir":     sess.WorkDir,
			"createdAt":   sess.CreatedAt,
		})
	}

	// Container session type
	sess, err := h.manager.CreateSession(c.Context(), userID, req.Name)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"id":          sess.ID,
		"name":        sess.Name,
		"status":      sess.Status,
		"sessionType": sess.SessionType,
		"createdAt":   sess.CreatedAt,
	})
}

func (h *Handler) Rename(c *fiber.Ctx) error {
	userID := getUserID(c)
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid session id"})
	}

	sess, err := h.repo.FindByID(sessionID)
	if err != nil || sess.UserID != userID {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "session not found"})
	}

	var req renameRequest
	if err := c.BodyParser(&req); err != nil || req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "name is required"})
	}

	sess.Name = req.Name
	if err := h.repo.Update(sess); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to rename session"})
	}

	return c.JSON(fiber.Map{"id": sess.ID, "name": sess.Name})
}

func (h *Handler) Delete(c *fiber.Ctx) error {
	userID := getUserID(c)
	sessionID, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid session id"})
	}

	sess, err := h.repo.FindByID(sessionID)
	if err != nil || sess.UserID != userID {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "session not found"})
	}

	if sess.SessionType == SessionTypeWorker {
		if err := h.manager.DestroyWorkerSession(c.Context(), sess, h.hub); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to destroy session"})
		}
	} else {
		if err := h.manager.DestroySession(c.Context(), sess); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to destroy session"})
		}
	}

	return c.SendStatus(fiber.StatusNoContent)
}
