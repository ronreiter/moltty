FROM golang:1.22-bookworm AS builder

WORKDIR /build
COPY pty-bridge/go.mod pty-bridge/go.sum ./pty-bridge/
RUN cd pty-bridge && go mod download

COPY pty-bridge/ ./pty-bridge/
RUN cd pty-bridge && CGO_ENABLED=0 go build -o /pty-bridge .

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    bash \
    curl \
    git \
    vim \
    nfs-common \
    ca-certificates \
    locales \
    && rm -rf /var/lib/apt/lists/*

# Set up locale
RUN locale-gen en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

# Install chisel
RUN curl -fsSL https://github.com/jpillora/chisel/releases/download/v1.9.1/chisel_1.9.1_linux_amd64.gz \
    | gunzip > /usr/local/bin/chisel && chmod +x /usr/local/bin/chisel

# Install Node.js 18 and Claude Code
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g @anthropic-ai/claude-code \
    && rm -rf /var/lib/apt/lists/*

# Copy PTY bridge
COPY --from=builder /pty-bridge /usr/local/bin/pty-bridge

# Create non-root user
RUN useradd -m -s /bin/bash -u 1000 user

# Pre-create Claude config directory
RUN mkdir -p /home/user/.claude && chown -R user:user /home/user/.claude
WORKDIR /home/user

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 7681

ENTRYPOINT ["/entrypoint.sh"]
