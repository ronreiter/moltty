package session

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(s *Session) error {
	return r.db.Create(s).Error
}

func (r *Repository) FindByID(id uuid.UUID) (*Session, error) {
	var s Session
	err := r.db.First(&s, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) FindByUserID(userID uuid.UUID) ([]Session, error) {
	var sessions []Session
	err := r.db.Where("user_id = ?", userID).Order("created_at desc").Find(&sessions).Error
	return sessions, err
}

func (r *Repository) FindByWorkerID(workerID uuid.UUID) ([]Session, error) {
	var sessions []Session
	err := r.db.Where("worker_id = ?", workerID).Find(&sessions).Error
	return sessions, err
}

// FindResumable returns offline sessions for a given worker that can be auto-resumed.
func (r *Repository) FindResumable(workerID uuid.UUID) ([]Session, error) {
	var sessions []Session
	err := r.db.Where("worker_id = ? AND status = ?", workerID, StatusOffline).Find(&sessions).Error
	return sessions, err
}

func (r *Repository) Update(s *Session) error {
	return r.db.Save(s).Error
}

func (r *Repository) Delete(id uuid.UUID) error {
	return r.db.Delete(&Session{}, "id = ?", id).Error
}
