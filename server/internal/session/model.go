package session

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Status string

const (
	StatusCreating Status = "creating"
	StatusRunning  Status = "running"
	StatusStopped  Status = "stopped"
	StatusError    Status = "error"
	StatusOffline  Status = "offline"
)

type SessionType string

const (
	SessionTypeWorker    SessionType = "worker"
	SessionTypeContainer SessionType = "container"
)

type Session struct {
	ID            uuid.UUID   `gorm:"type:uuid;primaryKey"`
	UserID        uuid.UUID   `gorm:"type:uuid;index;not null"`
	Name          string      `gorm:"not null"`
	SessionType   SessionType `gorm:"column:session_type;not null;default:'container'"`
	ContainerID   string      `gorm:"column:container_id"`
	WorkerHost    string      `gorm:"column:worker_host"`
	ContainerPort int         `gorm:"column:container_port"`
	WorkerID      *uuid.UUID  `gorm:"type:uuid;index"`
	WorkDir       string      `gorm:"column:work_dir"`
	Command       string      `gorm:"column:command"`
	ExitCode      *int        `gorm:"column:exit_code"`
	Status        Status      `gorm:"not null;default:'creating'"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (s *Session) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}
