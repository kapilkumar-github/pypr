package mcq

import (
	"context"
	"errors"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"pypr/backend/internal/workspace"
)

type DB = workspace.DB

var errNotFound = pgx.ErrNoRows

// errClosed: the test is finished or its time is up.
var errClosed = errors.New("test closed")

func isNotFound(err error) bool {
	var pgErr *pgconn.PgError
	return errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == "22P02")
}

func ownsWorkspace(ctx context.Context, db DB, userID, id string) error {
	var x int
	return db.QueryRow(ctx, `select 1 from workspaces where id = $1 and user_id = $2`, id, userID).Scan(&x)
}

// TopicInfo is a topic with what the workspace's user has done in it.
type TopicInfo struct {
	Topic
	Selected      bool `json:"selected"`
	QuestionCount int  `json:"questionCount"`
	// UnseenCount: questions this person has never been asked in any of their tests.
	UnseenCount int  `json:"unseenCount"`
	Attempts    int  `json:"attempts"`
	BestPercent *int `json:"bestPercent"`
	// CodeCounts: coding problems for this topic by kind ("machine_coding", "dsa").
	CodeCounts map[string]int `json:"codeCounts"`
}

func topics(ctx context.Context, db DB, userID, workspaceID string, selected []string) ([]TopicInfo, error) {
	rows, err := db.Query(ctx,
		`select t.key, t.name, t.area, t.description,
		        (select count(*) from mcq_questions q where q.topic_key = t.key)::int,
		        (select count(*) from mcq_questions q where q.topic_key = t.key and not exists (
		           select 1 from mcq_test_questions tq join mcq_tests mt on mt.id = tq.test_id
		           join workspaces w on w.id = mt.workspace_id where tq.question_id = q.id and w.user_id = $1))::int,
		        (select count(*) from mcq_tests mt where mt.workspace_id = $2 and mt.topic_key = t.key and mt.submitted_at is not null)::int,
		        (select max(mt.score * 100 / mt.question_count) from mcq_tests mt
		          where mt.workspace_id = $2 and mt.topic_key = t.key and mt.submitted_at is not null)
		 from mcq_topics t order by t.position`, userID, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TopicInfo{}
	for rows.Next() {
		var t TopicInfo
		if err := rows.Scan(&t.Key, &t.Name, &t.Area, &t.Description, &t.QuestionCount, &t.UnseenCount, &t.Attempts, &t.BestPercent); err != nil {
			return nil, err
		}
		for _, k := range selected {
			t.Selected = t.Selected || k == t.Key
		}
		t.CodeCounts = map[string]int{}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	crows, err := db.Query(ctx, `select topic_key, kind, count(*)::int from code_problems group by topic_key, kind`)
	if err != nil {
		return nil, err
	}
	defer crows.Close()
	for crows.Next() {
		var key, kind string
		var n int
		if err := crows.Scan(&key, &kind, &n); err != nil {
			return nil, err
		}
		for i := range out {
			if out[i].Key == key {
				out[i].CodeCounts[kind] = n
			}
		}
	}
	return out, crows.Err()
}

// closeExpired finishes the workspace's tests whose time is up, scoring what was answered.
func closeExpired(ctx context.Context, db DB, workspaceID string) error {
	_, err := db.Exec(ctx,
		`update mcq_tests t set submitted_at = t.deadline,
		        score = (select count(*) from mcq_test_questions tq join mcq_questions q on q.id = tq.question_id
		                 where tq.test_id = t.id and tq.selected = q.answer)
		 where t.workspace_id = $1 and t.submitted_at is null
		   and (t.deadline <= now() or t.left_at < now() - interval '15 seconds')`, workspaceID)
	return err
}

const (
	minQuestions = 5
	maxQuestions = 200
	minMinutes   = 5
	maxMinutes   = 180
)

// Options for a new test, checked by the handler.
type StartInput struct {
	Topic           string `json:"topic"`
	Questions       int    `json:"questions"`
	DurationMinutes int    `json:"durationMinutes"`
}

var errTooFew = errors.New("not enough questions")

type tooFewError struct{ available int }

func (e tooFewError) Error() string { return errTooFew.Error() }

// createTest picks questions the person has not seen first, then the ones seen longest ago.
func createTest(ctx context.Context, tx pgx.Tx, userID, workspaceID string, in StartInput) (string, error) {
	rows, err := tx.Query(ctx,
		`select q.id from mcq_questions q
		 left join lateral (
		   select max(mt.started_at) as last from mcq_test_questions tq
		   join mcq_tests mt on mt.id = tq.test_id join workspaces w on w.id = mt.workspace_id
		   where tq.question_id = q.id and w.user_id = $2) s on true
		 where q.topic_key = $1
		 order by s.last asc nulls first, random() limit $3`, in.Topic, userID, in.Questions)
	if err != nil {
		return "", err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return "", err
	}
	if len(ids) < in.Questions {
		return "", tooFewError{len(ids)}
	}
	rand.Shuffle(len(ids), func(i, j int) { ids[i], ids[j] = ids[j], ids[i] })
	seconds := in.DurationMinutes * 60
	var id string
	err = tx.QueryRow(ctx,
		`insert into mcq_tests (workspace_id, topic_key, question_count, duration_seconds, deadline)
		 values ($1, $2, $3, $4, now() + ($4::int * interval '1 second')) returning id`,
		workspaceID, in.Topic, len(ids), seconds).Scan(&id)
	if err != nil {
		return "", err
	}
	for i, q := range ids {
		if _, err := tx.Exec(ctx, `insert into mcq_test_questions (test_id, position, question_id) values ($1, $2, $3)`, id, i, q); err != nil {
			return "", err
		}
	}
	return id, nil
}

// Summary is one row of the results list.
type Summary struct {
	ID              string     `json:"id"`
	Topic           string     `json:"topic"`
	TopicName       string     `json:"topicName"`
	Questions       int        `json:"questions"`
	DurationSeconds int        `json:"durationSeconds"`
	StartedAt       time.Time  `json:"startedAt"`
	Deadline        time.Time  `json:"deadline"`
	SubmittedAt     *time.Time `json:"submittedAt"`
	Score           *int       `json:"score"`
}

func listTests(ctx context.Context, db DB, workspaceID string) ([]Summary, error) {
	rows, err := db.Query(ctx,
		`select t.id, t.topic_key, p.name, t.question_count, t.duration_seconds, t.started_at, t.deadline, t.submitted_at, t.score
		 from mcq_tests t join mcq_topics p on p.key = t.topic_key
		 where t.workspace_id = $1 order by t.started_at desc limit 200`, workspaceID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Summary])
}

// QuestionView is a test question. The answer and explanation appear only once the test is finished.
type QuestionView struct {
	Position    int      `json:"position"`
	Question    string   `json:"question"`
	Options     []string `json:"options"`
	Selected    *int     `json:"selected"`
	Marked      bool     `json:"marked"`
	Difficulty  string   `json:"difficulty"`
	Answer      *int     `json:"answer,omitempty"`
	Correct     *bool    `json:"correct,omitempty"`
	Explanation *string  `json:"explanation,omitempty"`
}

type Test struct {
	Summary
	Finished    bool           `json:"finished"`
	ChatEnabled bool           `json:"chatEnabled"`
	ServerTime  time.Time      `json:"serverTime"`
	Items       []QuestionView `json:"items"`
}

func getTest(ctx context.Context, db DB, workspaceID, id string) (Test, error) {
	var t Test
	err := db.QueryRow(ctx,
		`select t.id, t.topic_key, p.name, t.question_count, t.duration_seconds, t.started_at, t.deadline, t.submitted_at, t.score, now()
		 from mcq_tests t join mcq_topics p on p.key = t.topic_key where t.id = $1 and t.workspace_id = $2`, id, workspaceID).
		Scan(&t.ID, &t.Topic, &t.TopicName, &t.Questions, &t.DurationSeconds, &t.StartedAt, &t.Deadline, &t.SubmittedAt, &t.Score, &t.ServerTime)
	if err != nil {
		return t, err
	}
	t.Finished = t.SubmittedAt != nil
	rows, err := db.Query(ctx,
		`select tq.position, q.question, q.options, tq.selected, tq.marked, q.difficulty, q.answer, q.explanation
		 from mcq_test_questions tq join mcq_questions q on q.id = tq.question_id
		 where tq.test_id = $1 order by tq.position`, id)
	if err != nil {
		return t, err
	}
	defer rows.Close()
	for rows.Next() {
		var v QuestionView
		var answer int
		var explanation string
		if err := rows.Scan(&v.Position, &v.Question, &v.Options, &v.Selected, &v.Marked, &v.Difficulty, &answer, &explanation); err != nil {
			return t, err
		}
		if t.Finished {
			correct := v.Selected != nil && *v.Selected == answer
			v.Answer, v.Correct, v.Explanation = &answer, &correct, &explanation
		}
		t.Items = append(t.Items, v)
	}
	return t, rows.Err()
}

func saveAnswer(ctx context.Context, db DB, workspaceID, id string, position int, selected *int) error {
	tag, err := db.Exec(ctx,
		`update mcq_test_questions tq set selected = $4 from mcq_tests t
		 where tq.test_id = t.id and t.id = $1 and t.workspace_id = $2 and tq.position = $3
		   and t.submitted_at is null and t.deadline > now()`, id, workspaceID, position, selected)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	return errClosedOrMissing(ctx, db, workspaceID, id)
}

// submit finishes a test now. It does nothing if the test is already finished.
func submit(ctx context.Context, db DB, workspaceID, id string) error {
	tag, err := db.Exec(ctx,
		`update mcq_tests t set submitted_at = least(now(), t.deadline),
		        score = (select count(*) from mcq_test_questions tq join mcq_questions q on q.id = tq.question_id
		                 where tq.test_id = t.id and tq.selected = q.answer)
		 where t.id = $1 and t.workspace_id = $2 and t.submitted_at is null`, id, workspaceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var x int
	return db.QueryRow(ctx, `select 1 from mcq_tests where id = $1 and workspace_id = $2`, id, workspaceID).Scan(&x)
}

// setMark flags a question for review. Allowed only while the test is open.
func setMark(ctx context.Context, db DB, workspaceID, id string, position int, marked bool) error {
	tag, err := db.Exec(ctx,
		`update mcq_test_questions tq set marked = $4 from mcq_tests t
		 where tq.test_id = t.id and t.id = $1 and t.workspace_id = $2 and tq.position = $3
		   and t.submitted_at is null and t.deadline > now()`, id, workspaceID, position, marked)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	return errClosedOrMissing(ctx, db, workspaceID, id)
}

func errClosedOrMissing(ctx context.Context, db DB, workspaceID, id string) error {
	var open bool
	if err := db.QueryRow(ctx,
		`select t.submitted_at is null and t.deadline > now() from mcq_tests t where t.id = $1 and t.workspace_id = $2`, id, workspaceID).Scan(&open); err != nil {
		return err
	}
	if !open {
		return errClosed
	}
	return errNotFound
}

// markLeft records that the test tab was closed. The test is submitted after a grace period unless it is opened again.
func markLeft(ctx context.Context, db DB, workspaceID, id string) error {
	_, err := db.Exec(ctx, `update mcq_tests set left_at = now() where id = $1 and workspace_id = $2 and submitted_at is null`, id, workspaceID)
	return err
}

func cancelLeave(ctx context.Context, db DB, workspaceID, id string) error {
	_, err := db.Exec(ctx, `update mcq_tests set left_at = null where id = $1 and workspace_id = $2 and submitted_at is null`, id, workspaceID)
	return err
}
