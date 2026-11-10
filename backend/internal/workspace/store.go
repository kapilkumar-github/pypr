package workspace

import (
	"context"
	"encoding/json"
	"errors"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB is a pool or a transaction.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// errNotFound covers missing rows, other users' rows and malformed IDs alike.
var errNotFound = pgx.ErrNoRows

// errTargetReached: a count activity already has all its completions.
var errTargetReached = errors.New("target reached")

func isNotFound(err error) bool {
	var pgErr *pgconn.PgError
	return errors.Is(err, pgx.ErrNoRows) || (errors.As(err, &pgErr) && pgErr.Code == "22P02")
}

// Load returns userID's workspace with its resumes and skills. It is the shared context every
// workspace module reads; modules keep only their own data.
func Load(ctx context.Context, db DB, userID, id string) (Workspace, error) {
	var w Workspace
	err := db.QueryRow(ctx,
		`select id, name, target_role, seniority, track, years_experience, technologies, objectives,
		        job_description, modules, context_version, created_at, updated_at
		 from workspaces where id = $1 and user_id = $2`, id, userID).
		Scan(&w.ID, &w.Name, &w.TargetRole, &w.Seniority, &w.Track, &w.YearsExperience, &w.Technologies,
			&w.Objectives, &w.JobDescription, &w.Modules, &w.ContextVersion, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		return w, err
	}
	rows, err := db.Query(ctx,
		`select r.id, r.title from workspace_resumes wr join resumes r on r.id = wr.resume_id
		 where wr.workspace_id = $1 order by wr.created_at, r.title`, w.ID)
	if err != nil {
		return w, err
	}
	if w.Resumes, err = pgx.CollectRows(rows, pgx.RowToStructByPos[ResumeRef]); err != nil {
		return w, err
	}
	rows, err = db.Query(ctx,
		`select s.key, s.name, s.area, s.self_level, s.demonstrated_level
		 from workspace_skills ws join user_skills s on s.user_id = ws.user_id and s.key = ws.skill_key
		 where ws.workspace_id = $1 order by ws.position`, w.ID)
	if err != nil {
		return w, err
	}
	w.Skills, err = pgx.CollectRows(rows, pgx.RowToStructByPos[Skill])
	return w, err
}

// snapshot is the auditable part of the context.
type snapshot struct {
	Name            string   `json:"name"`
	TargetRole      string   `json:"targetRole"`
	Seniority       string   `json:"seniority"`
	Track           string   `json:"track"`
	YearsExperience *int     `json:"yearsExperience"`
	Technologies    []string `json:"technologies"`
	Objectives      string   `json:"objectives"`
	JobDescription  string   `json:"jobDescription"`
	Modules         []string `json:"modules"`
	ResumeIDs       []string `json:"resumeIds"`
	SkillKeys       []string `json:"skillKeys"`
}

func snapshotOf(w Workspace) snapshot {
	s := snapshot{w.Name, w.TargetRole, w.Seniority, w.Track, w.YearsExperience, w.Technologies,
		w.Objectives, w.JobDescription, w.Modules, []string{}, []string{}}
	for _, r := range w.Resumes {
		s.ResumeIDs = append(s.ResumeIDs, r.ID)
	}
	for _, k := range w.Skills {
		s.SkillKeys = append(s.SkillKeys, k.Key)
	}
	slices.Sort(s.ResumeIDs)
	return s
}

func create(ctx context.Context, tx pgx.Tx, userID string, in input) (string, error) {
	var id string
	err := tx.QueryRow(ctx,
		`insert into workspaces (user_id, name, target_role, seniority, track, years_experience, technologies,
		                         objectives, job_description, modules)
		 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
		userID, in.Name, in.TargetRole, in.Seniority, in.Track, in.YearsExperience, in.Technologies,
		in.Objectives, in.JobDescription, in.Modules).Scan(&id)
	if err != nil {
		return "", err
	}
	return id, saveLinks(ctx, tx, userID, id, in)
}

// update replaces the context. When it changed, the previous one is kept as a numbered version.
func update(ctx context.Context, tx pgx.Tx, userID, id string, in input) error {
	var x int
	if err := tx.QueryRow(ctx, `select 1 from workspaces where id = $1 and user_id = $2 for update`, id, userID).Scan(&x); err != nil {
		return err
	}
	before, err := Load(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`update workspaces set name = $3, target_role = $4, seniority = $5, track = $6, years_experience = $7,
		        technologies = $8, objectives = $9, job_description = $10, modules = $11, updated_at = now()
		 where id = $1 and user_id = $2`,
		id, userID, in.Name, in.TargetRole, in.Seniority, in.Track, in.YearsExperience, in.Technologies,
		in.Objectives, in.JobDescription, in.Modules); err != nil {
		return err
	}
	if err := saveLinks(ctx, tx, userID, id, in); err != nil {
		return err
	}
	after, err := Load(ctx, tx, userID, id)
	if err != nil {
		return err
	}
	old, _ := json.Marshal(snapshotOf(before))
	now, _ := json.Marshal(snapshotOf(after))
	if string(old) == string(now) {
		return nil
	}
	if _, err := tx.Exec(ctx,
		`insert into workspace_context_versions (workspace_id, version, context) values ($1, $2, $3)`,
		id, before.ContextVersion, old); err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`update workspaces set context_version = context_version + 1 where id = $1`, id)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`delete from workspace_context_versions where workspace_id = $1 and version <= $2 - 50`, id, before.ContextVersion)
	return err
}

// errForeignResume: a resume ID that isn't the user's.
var errForeignResume = errors.New("foreign resume")

// saveLinks replaces the workspace's resumes and focus skills. Skills are created in the user's
// shared knowledge if new; existing levels are kept.
func saveLinks(ctx context.Context, tx pgx.Tx, userID, id string, in input) error {
	if _, err := tx.Exec(ctx,
		`insert into workspace_resumes (workspace_id, resume_id)
		 select $1, r.id from resumes r where r.id = any($2::uuid[]) and r.user_id = $3
		 on conflict do nothing`, id, in.ResumeIDs, userID); err != nil {
		return err
	}
	var linked int
	if err := tx.QueryRow(ctx,
		`select count(*) from resumes where id = any($1::uuid[]) and user_id = $2`, in.ResumeIDs, userID).Scan(&linked); err != nil {
		return err
	}
	if linked != len(in.ResumeIDs) {
		return errForeignResume
	}
	if _, err := tx.Exec(ctx,
		`delete from workspace_resumes where workspace_id = $1 and not (resume_id = any($2::uuid[]))`, id, in.ResumeIDs); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `delete from workspace_skills where workspace_id = $1`, id); err != nil {
		return err
	}
	for i, s := range in.Skills {
		key := SkillKey(s.Name)
		if _, err := tx.Exec(ctx,
			`insert into user_skills (user_id, key, name, area) values ($1, $2, $3, $4)
			 on conflict (user_id, key) do update set area = coalesce(nullif(user_skills.area, ''), excluded.area)`,
			userID, key, s.Name, s.Area); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`insert into workspace_skills (workspace_id, user_id, skill_key, position) values ($1, $2, $3, $4)`,
			id, userID, key, i); err != nil {
			return err
		}
	}
	return nil
}

func list(ctx context.Context, db DB, userID string) ([]Summary, error) {
	rows, err := db.Query(ctx,
		`select w.id, w.name, w.target_role, w.seniority, w.technologies,
		        count(a.id)::int, (count(a.id) filter (where a.status = 'done'))::int, w.updated_at
		 from workspaces w left join prep_activities a on a.workspace_id = w.id
		 where w.user_id = $1 group by w.id order by w.updated_at desc`, userID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Summary])
}

// lockWorkspace checks ownership, marks the workspace as updated and holds its row until the
// transaction ends, so concurrent plan changes (positions, completions) run one at a time.
func lockWorkspace(ctx context.Context, tx pgx.Tx, userID, id string) error {
	var x int
	return tx.QueryRow(ctx,
		`update workspaces set updated_at = now() where id = $1 and user_id = $2 returning 1`, id, userID).Scan(&x)
}

func owns(ctx context.Context, db DB, userID, id string) error {
	var x int
	return db.QueryRow(ctx, `select 1 from workspaces where id = $1 and user_id = $2`, id, userID).Scan(&x)
}

const activityCols = `id, kind, title, description, priority, status, progress, target, checklist, skill_key,
	effort_minutes, to_char(due_date, 'YYYY-MM-DD'), criteria, position, completed_at, created_at, updated_at`

// activities returns the plan in order. The caller checks ownership.
func activities(ctx context.Context, db DB, workspaceID string) ([]Activity, error) {
	rows, err := db.Query(ctx, `select `+activityCols+` from prep_activities where workspace_id = $1 order by position, created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Activity, error) {
		var a Activity
		err := row.Scan(&a.ID, &a.Kind, &a.Title, &a.Description, &a.Priority, &a.Status, &a.Progress, &a.Target,
			&a.Checklist, &a.SkillKey, &a.Effort, &a.DueDate, &a.Criteria, &a.Position, &a.CompletedAt, &a.CreatedAt, &a.UpdatedAt)
		a.Completions = []Completion{}
		return a, err
	})
	if err != nil {
		return nil, err
	}
	rows, err = db.Query(ctx,
		`select c.activity_id, c.id, c.source, c.note, c.created_at
		 from activity_completions c join prep_activities a on a.id = c.activity_id
		 where a.workspace_id = $1 order by c.created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[string]*Activity{}
	for i := range out {
		byID[out[i].ID] = &out[i]
	}
	for rows.Next() {
		var activityID string
		var c Completion
		if err := rows.Scan(&activityID, &c.ID, &c.Source, &c.Note, &c.CreatedAt); err != nil {
			return nil, err
		}
		if a := byID[activityID]; a != nil {
			a.Completions = append(a.Completions, c)
			a.Completed++
		}
	}
	return out, rows.Err()
}

// addActivities appends to the plan. The workspace must be locked.
func addActivities(ctx context.Context, tx pgx.Tx, workspaceID string, ins []ActivityInput) error {
	var count, next int
	if err := tx.QueryRow(ctx,
		`select count(*), coalesce(max(position) + 1, 0) from prep_activities where workspace_id = $1`, workspaceID).
		Scan(&count, &next); err != nil {
		return err
	}
	if count+len(ins) > maxActivities {
		return errTooMany
	}
	for i, in := range ins {
		status := deriveStatus(in.Progress, in.Status, in.Target, 0, in.Checklist)
		if _, err := tx.Exec(ctx,
			`insert into prep_activities (workspace_id, kind, title, description, priority, status, progress, target,
			                             checklist, skill_key, effort_minutes, due_date, criteria, position, completed_at)
			 values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::date, $13, $14,
			         case when $6 = 'done' then now() end)`,
			workspaceID, in.Kind, in.Title, in.Description, in.Priority, status, in.Progress, in.Target,
			in.Checklist, in.SkillKey, in.Effort, in.DueDate, in.Criteria, next+i); err != nil {
			return err
		}
	}
	return nil
}

var errTooMany = errors.New("too many activities")

// updateActivity replaces an activity's fields and re-derives its status. The workspace must be locked.
func updateActivity(ctx context.Context, tx pgx.Tx, workspaceID, id string, in ActivityInput) error {
	var completed int
	if err := tx.QueryRow(ctx,
		`select (select count(*) from activity_completions where activity_id = a.id)::int
		 from prep_activities a where a.id = $1 and a.workspace_id = $2`, id, workspaceID).Scan(&completed); err != nil {
		return err
	}
	status := deriveStatus(in.Progress, in.Status, in.Target, completed, in.Checklist)
	_, err := tx.Exec(ctx,
		`update prep_activities set kind = $3, title = $4, description = $5, priority = $6, status = $7, progress = $8,
		        target = $9, checklist = $10, skill_key = $11, effort_minutes = $12, due_date = $13::date, criteria = $14,
		        completed_at = case when $7 = 'done' then coalesce(completed_at, now()) end, updated_at = now()
		 where id = $1 and workspace_id = $2`,
		id, workspaceID, in.Kind, in.Title, in.Description, in.Priority, status, in.Progress, in.Target,
		in.Checklist, in.SkillKey, in.Effort, in.DueDate, in.Criteria)
	return err
}

// addCompletion counts one completion toward a count activity and re-derives its status. A repeated
// (source, ref) is ignored and reported as not counted. The workspace must be locked.
func addCompletion(ctx context.Context, tx pgx.Tx, workspaceID, activityID, source, ref, note string) (bool, error) {
	var progress, status string
	var target *int
	var completed int
	if err := tx.QueryRow(ctx,
		`select progress, status, target, (select count(*) from activity_completions where activity_id = a.id)::int
		 from prep_activities a where a.id = $1 and a.workspace_id = $2`, activityID, workspaceID).
		Scan(&progress, &status, &target, &completed); err != nil {
		return false, err
	}
	if progress != "count" {
		return false, errNotCountable
	}
	if completed >= *target {
		return false, errTargetReached
	}
	tag, err := tx.Exec(ctx,
		`insert into activity_completions (activity_id, source, source_ref, note) values ($1, $2, nullif($3, ''), $4)
		 on conflict do nothing`, activityID, source, ref, note)
	if err != nil || tag.RowsAffected() == 0 {
		return false, err
	}
	return true, refreshStatus(ctx, tx, activityID, deriveStatus(progress, status, target, completed+1, nil))
}

var errNotCountable = errors.New("not a count activity")

// removeCompletion undoes a manual completion. The workspace must be locked.
func removeCompletion(ctx context.Context, tx pgx.Tx, workspaceID, activityID, completionID string) error {
	tag, err := tx.Exec(ctx,
		`delete from activity_completions c using prep_activities a
		 where c.id = $1 and c.activity_id = $2 and a.id = c.activity_id and a.workspace_id = $3 and c.source = 'manual'`,
		completionID, activityID, workspaceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errNotFound
	}
	var status string
	var target *int
	var completed int
	if err := tx.QueryRow(ctx,
		`select status, target, (select count(*) from activity_completions where activity_id = a.id)::int
		 from prep_activities a where a.id = $1`, activityID).Scan(&status, &target, &completed); err != nil {
		return err
	}
	if status == "done" {
		status = "in_progress"
	}
	return refreshStatus(ctx, tx, activityID, deriveStatus("count", status, target, completed, nil))
}

func refreshStatus(ctx context.Context, tx pgx.Tx, activityID, status string) error {
	_, err := tx.Exec(ctx,
		`update prep_activities set status = $2, updated_at = now(),
		        completed_at = case when $2 = 'done' then coalesce(completed_at, now()) end
		 where id = $1`, activityID, status)
	return err
}

// reorder sets the plan's order. ids must be exactly the plan's activities.
func reorder(ctx context.Context, tx pgx.Tx, workspaceID string, ids []string) error {
	var current []string
	if err := tx.QueryRow(ctx,
		`select coalesce(array_agg(id::text), '{}') from prep_activities where workspace_id = $1`, workspaceID).Scan(&current); err != nil {
		return err
	}
	want := slices.Clone(ids)
	slices.Sort(want)
	slices.Sort(current)
	if !slices.Equal(want, slices.Compact(slices.Clone(want))) || !slices.Equal(want, current) {
		return errOrderMismatch
	}
	_, err := tx.Exec(ctx,
		`update prep_activities a set position = o.ord - 1, updated_at = now()
		 from unnest($2::uuid[]) with ordinality as o(id, ord)
		 where a.id = o.id and a.workspace_id = $1`, workspaceID, ids)
	return err
}

var errOrderMismatch = errors.New("order mismatch")

// RecordCompletion lets a module (e.g. a future mock interview) count one finished session toward a
// count activity in userID's workspace. ref identifies the session: reporting it again counts
// nothing. It returns whether the completion was counted.
func RecordCompletion(ctx context.Context, pool *pgxpool.Pool, userID, workspaceID, activityID, source, ref string) (bool, error) {
	if source == "" || source == "manual" || ref == "" {
		return false, errors.New("workspace: RecordCompletion needs a module source and a session ref")
	}
	var counted bool
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if err := lockWorkspace(ctx, tx, userID, workspaceID); err != nil {
			return err
		}
		var err error
		counted, err = addCompletion(ctx, tx, workspaceID, activityID, source, ref, "")
		if errors.Is(err, errTargetReached) {
			return nil
		}
		return err
	})
	return counted, err
}
