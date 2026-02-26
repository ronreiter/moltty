package worker

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

func (r *Repository) Create(w *Worker) error {
	return r.db.Create(w).Error
}

func (r *Repository) FindByID(id uuid.UUID) (*Worker, error) {
	var w Worker
	err := r.db.First(&w, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) FindByUserID(userID uuid.UUID) ([]Worker, error) {
	var workers []Worker
	err := r.db.Where("user_id = ?", userID).Order("created_at desc").Find(&workers).Error
	return workers, err
}

func (r *Repository) FindOnlineByUserID(userID uuid.UUID) ([]Worker, error) {
	var workers []Worker
	err := r.db.Where("user_id = ? AND status = ?", userID, StatusOnline).Find(&workers).Error
	return workers, err
}

// SelectWorker picks the least-loaded online worker for a user.
func (r *Repository) SelectWorker(userID uuid.UUID) (*Worker, error) {
	var w Worker
	err := r.db.Where("user_id = ? AND status = ? AND active_sessions < capacity", userID, StatusOnline).
		Order("active_sessions asc").
		First(&w).Error
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) Update(w *Worker) error {
	return r.db.Save(w).Error
}

func (r *Repository) Delete(id uuid.UUID) error {
	return r.db.Delete(&Worker{}, "id = ?", id).Error
}

func (r *Repository) Upsert(w *Worker) error {
	return r.db.Where("id = ?", w.ID).
		Assign(*w).
		FirstOrCreate(w).Error
}
