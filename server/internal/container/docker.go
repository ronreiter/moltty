package container

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// DockerManager handles Docker operations on remote worker nodes.
type DockerManager struct {
	image string
}

func NewDockerManager(image string) *DockerManager {
	return &DockerManager{image: image}
}

// clientForWorker creates a Docker client connected to a remote worker's Docker API.
func clientForWorker(worker *WorkerNode) (*client.Client, error) {
	var opts []client.Opt
	opts = append(opts, client.WithHost(worker.DockerAPIURL))
	opts = append(opts, client.WithAPIVersionNegotiation())

	if worker.TLSCertPath != "" {
		httpClient, err := tlsHTTPClient(worker.TLSCertPath)
		if err != nil {
			return nil, fmt.Errorf("tls client: %w", err)
		}
		opts = append(opts, client.WithHTTPClient(httpClient))
	}

	return client.NewClientWithOpts(opts...)
}

// tlsHTTPClient creates an HTTP client with TLS certs for Docker API auth.
func tlsHTTPClient(certPath string) (*http.Client, error) {
	// In production, load TLS certs from certPath.
	// For dev, return default client.
	return http.DefaultClient, nil
}

type CreateContainerResult struct {
	ContainerID string
	HostPort    int
}

// CreateContainer creates and starts a new session container on the given worker.
func (m *DockerManager) CreateContainer(ctx context.Context, worker *WorkerNode, sessionID string, env map[string]string) (*CreateContainerResult, error) {
	cli, err := clientForWorker(worker)
	if err != nil {
		return nil, fmt.Errorf("docker client: %w", err)
	}
	defer cli.Close()

	// Build env slice
	envSlice := []string{
		"TERM=xterm-256color",
	}
	for k, v := range env {
		envSlice = append(envSlice, k+"="+v)
	}

	// Container config
	containerCfg := &container.Config{
		Image: m.image,
		Env:   envSlice,
		ExposedPorts: nat.PortSet{
			"7681/tcp": struct{}{},
		},
		Labels: map[string]string{
			"moltty.session": sessionID,
		},
	}

	// Host config with resource limits and port mapping
	hostCfg := &container.HostConfig{
		PortBindings: nat.PortMap{
			"7681/tcp": []nat.PortBinding{
				{HostIP: "0.0.0.0", HostPort: "0"}, // Dynamic port
			},
		},
		Resources: container.Resources{
			Memory:   512 * 1024 * 1024, // 512MB
			NanoCPUs: 1_000_000_000,     // 1 CPU
		},
		RestartPolicy: container.RestartPolicy{Name: "unless-stopped"},
	}

	resp, err := cli.ContainerCreate(ctx, containerCfg, hostCfg, &network.NetworkingConfig{}, nil, "moltty-"+sessionID)
	if err != nil {
		return nil, fmt.Errorf("container create: %w", err)
	}

	if err := cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return nil, fmt.Errorf("container start: %w", err)
	}

	// Get the mapped port
	inspect, err := cli.ContainerInspect(ctx, resp.ID)
	if err != nil {
		return nil, fmt.Errorf("container inspect: %w", err)
	}

	bindings := inspect.NetworkSettings.Ports["7681/tcp"]
	if len(bindings) == 0 {
		return nil, fmt.Errorf("no port binding found for 7681")
	}

	port, _ := strconv.Atoi(bindings[0].HostPort)
	log.Printf("container %s started on %s:%d", resp.ID[:12], worker.Host, port)

	return &CreateContainerResult{
		ContainerID: resp.ID,
		HostPort:    port,
	}, nil
}

// StopContainer stops and removes a container on the given worker.
func (m *DockerManager) StopContainer(ctx context.Context, worker *WorkerNode, containerID string) error {
	cli, err := clientForWorker(worker)
	if err != nil {
		return fmt.Errorf("docker client: %w", err)
	}
	defer cli.Close()

	timeout := 10
	stopOpts := container.StopOptions{Timeout: &timeout}
	if err := cli.ContainerStop(ctx, containerID, stopOpts); err != nil {
		log.Printf("container stop warning: %v", err)
	}

	if err := cli.ContainerRemove(ctx, containerID, container.RemoveOptions{Force: true}); err != nil {
		return fmt.Errorf("container remove: %w", err)
	}

	return nil
}

// ContainerLogs returns the logs from a container.
func (m *DockerManager) ContainerLogs(ctx context.Context, worker *WorkerNode, containerID string) (io.ReadCloser, error) {
	cli, err := clientForWorker(worker)
	if err != nil {
		return nil, fmt.Errorf("docker client: %w", err)
	}

	return cli.ContainerLogs(ctx, containerID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Follow:     false,
		Tail:       "100",
	})
}
