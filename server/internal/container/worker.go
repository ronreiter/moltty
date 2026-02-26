package container

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WorkerStatus string

const (
	WorkerActive   WorkerStatus = "active"
	WorkerDraining WorkerStatus = "draining"
	WorkerOffline  WorkerStatus = "offline"
)

type WorkerNode struct {
	ID               uuid.UUID    `gorm:"type:uuid;primaryKey"`
	Host             string       `gorm:"not null"`
	DockerAPIURL     string       `gorm:"column:docker_api_url;not null"`
	TLSCertPath      string       `gorm:"column:tls_cert_path"`
	Capacity         int          `gorm:"not null;default:10"`
	ActiveContainers int          `gorm:"column:active_containers;not null;default:0"`
	Status           WorkerStatus `gorm:"not null;default:'active'"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func (w *WorkerNode) BeforeCreate(tx *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

type WorkerPool struct {
	db *gorm.DB
}

func NewWorkerPool(db *gorm.DB) *WorkerPool {
	return &WorkerPool{db: db}
}

// SelectWorker picks the least-loaded active worker with available capacity.
func (p *WorkerPool) SelectWorker() (*WorkerNode, error) {
	var worker WorkerNode
	err := p.db.Where("status = ? AND active_containers < capacity", WorkerActive).
		Order("active_containers asc").
		First(&worker).Error
	if err != nil {
		return nil, err
	}
	return &worker, nil
}

func (p *WorkerPool) IncrementContainers(workerID uuid.UUID) error {
	return p.db.Model(&WorkerNode{}).Where("id = ?", workerID).
		UpdateColumn("active_containers", gorm.Expr("active_containers + 1")).Error
}

func (p *WorkerPool) DecrementContainers(workerID uuid.UUID) error {
	return p.db.Model(&WorkerNode{}).Where("id = ? AND active_containers > 0", workerID).
		UpdateColumn("active_containers", gorm.Expr("active_containers - 1")).Error
}

func (p *WorkerPool) FindByHost(host string) (*WorkerNode, error) {
	var w WorkerNode
	err := p.db.Where("host = ?", host).First(&w).Error
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (p *WorkerPool) List() ([]WorkerNode, error) {
	var workers []WorkerNode
	err := p.db.Order("host asc").Find(&workers).Error
	return workers, err
}

func (p *WorkerPool) Register(w *WorkerNode) error {
	return p.db.Create(w).Error
}
