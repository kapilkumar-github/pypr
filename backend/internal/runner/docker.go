package runner

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// DefaultImage is pulled once by hand: docker pull node:22-alpine.
	DefaultImage = "node:22-alpine"
	// ContainerName is the one long-lived container all runs execute in.
	ContainerName = "pypr-runner"

	runSeconds  = 4 // killed by `timeout` inside the container
	wallSeconds = 8 // the docker CLI is abandoned after this
	maxOutput   = 16 * 1024
	slots       = 4
	firstUID    = 20001
)

// Docker runs jobs with `docker exec` in one warm container. Creating a container per run costs seconds on many
// hosts, an exec costs about 100 ms. The container has no network, a read-only root, a small tmpfs, no capabilities
// for learners and cgroup limits on memory, processes and CPU. Each concurrent run uses its own slot: a distinct
// unprivileged uid, private files (umask 077), and after the run every process and file of that uid is removed.
//
// The API needs access to the Docker socket, which is root-equivalent on the host: enable it only where that is
// acceptable.
type Docker struct {
	Image string
	// Bin is the docker CLI (default "docker").
	Bin string

	free  chan int
	mu    sync.Mutex
	ready bool
}

func NewDocker(image string) *Docker {
	if image == "" {
		image = DefaultImage
	}
	d := &Docker{Image: image, Bin: "docker", free: make(chan int, slots)}
	for i := range slots {
		d.free <- firstUID + i
	}
	return d
}

func (d *Docker) docker(ctx context.Context, args ...string) (string, error) {
	var out bytes.Buffer
	cmd := exec.CommandContext(ctx, d.Bin, args...)
	cmd.Stdout, cmd.Stderr = &out, &out
	err := cmd.Run()
	return strings.TrimSpace(out.String()), err
}

// Ensure makes sure the runner container exists and is running the right image. Run calls it when needed.
func (d *Docker) Ensure(ctx context.Context) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.ready {
		return nil
	}
	if out, err := d.docker(ctx, "inspect", "-f", "{{.State.Running}} {{.Config.Image}}", ContainerName); err == nil && out == "true "+d.Image {
		d.ready = true
		return nil
	}
	if out, err := d.docker(ctx, "image", "inspect", "--format", "{{.Id}}", d.Image); err != nil {
		return fmt.Errorf("%w: image %s not available (run: docker pull %s): %s", ErrUnavailable, d.Image, d.Image, out)
	}
	_, _ = d.docker(ctx, "rm", "-f", ContainerName)
	out, err := d.docker(ctx, "run", "-d", "--name", ContainerName, "--restart", "unless-stopped",
		"--init", "--network", "none", // --init reaps the leftovers of killed runs; without it zombies fill the pid limit
		"--memory", "768m", "--memory-swap", "768m", "--cpus", "2", "--pids-limit", "256",
		"--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m,mode=1777",
		// Learners run as plain uids with no capabilities at all. The root cleanup step needs these three.
		"--cap-drop", "ALL", "--cap-add", "KILL", "--cap-add", "FOWNER", "--cap-add", "DAC_OVERRIDE",
		d.Image, "sleep", "infinity")
	if err != nil {
		return fmt.Errorf("%w: start runner container: %s", ErrUnavailable, out)
	}
	d.ready = true
	return nil
}

func (d *Docker) reset() {
	d.mu.Lock()
	d.ready = false
	d.mu.Unlock()
}

func (d *Docker) Run(ctx context.Context, jobs []Job) ([]Result, error) {
	if err := d.Ensure(ctx); err != nil {
		return nil, err
	}
	out := make([]Result, len(jobs))
	errs := make([]error, len(jobs))
	var wg sync.WaitGroup
	for i, j := range jobs {
		var uid int
		select {
		case uid = <-d.free:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { d.free <- uid }()
			out[i], errs[i] = d.one(ctx, j, uid)
		}()
	}
	wg.Wait()
	return out, errors.Join(errs...)
}

type capped struct {
	buf  bytes.Buffer
	over bool
}

func (c *capped) Write(p []byte) (int, error) {
	if room := maxOutput - c.buf.Len(); room > 0 {
		c.buf.Write(p[:min(len(p), room)])
	}
	if c.buf.Len() >= maxOutput {
		c.over = true
	}
	return len(p), nil
}

func (c *capped) String() string {
	if c.over {
		return c.buf.String() + "\n…output cut"
	}
	return c.buf.String()
}

func (d *Docker) one(ctx context.Context, j Job, uid int) (Result, error) {
	ext, flags := "js", ""
	switch j.Language {
	case "nodejs":
	case "typescript":
		// Node strips the types and runs the rest. It does not type-check.
		ext, flags = "ts", "--experimental-strip-types --no-warnings "
	default:
		return Result{}, fmt.Errorf("unsupported language %q", j.Language)
	}
	file := fmt.Sprintf("/tmp/main-%d.%s", uid, ext)
	// The source travels in an environment variable and is removed from it before the learner's program starts.
	script := fmt.Sprintf(`umask 077; printf %%s "$PYPR_SRC" | base64 -d > %s; unset PYPR_SRC; ulimit -f 4096; exec timeout -s KILL %d node --max-old-space-size=128 %s%s`, file, runSeconds, flags, file)
	defer d.cleanup(uid)

	cctx, cancel := context.WithTimeout(ctx, wallSeconds*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, d.Bin, "exec", "-i", "--user", strconv.Itoa(uid), "-w", "/tmp",
		"-e", "HOME=/tmp", "-e", "PYPR_SRC="+base64.StdEncoding.EncodeToString([]byte(j.Source)),
		ContainerName, "sh", "-c", script)
	cmd.Stdin = strings.NewReader(j.Stdin)
	var stdout, stderr capped
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	start := time.Now()
	err := cmd.Run()
	elapsed := time.Since(start)
	if cctx.Err() != nil {
		if ctx.Err() != nil {
			return Result{}, ctx.Err()
		}
		return Result{Verdict: TimeLimit, Stdout: stdout.String(), TimeMs: int(elapsed.Milliseconds())}, nil
	}
	res := Result{Stdout: stdout.String(), Stderr: cleanStderr(stderr.String()), TimeMs: int(elapsed.Milliseconds())}
	var exit *exec.ExitError
	switch {
	case err == nil:
		res.Verdict = Ran
	case errors.As(err, &exit):
		code := exit.ExitCode()
		switch {
		case code == 137 && elapsed >= (runSeconds-1)*time.Second:
			res.Verdict = TimeLimit
		case code == 125 || code == 126 || code == 255 || strings.Contains(res.Stderr, "No such container") || strings.Contains(res.Stderr, "is not running"):
			d.reset() // the container is gone: recreate it on the next run
			return Result{}, fmt.Errorf("%w: docker exec failed (%d): %s", ErrUnavailable, code, res.Stderr)
		default:
			res.Verdict = RuntimeError
			if code == 137 && res.Stderr == "" {
				res.Stderr = "The program was stopped (out of memory?)."
			}
		}
	default:
		return Result{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	return res, nil
}

// cleanup removes every process and file the slot's uid left behind. It must not depend on the request's context.
func (d *Docker) cleanup(uid int) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	u := strconv.Itoa(uid)
	_, _ = d.docker(ctx, "exec", "--user", "0", ContainerName, "sh", "-c", `pkill -KILL -u `+u+`; find /tmp -xdev -mindepth 1 -user `+u+` -delete; true`)
}

func cleanStderr(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 4000 {
		s = s[:4000] + "…"
	}
	return s
}
