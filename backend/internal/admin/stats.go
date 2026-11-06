package admin

import (
	"net/http"
	"time"
)

type Totals struct {
	Users         int `json:"users"`
	VerifiedUsers int `json:"verifiedUsers"`
	Resumes       int `json:"resumes"`
	PublicResumes int `json:"publicResumes"`
	Downloads     int `json:"downloads"`
	PublicViews   int `json:"publicViews"`
}

type Day struct {
	Date      string `json:"date"`
	Signups   int    `json:"signups"`
	Resumes   int    `json:"resumes"`
	Downloads int    `json:"downloads"`
}

type Signup struct {
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Verified  bool      `json:"verified"`
	CreatedAt time.Time `json:"createdAt"`
}

type Stats struct {
	Totals  Totals   `json:"totals"`
	Daily   []Day    `json:"daily"`
	Recent  []Signup `json:"recentSignups"`
	Updated string   `json:"updatedAt"`
}

const days = 30

func (h *Handler) load(r *http.Request) (Stats, error) {
	ctx := r.Context()
	var s Stats
	err := h.db.QueryRow(ctx, `
		select
		  (select count(*) from users),
		  (select count(*) from users where email_verified_at is not null),
		  (select count(*) from resumes),
		  (select count(*) from resumes where public),
		  (select count(*) from download_events),
		  (select coalesce(sum(views), 0) from resumes)`,
	).Scan(&s.Totals.Users, &s.Totals.VerifiedUsers, &s.Totals.Resumes, &s.Totals.PublicResumes, &s.Totals.Downloads, &s.Totals.PublicViews)
	if err != nil {
		return s, err
	}

	rows, err := h.db.Query(ctx, `
		with d as (select generate_series(current_date - ($1::int - 1), current_date, '1 day')::date as day)
		select to_char(d.day, 'YYYY-MM-DD'),
		  (select count(*) from users u where u.created_at::date = d.day),
		  (select count(*) from resumes x where x.created_at::date = d.day),
		  (select count(*) from download_events e where e.created_at::date = d.day)
		from d order by d.day`, days)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	s.Daily = []Day{}
	for rows.Next() {
		var d Day
		if err := rows.Scan(&d.Date, &d.Signups, &d.Resumes, &d.Downloads); err != nil {
			return s, err
		}
		s.Daily = append(s.Daily, d)
	}
	if err := rows.Err(); err != nil {
		return s, err
	}

	rec, err := h.db.Query(ctx, `
		select name, email, email_verified_at is not null, created_at
		from users order by created_at desc limit 10`)
	if err != nil {
		return s, err
	}
	defer rec.Close()
	s.Recent = []Signup{}
	for rec.Next() {
		var u Signup
		if err := rec.Scan(&u.Name, &u.Email, &u.Verified, &u.CreatedAt); err != nil {
			return s, err
		}
		s.Recent = append(s.Recent, u)
	}
	s.Updated = time.Now().UTC().Format(time.RFC3339)
	return s, rec.Err()
}
