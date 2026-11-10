// Package machine holds the machine coding module: multi-stage problems, the sessions learners spend on them
// (practice, interview, review), their attempts and AI reviews.
package machine

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"pypr/backend/internal/codeprob"
)

type DB = codeprob.DB

const (
	ModePractice  = "practice"
	ModeInterview = "interview"
	ModeReview    = "review"

	maxSourceBytes = 64 * 1024
)

var (
	Categories = []string{"utility", "backend", "app"}

	errNoAttempt = errors.New("no attempt yet")
)

func isNotFound(err error) bool {
	var pgErr *pgconn.PgError
	return errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == "22P02")
}

type Criterion struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Stage is one step of a problem. Learners see its requirements once the earlier stages are cleared.
type Stage struct {
	N            int             `json:"n"`
	Title        string          `json:"title"`
	Requirements string          `json:"requirements"`
	Hints        []string        `json:"hints"`
	Tests        []codeprob.Test `json:"tests"`
}

// Problem is a stored problem, solutions and test code included. Never sent to a learner as is: see view.
type Problem struct {
	ID              string
	Slug            string
	Category        string
	Title           string
	Difficulty      string
	Summary         string
	Statement       string
	Requirements    []string
	Evaluation      []Criterion
	Followups       []string
	Starter         map[string]string
	Prelude         string
	Stages          []Stage
	Solutions       map[string]string
	DurationMinutes int
}

func loadProblem(ctx context.Context, db DB, id string) (Problem, error) {
	var p Problem
	var req, eval, fol, starter, stages, sol []byte
	err := db.QueryRow(ctx,
		`select id, slug, category, title, difficulty, summary, statement, requirements, evaluation, followups, starter, prelude, stages, solutions, duration_minutes
		 from mc_problems where id = $1`, id).
		Scan(&p.ID, &p.Slug, &p.Category, &p.Title, &p.Difficulty, &p.Summary, &p.Statement, &req, &eval, &fol, &starter, &p.Prelude, &stages, &sol, &p.DurationMinutes)
	if err != nil {
		return p, err
	}
	for _, x := range []struct {
		raw []byte
		dst any
	}{{req, &p.Requirements}, {eval, &p.Evaluation}, {fol, &p.Followups}, {starter, &p.Starter}, {stages, &p.Stages}, {sol, &p.Solutions}} {
		if err := json.Unmarshal(x.raw, x.dst); err != nil {
			return p, err
		}
	}
	return p, nil
}

// Summary is a row of the problem list.
type Summary struct {
	ID            string `json:"id"`
	Slug          string `json:"slug"`
	Category      string `json:"category"`
	Title         string `json:"title"`
	Difficulty    string `json:"difficulty"`
	Summary       string `json:"summary"`
	Stages        int    `json:"stages"`
	StagesCleared int    `json:"stagesCleared"`
	Minutes       int    `json:"minutes"`
}

func list(ctx context.Context, db DB, workspaceID, category string) ([]Summary, error) {
	rows, err := db.Query(ctx,
		`select p.id, p.slug, p.category, p.title, p.difficulty, p.summary, jsonb_array_length(p.stages),
		        coalesce((select max(s.stage_reached) from mc_sessions s where s.problem_id = p.id and s.workspace_id = $1), 0),
		        p.duration_minutes
		 from mc_problems p
		 where $2 = '' or p.category = $2
		 order by case p.category when 'utility' then 0 when 'backend' then 1 else 2 end,
		          case p.difficulty when 'easy' then 0 when 'medium' then 1 else 2 end, p.title`, workspaceID, category)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Summary])
	if out == nil {
		out = []Summary{}
	}
	return out, err
}

// Session is one sitting on a problem.
type Session struct {
	ID           string     `json:"id"`
	WorkspaceID  string     `json:"workspaceId"`
	ProblemID    string     `json:"problemId"`
	Mode         string     `json:"mode"`
	StartedAt    time.Time  `json:"startedAt"`
	EndsAt       *time.Time `json:"endsAt"`
	StageReached int        `json:"stageReached"`
	FinishedAt   *time.Time `json:"finishedAt"`
	// Now is the server clock, so the browser can show a countdown without trusting its own.
	Now time.Time `json:"now"`
}

const sessionCols = `s.id, s.workspace_id, s.problem_id, s.mode, s.started_at, s.ends_at, s.stage_reached, s.finished_at`

func scanSession(row pgx.Row) (Session, error) {
	var s Session
	err := row.Scan(&s.ID, &s.WorkspaceID, &s.ProblemID, &s.Mode, &s.StartedAt, &s.EndsAt, &s.StageReached, &s.FinishedAt)
	s.Now = time.Now()
	return s, err
}

// ownedSession loads a session of a workspace the user owns. An interview whose time ran out is closed here.
func ownedSession(ctx context.Context, db DB, userID, workspaceID, id string) (Session, error) {
	s, err := scanSession(db.QueryRow(ctx,
		`select `+sessionCols+` from mc_sessions s join workspaces w on w.id = s.workspace_id
		 where s.id = $1 and w.id = $2 and w.user_id = $3`, id, workspaceID, userID))
	if err != nil {
		return s, err
	}
	if s.FinishedAt == nil && s.EndsAt != nil && s.Now.After(*s.EndsAt) {
		if _, err := db.Exec(ctx, `update mc_sessions set finished_at = ends_at where id = $1 and finished_at is null`, id); err != nil {
			return s, err
		}
		s.FinishedAt = s.EndsAt
	}
	return s, nil
}

func ownsWorkspace(ctx context.Context, db DB, userID, id string) error {
	var x int
	return db.QueryRow(ctx, `select 1 from workspaces where id = $1 and user_id = $2`, id, userID).Scan(&x)
}

// startSession opens a session, or returns the learner's open one in the same mode (an interview that has not ended).
// Review needs an earlier attempt on the problem.
func startSession(ctx context.Context, db DB, workspaceID string, p Problem, mode string, minutes int) (Session, error) {
	open, err := scanSession(db.QueryRow(ctx,
		`select `+sessionCols+` from mc_sessions s
		 where s.workspace_id = $1 and s.problem_id = $2 and s.mode = $3 and s.finished_at is null and (s.ends_at is null or s.ends_at > now())
		 order by s.started_at desc limit 1`, workspaceID, p.ID, mode))
	if err == nil {
		return open, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return open, err
	}
	reached := 0
	if mode == ModeReview {
		if _, err := latestAttempt(ctx, db, workspaceID, p.ID); err != nil {
			return Session{}, err
		}
		if err := db.QueryRow(ctx, `select coalesce(max(stage_reached), 0) from mc_sessions where workspace_id = $1 and problem_id = $2`, workspaceID, p.ID).Scan(&reached); err != nil {
			return Session{}, err
		}
	}
	var ends any
	if mode == ModeInterview {
		ends = time.Now().Add(time.Duration(minutes) * time.Minute)
	}
	return scanSession(db.QueryRow(ctx,
		`insert into mc_sessions as s (workspace_id, problem_id, mode, ends_at, stage_reached) values ($1, $2, $3, $4, $5) returning `+sessionCols,
		workspaceID, p.ID, mode, ends, reached))
}

type Attempt struct {
	ID        string
	SessionID string
	Stage     int
	Source    string
	Passed    int
	Total     int
}

// latestAttempt is the learner's newest attempt on a problem in a workspace, from any session.
func latestAttempt(ctx context.Context, db DB, workspaceID, problemID string) (Attempt, error) {
	var a Attempt
	err := db.QueryRow(ctx,
		`select a.id, a.session_id, a.stage, a.source, a.passed, a.total
		 from mc_attempts a join mc_sessions s on s.id = a.session_id
		 where s.workspace_id = $1 and s.problem_id = $2 order by a.created_at desc limit 1`, workspaceID, problemID).
		Scan(&a.ID, &a.SessionID, &a.Stage, &a.Source, &a.Passed, &a.Total)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, errNoAttempt
	}
	return a, err
}

// currentSource is what the editor opens with: the session's last attempt, else (review) the latest attempt on the problem, else the starter.
func currentSource(ctx context.Context, db DB, s Session, p Problem) (string, error) {
	var src string
	err := db.QueryRow(ctx, `select source from mc_attempts where session_id = $1 order by created_at desc limit 1`, s.ID).Scan(&src)
	if err == nil {
		return src, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if s.Mode == ModeReview {
		if a, err := latestAttempt(ctx, db, s.WorkspaceID, p.ID); err == nil {
			return a.Source, nil
		}
	}
	return p.Starter["index.js"], nil
}

func recordAttempt(ctx context.Context, db DB, s Session, stage int, source string, passed, total int, cleared bool) error {
	if _, err := db.Exec(ctx, `insert into mc_attempts (session_id, stage, source, passed, total) values ($1, $2, $3, $4, $5)`, s.ID, stage, source, passed, total); err != nil {
		return err
	}
	if cleared {
		_, err := db.Exec(ctx, `update mc_sessions set stage_reached = greatest(stage_reached, $2) where id = $1`, s.ID, stage)
		return err
	}
	return nil
}

func finish(ctx context.Context, db DB, id string) error {
	_, err := db.Exec(ctx, `update mc_sessions set finished_at = coalesce(finished_at, now()) where id = $1`, id)
	return err
}

func hasAttempt(ctx context.Context, db DB, sessionID string, stage int) (bool, error) {
	var ok bool
	err := db.QueryRow(ctx, `select exists (select 1 from mc_attempts where session_id = $1 and ($2 = 0 or stage = $2))`, sessionID, stage).Scan(&ok)
	return ok, err
}

func stageParam(s string) int {
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0
	}
	return n
}
