package worker

import "sync"

const DefaultScrollbackSize = 1024 * 1024 // 1MB

// ScrollbackBuffer is a bounded, thread-safe ring buffer that stores recent terminal output.
type ScrollbackBuffer struct {
	mu      sync.Mutex
	buf     []byte
	maxSize int
}

func NewScrollbackBuffer(maxSize int) *ScrollbackBuffer {
	if maxSize <= 0 {
		maxSize = DefaultScrollbackSize
	}
	return &ScrollbackBuffer{
		buf:     make([]byte, 0, maxSize),
		maxSize: maxSize,
	}
}

// Write appends data to the buffer, truncating from the front if over max size.
func (sb *ScrollbackBuffer) Write(p []byte) {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	sb.buf = append(sb.buf, p...)
	if len(sb.buf) > sb.maxSize {
		// Keep only the last maxSize bytes
		sb.buf = sb.buf[len(sb.buf)-sb.maxSize:]
	}
}

// Bytes returns a snapshot of the current buffer contents.
func (sb *ScrollbackBuffer) Bytes() []byte {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	out := make([]byte, len(sb.buf))
	copy(out, sb.buf)
	return out
}
