package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/moltty/server/internal/user"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"
)

// pendingTokens stores tokens from completed OAuth flows, keyed by a random state.
// The Electron app polls to pick them up.
var (
	pendingTokens   = make(map[string]*TokenPair)
	pendingTokensMu sync.Mutex
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

	// Store tokens for polling and redirect to success page
	code2 := fmt.Sprintf("%x", u.ID[:8])
	pendingTokensMu.Lock()
	pendingTokens[code2] = tokens
	pendingTokensMu.Unlock()

	return c.Redirect(fmt.Sprintf("/api/auth/google/complete?code=%s", code2))
}

// Complete shows a success page after Google OAuth login.
func (h *GoogleHandler) Complete(c *fiber.Ctx) error {
	code2 := c.Query("code")

	pendingTokensMu.Lock()
	tokens, ok := pendingTokens[code2]
	if ok {
		delete(pendingTokens, code2)
	}
	pendingTokensMu.Unlock()

	if !ok {
		c.Set("Content-Type", "text/html")
		return c.SendString(`<!DOCTYPE html><html><body style="background:#1e1e2e;color:#cdd6f4;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h2>Login expired. Please try again.</h2></body></html>`)
	}

	c.Set("Content-Type", "text/html")
	return c.SendString(fmt.Sprintf(`<!DOCTYPE html>
<html><head><title>Moltty - Login Successful</title></head>
<body style="background:#1e1e2e;color:#cdd6f4;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<h2 style="color:#a6e3a1">Login successful!</h2>
<p>You can close this tab and return to Moltty.</p>
</div>
<script>
window.opener && window.opener.postMessage({type:'moltty-auth',accessToken:'%s',refreshToken:'%s'},'*');
</script>
</body></html>`,
		tokens.AccessToken, tokens.RefreshToken))
}
