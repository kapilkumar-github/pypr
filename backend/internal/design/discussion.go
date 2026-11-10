package design

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
)

const (
	maxChatChars     = 1500
	maxExplainChars  = 4000
	maxQuestionChars = 6000
	maxHistory       = 12
	maxThread        = 100
)

// Message is one entry of a board's discussion.
type Message struct {
	ID        string          `json:"id"`
	Role      string          `json:"role"`
	Kind      string          `json:"kind"`
	Content   string          `json:"content"`
	Result    json.RawMessage `json:"result,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
}

func thread(ctx context.Context, db interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}, board string) ([]Message, error) {
	rows, err := db.Query(ctx, `select id, role, kind, content, result, created_at from (
		select id, role, kind, content, result, created_at from design_messages where board_id = $1 order by created_at desc, id desc limit $2) m order by created_at, id`, board, maxThread)
	if err != nil {
		return nil, err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[Message])
	if out == nil {
		out = []Message{}
	}
	return out, err
}

// owned checks the board belongs to the caller's workspace and returns its saved document and title.
func (h *Handler) owned(w http.ResponseWriter, r *http.Request) (board, title string, doc []byte, ok bool) {
	ws, ok := h.workspace(w, r)
	if !ok {
		return "", "", nil, false
	}
	board = r.PathValue("bid")
	err := h.db.QueryRow(r.Context(), `select title, doc from design_boards where id = $1 and workspace_id = $2`, board, ws).Scan(&title, &doc)
	if h.failed(w, err) {
		return "", "", nil, false
	}
	return board, title, doc, true
}

func (h *Handler) messages(w http.ResponseWriter, r *http.Request) {
	board, _, _, ok := h.owned(w, r)
	if !ok {
		return
	}
	out, err := thread(r.Context(), h.db, board)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

type evalInput struct {
	// Requirement is the question text the learner sees; Reference is what a good answer states (hidden from the learner).
	Requirement string `json:"requirement"`
	Reference   string `json:"reference"`
	Explanation string `json:"explanation"`
}

func (in evalInput) validate() map[string]string {
	errs := map[string]string{}
	if len(in.Requirement) > maxQuestionChars || len(in.Reference) > maxQuestionChars {
		errs["requirement"] = "The question is too long."
	}
	if len([]rune(in.Explanation)) > maxExplainChars {
		errs["explanation"] = "Keep the description under 4000 characters."
	}
	return errs
}

func (h *Handler) input(title, requirement, reference, explanation string, doc []byte) EvalInput {
	q := strings.TrimSpace(requirement)
	if q == "" {
		q = title
	}
	return EvalInput{Question: q, Reference: strings.TrimSpace(reference), Design: text(doc), Explanation: strings.TrimSpace(explanation)}
}

func (h *Handler) ready(w http.ResponseWriter, r *http.Request, limit *httpx.Limiter) bool {
	if h.ai == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "ai_unavailable", "The interviewer isn't available right now.")
		return false
	}
	if !limit.Allow(auth.UserFrom(r.Context()).ID) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "You are asking too often. Try again later.")
		return false
	}
	return true
}

func (h *Handler) add(ctx context.Context, board, role, kind, content string, result any) (Message, error) {
	var raw []byte
	if result != nil {
		raw, _ = json.Marshal(result)
	}
	m := Message{Role: role, Kind: kind, Content: content}
	var res []byte
	err := h.db.QueryRow(ctx, `insert into design_messages (board_id, role, kind, content, result) values ($1, $2, $3, $4, $5) returning id, created_at, result`,
		board, role, kind, content, raw).Scan(&m.ID, &m.CreatedAt, &res)
	m.Result = res
	return m, err
}

// evaluate checks the saved board (and the learner's description, if any) against the question and asks follow-ups.
func (h *Handler) evaluate(w http.ResponseWriter, r *http.Request) {
	board, title, doc, ok := h.owned(w, r)
	if !ok {
		return
	}
	var in evalInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if errs := in.validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return
	}
	if !h.ready(w, r, h.evals) {
		return
	}
	ev, err := h.ai.Evaluate(r.Context(), h.input(title, in.Requirement, in.Reference, in.Explanation, doc))
	if err != nil {
		h.log.Error("design evaluation", "err", err)
		httpx.WriteError(w, http.StatusBadGateway, "ai_failed", "The interviewer couldn't evaluate the design. Try again.")
		return
	}
	var out []Message
	if x := strings.TrimSpace(in.Explanation); x != "" {
		m, err := h.add(r.Context(), board, "user", "explanation", x, nil)
		if h.failed(w, err) {
			return
		}
		out = append(out, m)
	}
	m, err := h.add(r.Context(), board, "assistant", "evaluation", summaryText(ev), ev)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, append(out, m))
}

// summaryText is what later chat turns see of an evaluation: the summary, the gaps and the open follow-up questions.
func summaryText(e Evaluation) string {
	var b strings.Builder
	b.WriteString(e.Summary)
	if len(e.Gaps) > 0 {
		b.WriteString("\nGaps: " + strings.Join(e.Gaps, "; "))
	}
	if len(e.Followups) > 0 {
		b.WriteString("\nFollow-up questions: " + strings.Join(e.Followups, " "))
	}
	return b.String()
}

type chatInput struct {
	Message     string `json:"message"`
	Requirement string `json:"requirement"`
	Reference   string `json:"reference"`
}

// chat answers one message in the discussion. Off-topic messages get a fixed refusal and are not stored.
func (h *Handler) chat(w http.ResponseWriter, r *http.Request) {
	board, title, doc, ok := h.owned(w, r)
	if !ok {
		return
	}
	var in chatInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	msg := strings.TrimSpace(in.Message)
	if msg == "" || len([]rune(msg)) > maxChatChars {
		httpx.WriteValidation(w, map[string]string{"message": "Write a message (1500 characters at most)."})
		return
	}
	if errs := (evalInput{Requirement: in.Requirement, Reference: in.Reference}).validate(); len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return
	}
	if !h.ready(w, r, h.chats) {
		return
	}
	prev, err := thread(r.Context(), h.db, board)
	if h.failed(w, err) {
		return
	}
	var turns []Turn
	for _, m := range prev[max(0, len(prev)-maxHistory):] {
		turns = append(turns, Turn{Role: m.Role, Content: m.Content})
	}
	reply, onTopic, err := h.ai.Chat(r.Context(), h.input(title, in.Requirement, in.Reference, "", doc), turns, msg)
	if err != nil {
		h.log.Error("design chat", "err", err)
		httpx.WriteError(w, http.StatusBadGateway, "ai_failed", "The interviewer couldn't answer. Try again.")
		return
	}
	if !onTopic {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "off_topic", "I can only discuss this design and its question.")
		return
	}
	asked, err := h.add(r.Context(), board, "user", "chat", msg, nil)
	if h.failed(w, err) {
		return
	}
	answer, err := h.add(r.Context(), board, "assistant", "chat", reply, nil)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, []Message{asked, answer})
}
