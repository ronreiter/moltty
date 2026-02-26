package worker

// WorkerMessage is sent from the worker to the server.
type WorkerMessage struct {
	Type      string `json:"type"`      // session-started, session-exited, output, pong
	SessionID string `json:"sessionId"` // target session
	Data      string `json:"data"`      // base64-encoded PTY output (for "output")
	ExitCode  *int   `json:"exitCode"`  // process exit code (for "session-exited")
}

// ServerMessage is sent from the server to the worker.
type ServerMessage struct {
	Type      string `json:"type"`      // spawn, input, resize, kill, ping
	SessionID string `json:"sessionId"` // target session
	Command   string `json:"command"`   // command to run (for "spawn")
	WorkDir   string `json:"workDir"`   // working directory (for "spawn")
	Data      string `json:"data"`      // base64-encoded input (for "input")
	Cols      int    `json:"cols"`      // terminal columns (for "resize")
	Rows      int    `json:"rows"`      // terminal rows (for "resize")
}
