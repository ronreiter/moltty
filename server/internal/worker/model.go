package worker

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Status string

const (
	StatusOnline  Status = "online"
	StatusOffline Status = "offline"
)

type Worker struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID         uuid.UUID `gorm:"type:uuid;index;not null"`
	Name           string    `gorm:"not null"`
	Status         Status    `gorm:"not null;default:'offline'"`
	ActiveSessions int       `gorm:"column:active_sessions;not null;default:0"`
	Capacity       int       `gorm:"not null;default:10"`
	LastSeenAt     time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (w *Worker) BeforeCreate(tx *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}
