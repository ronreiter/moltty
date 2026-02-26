package container

import (
	"github.com/docker/docker/api/types/mount"
)

// NFSVolumeConfig holds config for NFS-backed volume mounts in containers.
type NFSVolumeConfig struct {
	Server string // NFS server address (e.g., EFS endpoint)
	Path   string // NFS export path
}

// BuildNFSMount creates a Docker mount spec for an NFS volume.
func BuildNFSMount(cfg *NFSVolumeConfig, userDir string) mount.Mount {
	return mount.Mount{
		Type:   mount.TypeVolume,
		Source: "nfs-" + userDir,
		Target: "/home/user/workspace",
		VolumeOptions: &mount.VolumeOptions{
			DriverConfig: &mount.Driver{
				Name: "local",
				Options: map[string]string{
					"type":   "nfs",
					"o":      "addr=" + cfg.Server + ",nolock,soft,rw",
					"device": ":" + cfg.Path + "/" + userDir,
				},
			},
		},
	}
}
