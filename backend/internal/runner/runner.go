// Package runner runs a learner's Node.js or TypeScript program in a throwaway Docker container:
// no network, no writable disk beyond a small tmpfs, no capabilities, and hard limits on memory, processes and time.
package runner

import (
	"context"
	"errors"
)

// Languages that can run on the server.
var Languages = []string{"nodejs", "typescript"}

// Job is one program run with one stdin.
type Job struct {
	Language string
	Source   string
	Stdin    string
}

// Verdicts of a finished run. Whether the output is right is for the caller to judge.
const (
	Ran          = "ran"
	RuntimeError = "runtime_error"
	TimeLimit    = "time_limit"
)

type Result struct {
	Verdict string
	Stdout  string
	Stderr  string
	TimeMs  int
}

// Runner runs jobs and returns one result per job, in order.
type Runner interface {
	Run(ctx context.Context, jobs []Job) ([]Result, error)
}

// ErrUnavailable means the runner itself failed (Docker missing, image not pulled), not the learner's code.
var ErrUnavailable = errors.New("code runner unavailable")

// Fake answers jobs from a function. For tests.
type Fake func(Job) Result

func (f Fake) Run(_ context.Context, jobs []Job) ([]Result, error) {
	out := make([]Result, len(jobs))
	for i, j := range jobs {
		out[i] = f(j)
	}
	return out, nil
}
