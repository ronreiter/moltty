.PHONY: all build dev clean pty-bridge server client container-image up down

all: build

# --- PTY Bridge ---
pty-bridge:
	cd container/pty-bridge && go build -o pty-bridge .

# --- Container Image ---
container-image: pty-bridge
	docker build -t moltty-session ./container

# --- Server ---
server-build:
	cd server && go build -o bin/server ./cmd/server

server-dev:
	cd server && go run ./cmd/server

# --- Client ---
client-install:
	cd client && npm install

client-dev: client-install
	cd client && npm run dev

client-build: client-install
	cd client && npm run build

# --- Docker Compose ---
up:
	docker compose up -d

down:
	docker compose down

# --- Full Build ---
build: pty-bridge server-build client-build

# --- Clean ---
clean:
	rm -f container/pty-bridge/pty-bridge
	rm -rf server/bin
	rm -rf client/dist client/out
