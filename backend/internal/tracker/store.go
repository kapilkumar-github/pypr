package tracker

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// DB is a pool or a transaction.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

var (
	// errNotFound covers missing rows, other users' rows and malformed IDs alike.
	errNotFound = pgx.ErrNoRows
	// errForeignResume: the resume doesn't exist or belongs to someone else.
	errForeignResume = errors.New("foreign resume")
	// errNeedsConfirmation: moving to applied for the first time goes through confirmApply.
	errNeedsConfirmation = errors.New("apply confirmation required")
	// errAlreadySubmitted: the application's submitted resume is already recorded.
	errAlreadySubmitted = errors.New("already submitted")
	// errNotApplied: a resume added after applying needs an application first.
	errNotApplied = errors.New("not applied")
	// errAppliedAtRequired: the applied date can be corrected but not removed.
	errAppliedAtRequired = errors.New("applied date required")
)

func isNotFound(err error) bool {
	var pgErr *pgconn.PgError
	return errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == "22P02")
}

const jobColumns = `j.id, j.company, j.title, j.location, j.work_arrangement, j.employment_type, j.discovery_url,
	j.application_url, j.portal_url, j.application_ref, j.source, j.external_id, j.salary_min::float8,
	j.salary_max::float8, j.salary_currency, j.salary_period, j.status, j.applied_at, j.resume_id, r.title,
	j.next_action, to_char(j.next_action_due, 'YYYY-MM-DD'), j.next_action_done_at, j.created_at, j.updated_at`

func scanJob(row pgx.Row, extra ...any) (Job, error) {
	var j Job
	err := row.Scan(append([]any{&j.ID, &j.Company, &j.Title, &j.Location, &j.WorkArrangement, &j.EmploymentType,
		&j.DiscoveryURL, &j.ApplicationURL, &j.PortalURL, &j.ApplicationRef, &j.Source, &j.ExternalID,
		&j.SalaryMin, &j.SalaryMax, &j.SalaryCurrency, &j.SalaryPeriod, &j.Status, &j.AppliedAt, &j.ResumeID,
		&j.ResumeTitle, &j.NextAction.Text, &j.NextAction.Due, &j.NextAction.DoneAt, &j.CreatedAt, &j.UpdatedAt}, extra...)...)
	return j, err
}

// ListQuery filters and orders a user's jobs.
type ListQuery struct {
	Search      string
	Statuses    []string
	Sources     []string
	Arrangement []string
	Sort        string // updated (default), created, applied
	Limit       int
	Offset      int
}

type Page struct {
	Items []Job `json:"items"`
	Total int   `json:"total"`
	// Offset of the next page, null on the last one.
	Next *int `json:"next"`
}

var sortOrders = map[string]string{
	"updated": "j.updated_at desc, j.id",
	"created": "j.created_at desc, j.id",
	"applied": "j.applied_at desc nulls last, j.updated_at desc, j.id",
}

func listJobs(ctx context.Context, db DB, userID string, q ListQuery) (Page, error) {
	order, ok := sortOrders[q.Sort]
	if !ok {
		order = sortOrders["updated"]
	}
	where := []string{"j.user_id = $1"}
	args := []any{userID}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if s := strings.TrimSpace(q.Search); s != "" {
		like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(s) + "%"
		add("(j.company ilike $%[1]d or j.title ilike $%[1]d)", like)
	}
	if len(q.Statuses) > 0 {
		add("j.status = any($%d)", q.Statuses)
	}
	if len(q.Sources) > 0 {
		add("j.source = any($%d)", q.Sources)
	}
	if len(q.Arrangement) > 0 {
		add("j.work_arrangement = any($%d)", q.Arrangement)
	}
	args = append(args, q.Limit, q.Offset)
	p := Page{Items: []Job{}}
	rows, err := db.Query(ctx, fmt.Sprintf(
		`select %s, count(*) over ()
		 from tracked_jobs j left join resumes r on r.id = j.resume_id
		 where %s order by %s limit $%d offset $%d`,
		jobColumns, strings.Join(where, " and "), order, len(args)-1, len(args)), args...)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()
	for rows.Next() {
		j, err := scanJob(rows, &p.Total)
		if err != nil {
			return Page{}, err
		}
		p.Items = append(p.Items, j)
	}
	if err := rows.Err(); err != nil {
		return Page{}, err
	}
	if len(p.Items) == 0 && q.Offset > 0 {
		// Past the end: count separately so the client still learns the total.
		if err := db.QueryRow(ctx, `select count(*) from tracked_jobs j where `+strings.Join(where, " and "),
			args[:len(args)-2]...).Scan(&p.Total); err != nil {
			return Page{}, err
		}
	}
	if next := q.Offset + len(p.Items); next < p.Total {
		p.Next = &next
	}
	return p, nil
}

// loadDetail returns userID's job with its history, resumes, notes and interviews.
func loadDetail(ctx context.Context, db DB, userID, id string) (Detail, error) {
	var d Detail
	j, err := scanJob(db.QueryRow(ctx,
		`select `+jobColumns+`, j.description
		 from tracked_jobs j left join resumes r on r.id = j.resume_id
		 where j.id = $1 and j.user_id = $2`, id, userID), &d.Description)
	if err != nil {
		return d, err
	}
	d.Job = j
	rows, err := db.Query(ctx,
		`select id, from_status, to_status, created_at from job_status_events where job_id = $1 order by created_at, id`, id)
	if err != nil {
		return d, err
	}
	if d.History, err = pgx.CollectRows(rows, pgx.RowToStructByPos[StatusEvent]); err != nil {
		return d, err
	}
	rows, err = db.Query(ctx,
		`select id, kind, at_submission, resume_id, title, label, null::jsonb, created_at
		 from job_resume_snapshots where job_id = $1 order by created_at, id`, id)
	if err != nil {
		return d, err
	}
	if d.Resumes, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Snapshot]); err != nil {
		return d, err
	}
	rows, err = db.Query(ctx,
		`select id, body, created_at, updated_at from job_notes where job_id = $1 order by created_at desc, id`, id)
	if err != nil {
		return d, err
	}
	if d.Notes, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Note]); err != nil {
		return d, err
	}
	rows, err = db.Query(ctx,
		`select id, round, scheduled_at, timezone, meeting_url, notes, created_at, updated_at
		 from job_interviews where job_id = $1 order by scheduled_at nulls last, created_at`, id)
	if err != nil {
		return d, err
	}
	d.Interviews, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Interview])
	return d, err
}

// lockJob locks userID's job for a change and returns its status and applied date.
func lockJob(ctx context.Context, tx pgx.Tx, userID, id string) (status string, appliedAt *time.Time, err error) {
	err = tx.QueryRow(ctx, `select status, applied_at from tracked_jobs where id = $1 and user_id = $2 for update`, id, userID).
		Scan(&status, &appliedAt)
	return status, appliedAt, err
}

func touch(ctx context.Context, tx pgx.Tx, id string) error {
	_, err := tx.Exec(ctx, `update tracked_jobs set updated_at = now() where id = $1`, id)
	return err
}

// checkResume confirms resumeID is one of userID's resumes.
func checkResume(ctx context.Context, db DB, userID string, resumeID *string) error {
	if resumeID == nil {
		return nil
	}
	var x int
	err := db.QueryRow(ctx, `select 1 from resumes where id = $1 and user_id = $2`, *resumeID, userID).Scan(&x)
	if isNotFound(err) {
		return errForeignResume
	}
	return err
}

func createJob(ctx context.Context, tx pgx.Tx, userID string, in JobInput) (string, error) {
	if err := checkResume(ctx, tx, userID, in.ResumeID); err != nil {
		return "", err
	}
	var id string
	err := tx.QueryRow(ctx,
		`insert into tracked_jobs (user_id, company, title, location, work_arrangement, employment_type, discovery_url,
		   application_url, portal_url, application_ref, source, external_id, description, salary_min, salary_max,
		   salary_currency, salary_period, status, resume_id, url_keys, match_key, client_key)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
		 returning id`,
		userID, in.Company, in.Title, in.Location, in.WorkArrangement, in.EmploymentType, in.DiscoveryURL,
		in.ApplicationURL, in.PortalURL, in.ApplicationRef, in.Source, in.ExternalID, in.Description, in.SalaryMin,
		in.SalaryMax, in.SalaryCurrency, in.SalaryPeriod, in.Status, in.ResumeID,
		urlKeys(in.DiscoveryURL, in.ApplicationURL), matchKey(in.Company, in.Title), in.ClientKey).Scan(&id)
	if err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `insert into job_status_events (job_id, to_status) values ($1, $2)`, id, in.Status); err != nil {
		return "", err
	}
	if in.Note != "" {
		if _, err := tx.Exec(ctx, `insert into job_notes (job_id, body) values ($1, $2)`, id, in.Note); err != nil {
			return "", err
		}
	}
	return id, nil
}

// updateJob replaces the editable fields. The applied date may be corrected, never cleared.
func updateJob(ctx context.Context, tx pgx.Tx, userID, id string, in JobInput) error {
	_, appliedAt, err := lockJob(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	if appliedAt != nil && in.AppliedAt == nil {
		return errAppliedAtRequired
	}
	if err := checkResume(ctx, tx, userID, in.ResumeID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`update tracked_jobs set company = $3, title = $4, location = $5, work_arrangement = $6, employment_type = $7,
		   discovery_url = $8, application_url = $9, portal_url = $10, application_ref = $11, source = $12,
		   external_id = $13, description = $14, salary_min = $15, salary_max = $16, salary_currency = $17,
		   salary_period = $18, resume_id = $19, applied_at = $20, url_keys = $21, match_key = $22, updated_at = now()
		 where id = $1 and user_id = $2`,
		id, userID, in.Company, in.Title, in.Location, in.WorkArrangement, in.EmploymentType, in.DiscoveryURL,
		in.ApplicationURL, in.PortalURL, in.ApplicationRef, in.Source, in.ExternalID, in.Description, in.SalaryMin,
		in.SalaryMax, in.SalaryCurrency, in.SalaryPeriod, in.ResumeID, in.AppliedAt,
		urlKeys(in.DiscoveryURL, in.ApplicationURL), matchKey(in.Company, in.Title))
	return err
}

// setStatus moves a job to any status and records the change. The first move to applied must go
// through confirmApply so the submitted resume is recorded with it.
func setStatus(ctx context.Context, tx pgx.Tx, userID, id, status string) error {
	from, appliedAt, err := lockJob(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	if status == "applied" && appliedAt == nil {
		return errNeedsConfirmation
	}
	return changeStatus(ctx, tx, id, from, status)
}

func changeStatus(ctx context.Context, tx pgx.Tx, id, from, to string) error {
	if from == to {
		return touch(ctx, tx, id)
	}
	if _, err := tx.Exec(ctx, `update tracked_jobs set status = $2, updated_at = now() where id = $1`, id, to); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `insert into job_status_events (job_id, from_status, to_status) values ($1, $2, $3)`, id, from, to)
	return err
}

// ResumeChoice says which resume went with an application.
type ResumeChoice struct {
	Kind     string  `json:"kind"` // pypr, external, none
	ResumeID *string `json:"resumeId"`
	Label    string  `json:"label"`
}

func (c *ResumeChoice) validate() map[string]string {
	c.Label = cleanLine(c.Label)
	switch {
	case c.Kind == "pypr" && (c.ResumeID == nil || *c.ResumeID == ""):
		return map[string]string{"resumeId": "Choose one of your resumes."}
	case c.Kind == "external":
		if c.Label == "" || len([]rune(c.Label)) > 200 {
			return map[string]string{"label": "Name the resume you used, like the file name (up to 200 characters)."}
		}
		c.ResumeID = nil
	case c.Kind == "none":
		c.ResumeID, c.Label = nil, ""
	case c.Kind != "pypr":
		return map[string]string{"kind": "Choose a Pypr resume, another resume, or none."}
	}
	return nil
}

// addSnapshot records a resume for the application. A Pypr resume is copied as it is right now.
func addSnapshot(ctx context.Context, tx pgx.Tx, userID, jobID string, c ResumeChoice, atSubmission bool) error {
	if c.Kind != "pypr" {
		_, err := tx.Exec(ctx,
			`insert into job_resume_snapshots (job_id, kind, at_submission, label) values ($1, $2, $3, $4)`,
			jobID, c.Kind, atSubmission, c.Label)
		return err
	}
	tag, err := tx.Exec(ctx,
		`insert into job_resume_snapshots (job_id, kind, at_submission, resume_id, title, data)
		 select $1, 'pypr', $2, r.id, r.title, r.data from resumes r where r.id = $3 and r.user_id = $4`,
		jobID, atSubmission, *c.ResumeID, userID)
	if isNotFound(err) || (err == nil && tag.RowsAffected() == 0) {
		return errForeignResume
	}
	return err
}

// ApplyInput confirms the user submitted the application on the employer's site.
type ApplyInput struct {
	// When it was submitted; now when omitted.
	AppliedAt *time.Time   `json:"appliedAt"`
	Resume    ResumeChoice `json:"resume"`
}

// confirmApply records the submission in one transaction: the applied date (kept when already set),
// the resume snapshot, and the move to applied when the job hadn't progressed past it.
func confirmApply(ctx context.Context, tx pgx.Tx, userID, id string, in ApplyInput) error {
	from, appliedAt, err := lockJob(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	var exists bool
	if err := tx.QueryRow(ctx, `select exists (select 1 from job_resume_snapshots where job_id = $1 and at_submission)`, id).
		Scan(&exists); err != nil {
		return err
	}
	if exists {
		return errAlreadySubmitted
	}
	if err := addSnapshot(ctx, tx, userID, id, in.Resume, true); err != nil {
		return err
	}
	when := in.AppliedAt
	if when == nil {
		when = appliedAt
	}
	if _, err := tx.Exec(ctx,
		`update tracked_jobs set applied_at = coalesce($2, applied_at, now()),
		   resume_id = coalesce($3, resume_id), updated_at = now() where id = $1`,
		id, when, in.Resume.ResumeID); err != nil {
		return err
	}
	if from == "saved" || from == "preparing" {
		return changeStatus(ctx, tx, id, from, "applied")
	}
	return nil
}

// attachResume records a resume after the application was submitted. It is labelled as added later.
func attachResume(ctx context.Context, tx pgx.Tx, userID, id string, c ResumeChoice) error {
	_, appliedAt, err := lockJob(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	if appliedAt == nil {
		return errNotApplied
	}
	if err := addSnapshot(ctx, tx, userID, id, c, false); err != nil {
		return err
	}
	return touch(ctx, tx, id)
}

// snapshot returns one resume snapshot with its data, scoped to userID's job.
func snapshot(ctx context.Context, db DB, userID, jobID, id string) (Snapshot, error) {
	var s Snapshot
	err := db.QueryRow(ctx,
		`select s.id, s.kind, s.at_submission, s.resume_id, s.title, s.label, s.data, s.created_at
		 from job_resume_snapshots s join tracked_jobs j on j.id = s.job_id
		 where s.id = $1 and s.job_id = $2 and j.user_id = $3`, id, jobID, userID).
		Scan(&s.ID, &s.Kind, &s.AtSubmission, &s.ResumeID, &s.Title, &s.Label, &s.Data, &s.CreatedAt)
	return s, err
}

func validateNote(body string) (string, map[string]string) {
	body = cleanText(body)
	if body == "" || len([]rune(body)) > maxNote {
		return body, map[string]string{"body": "Write a note (up to 20,000 characters)."}
	}
	return body, nil
}

// InterviewInput is one interview round.
type InterviewInput struct {
	Round       string     `json:"round"`
	ScheduledAt *time.Time `json:"scheduledAt"`
	Timezone    string     `json:"timezone"`
	MeetingURL  string     `json:"meetingUrl"`
	Notes       string     `json:"notes"`
}

func (in *InterviewInput) validate() map[string]string {
	errs := map[string]string{}
	in.Round = cleanLine(in.Round)
	if in.Round == "" || len([]rune(in.Round)) > 200 {
		errs["round"] = "Name the round, like Recruiter screen (up to 200 characters)."
	}
	in.Timezone = strings.TrimSpace(in.Timezone)
	if in.Timezone != "" {
		if _, err := time.LoadLocation(in.Timezone); err != nil || in.Timezone == "Local" || len(in.Timezone) > 64 {
			errs["timezone"] = "Choose a time zone from the list."
		}
	}
	in.MeetingURL = strings.TrimSpace(in.MeetingURL)
	if in.MeetingURL != "" && !validURL(in.MeetingURL) {
		errs["meetingUrl"] = "Enter a full web address starting with https://."
	}
	in.Notes = cleanText(in.Notes)
	if len([]rune(in.Notes)) > maxNote {
		errs["notes"] = "Notes are limited to 20,000 characters."
	}
	return errs
}

// NextActionInput sets or clears the job's next action.
type NextActionInput struct {
	Text string  `json:"text"`
	Due  *string `json:"due"`
	Done bool    `json:"done"`
}

func (in *NextActionInput) validate() map[string]string {
	errs := map[string]string{}
	in.Text = cleanLine(in.Text)
	if len([]rune(in.Text)) > 300 {
		errs["text"] = "Use up to 300 characters."
	}
	if in.Due != nil && *in.Due == "" {
		in.Due = nil
	}
	if in.Due != nil {
		if _, err := time.Parse(time.DateOnly, *in.Due); err != nil {
			errs["due"] = "Enter a valid date."
		}
	}
	if in.Text == "" && in.Due != nil {
		errs["text"] = "Describe the next action."
	}
	return errs
}

func setNextAction(ctx context.Context, tx pgx.Tx, userID, id string, in NextActionInput) error {
	tag, err := tx.Exec(ctx,
		`update tracked_jobs set next_action = $3, next_action_due = $4::date,
		   next_action_done_at = case when not $5 or $3 = '' then null else coalesce(next_action_done_at, now()) end,
		   updated_at = now()
		 where id = $1 and user_id = $2`, id, userID, in.Text, in.Due, in.Done)
	if err == nil && tag.RowsAffected() == 0 {
		err = errNotFound
	}
	return err
}

// findDuplicates returns userID's jobs that may be the posting in q, strongest match first.
func findDuplicates(ctx context.Context, db DB, userID string, q DuplicateQuery) ([]Duplicate, error) {
	keys := urlKeys(q.DiscoveryURL, q.ApplicationURL)
	mk := matchKey(q.Company, q.Title)
	rows, err := db.Query(ctx,
		`select id, company, title, location, status, source, external_id, created_at, url_keys, match_key
		 from tracked_jobs
		 where user_id = $1 and id::text <> $2
		   and (url_keys && $3 or (source = $4 and external_id <> '' and lower(external_id) = lower($5)) or match_key = $6)
		 order by created_at desc limit 50`,
		userID, q.ExcludeID, keys, q.Source, q.ExternalID, mk)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Duplicate{}
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.ID, &c.Company, &c.Title, &c.Location, &c.Status, &c.Source, &c.ExternalID,
			&c.CreatedAt, &c.urlKeys, &c.matchKey); err != nil {
			return nil, err
		}
		if c.Reason = classify(q, keys, c); c.Reason != "" {
			out = append(out, c.Duplicate)
		}
	}
	slices.SortStableFunc(out, func(a, b Duplicate) int { return reasonRank[a.Reason] - reasonRank[b.Reason] })
	return out, rows.Err()
}
