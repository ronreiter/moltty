package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type resizeMsg struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

func main() {
	addr := ":7681"
	if env := os.Getenv("PTY_BRIDGE_ADDR"); env != "" {
		addr = env
	}

	shell := "/bin/bash"
	if env := os.Getenv("PTY_BRIDGE_SHELL"); env != "" {
		shell = env
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		handleWS(w, r, shell)
	})

	log.Printf("pty-bridge listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

func handleWS(w http.ResponseWriter, r *http.Request, shell string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}
	defer conn.Close()

	var cmd *exec.Cmd
	if shell == "/bin/bash" || shell == "bash" {
		cmd = exec.Command(shell, "-l")
	} else {
		cmd = exec.Command(shell)
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Printf("pty start error: %v", err)
		return
	}
	defer ptmx.Close()

	// Handle SIGCHLD
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGCHLD)
	defer signal.Stop(sigCh)

	var once sync.Once
	done := make(chan struct{})
	closeDone := func() { once.Do(func() { close(done) }) }

	// PTY -> WebSocket
	go func() {
		defer closeDone()
		buf := make([]byte, 32*1024)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				if err != io.EOF {
					log.Printf("pty read error: %v", err)
				}
				return
			}
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				log.Printf("ws write error: %v", err)
				return
			}
		}
	}()

	// WebSocket -> PTY
	go func() {
		defer closeDone()
		for {
			msgType, data, err := conn.ReadMessage()
			if err != nil {
				if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
					log.Printf("ws read error: %v", err)
				}
				return
			}

			switch msgType {
			case websocket.BinaryMessage:
				if _, err := ptmx.Write(data); err != nil {
					log.Printf("pty write error: %v", err)
					return
				}
			case websocket.TextMessage:
				var msg resizeMsg
				if err := json.Unmarshal(data, &msg); err != nil {
					log.Printf("json parse error: %v", err)
					continue
				}
				if msg.Type == "resize" {
					if err := pty.Setsize(ptmx, &pty.Winsize{
						Cols: msg.Cols,
						Rows: msg.Rows,
					}); err != nil {
						log.Printf("resize error: %v", err)
					}
				}
			}
		}
	}()

	<-done

	// Clean up the process
	if cmd.Process != nil {
		cmd.Process.Signal(syscall.SIGHUP)
		cmd.Process.Wait()
	}
}
