package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RefreshToken struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;index;not null"`
	TokenHash string    `gorm:"not null"`
	ExpiresAt time.Time `gorm:"not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (t *RefreshToken) BeforeCreate(tx *gorm.DB) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	return nil
}

type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
}

func GenerateTokenPair(userID uuid.UUID, secret string, db *gorm.DB) (*TokenPair, error) {
	// Access token - 15 min
	accessClaims := jwt.MapClaims{
		"sub": userID.String(),
		"exp": time.Now().Add(15 * time.Minute).Unix(),
		"iat": time.Now().Unix(),
	}
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessStr, err := accessToken.SignedString([]byte(secret))
	if err != nil {
		return nil, err
	}

	// Refresh token - 7 days
	refreshID := uuid.New()
	refreshStr := refreshID.String()
	hash := hashToken(refreshStr)

	rt := &RefreshToken{
		UserID:    userID,
		TokenHash: hash,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	if err := db.Create(rt).Error; err != nil {
		return nil, err
	}

	return &TokenPair{
		AccessToken:  accessStr,
		RefreshToken: refreshStr,
	}, nil
}

func ValidateRefreshToken(token string, db *gorm.DB) (*RefreshToken, error) {
	hash := hashToken(token)
	var rt RefreshToken
	if err := db.Where("token_hash = ? AND expires_at > ?", hash, time.Now()).First(&rt).Error; err != nil {
		return nil, err
	}
	// Delete used refresh token (rotation)
	db.Delete(&rt)
	return &rt, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
