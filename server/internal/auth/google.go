package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/url"

	"github.com/gofiber/fiber/v2"
	"github.com/moltty/server/internal/user"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"
)

type GoogleHandler struct {
	oauthConfig *oauth2.Config
	userRepo    *user.Repository
	db          *gorm.DB
	secret      string
}

type googleUserInfo struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func NewGoogleHandler(clientID, clientSecret, redirectURL string, userRepo *user.Repository, db *gorm.DB, secret string) *GoogleHandler {
	return &GoogleHandler{
		oauthConfig: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
		userRepo: userRepo,
		db:       db,
		secret:   secret,
	}
}

func (h *GoogleHandler) RedirectToGoogle(c *fiber.Ctx) error {
	url := h.oauthConfig.AuthCodeURL("state", oauth2.AccessTypeOffline)
	return c.Redirect(url)
}

func (h *GoogleHandler) Callback(c *fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "missing code"})
	}

	token, err := h.oauthConfig.Exchange(context.Background(), code)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "failed to exchange code"})
	}

	client := h.oauthConfig.Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to get user info"})
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var info googleUserInfo
	if err := json.Unmarshal(body, &info); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to parse user info"})
	}

	// Find or create user
	u, err := h.userRepo.FindByGoogleID(info.ID)
	if err != nil {
		// Try by email
		u, err = h.userRepo.FindByEmail(info.Email)
		if err != nil {
			// Create new user
			u = &user.User{
				Email:     info.Email,
				Name:      info.Name,
				GoogleID:  info.ID,
				AvatarURL: info.Picture,
			}
			if err := h.userRepo.Create(u); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to create user"})
			}
		}
	}

	tokens, err := GenerateTokenPair(u.ID, h.secret, h.db)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to generate tokens"})
	}

	// Redirect to Electron via moltty:// protocol
	redirectURL := fmt.Sprintf("moltty://auth-callback?accessToken=%s&refreshToken=%s",
		url.QueryEscape(tokens.AccessToken),
		url.QueryEscape(tokens.RefreshToken))

	return c.Redirect(redirectURL)
}
