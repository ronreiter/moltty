package worker

import (
	"fmt"

	"github.com/google/uuid"
)

// HubSelector implements session.WorkerSelector using the Hub's live worker connections.
type HubSelector struct {
	repo *Repository
}

func NewHubSelector(repo *Repository) *HubSelector {
	return &HubSelector{repo: repo}
}

func (s *HubSelector) SelectWorker(userID uuid.UUID) (uuid.UUID, error) {
	w, err := s.repo.SelectWorker(userID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("no online worker available: %w", err)
	}
	return w.ID, nil
}
