package user

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

func (r *Repository) Create(u *User) error {
	return r.db.Create(u).Error
}

func (r *Repository) FindByEmail(email string) (*User, error) {
	var u User
	err := r.db.Where("email = ?", email).First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) FindByID(id uuid.UUID) (*User, error) {
	var u User
	err := r.db.First(&u, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *Repository) FindByGoogleID(googleID string) (*User, error) {
	var u User
	err := r.db.Where("google_id = ?", googleID).First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}
