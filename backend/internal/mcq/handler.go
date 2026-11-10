package mcq

import (
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pypr/backend/internal/auth"
	"pypr/backend/internal/httpx"
	"pypr/backend/internal/workspace"
)

type Handler struct {
	db    *pgxpool.Pool
	log   *slog.Logger
	tutor Generator // nil when AI is off: the review chat is then hidden
	chat  *httpx.Limiter
}

func NewHandler(db *pgxpool.Pool, log *slog.Logger, tutor Generator) *Handler {
	return &Handler{db: db, log: log, tutor: tutor, chat: httpx.NewLimiter(60, time.Hour)}
}

// Register adds the routes. Everything is scoped to a workspace the caller owns.
func (h *Handler) Register(mux *http.ServeMux, requireUser, requireVerified func(http.Handler) http.Handler) {
	mux.Handle("GET /api/workspaces/{id}/mcq/topics", requireUser(http.HandlerFunc(h.topics)))
	mux.Handle("GET /api/workspaces/{id}/mcq/tests", requireUser(http.HandlerFunc(h.list)))
	mux.Handle("GET /api/workspaces/{id}/mcq/tests/{tid}", requireUser(http.HandlerFunc(h.get)))
	mux.Handle("POST /api/workspaces/{id}/mcq/tests", requireVerified(http.HandlerFunc(h.start)))
	mux.Handle("PUT /api/workspaces/{id}/mcq/tests/{tid}/answers", requireVerified(http.HandlerFunc(h.answer)))
	mux.Handle("PUT /api/workspaces/{id}/mcq/tests/{tid}/marks", requireVerified(http.HandlerFunc(h.mark)))
	mux.Handle("POST /api/workspaces/{id}/mcq/tests/{tid}/leave", requireVerified(http.HandlerFunc(h.leave)))
	mux.Handle("GET /api/workspaces/{id}/mcq/tests/{tid}/chat", requireUser(http.HandlerFunc(h.chatHistory)))
	mux.Handle("POST /api/workspaces/{id}/mcq/tests/{tid}/chat", requireVerified(http.HandlerFunc(h.chatSend)))
	mux.Handle("POST /api/workspaces/{id}/mcq/tests/{tid}/submit", requireVerified(http.HandlerFunc(h.submit)))
}

func userID(r *http.Request) string { return auth.UserFrom(r.Context()).ID }

func (h *Handler) failed(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if isNotFound(err) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
		return true
	}
	httpx.Internal(w, h.log, err)
	return true
}

// owned checks the workspace belongs to the caller and finishes its tests whose time is up.
func (h *Handler) owned(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.PathValue("id")
	if h.failed(w, ownsWorkspace(r.Context(), h.db, userID(r), id)) {
		return "", false
	}
	if h.failed(w, closeExpired(r.Context(), h.db, id)) {
		return "", false
	}
	return id, true
}

func (h *Handler) topics(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	ws, err := workspace.Load(r.Context(), h.db, userID(r), id)
	if h.failed(w, err) {
		return
	}
	out, err := topics(r.Context(), h.db, userID(r), id, Selected(ws))
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	out, err := listTests(r.Context(), h.db, id)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	t, err := getTest(r.Context(), h.db, id, r.PathValue("tid"))
	if h.failed(w, err) {
		return
	}
	if !t.Finished {
		// Opening the test again (a reload) cancels a pending "tab closed".
		if h.failed(w, cancelLeave(r.Context(), h.db, id, t.ID)) {
			return
		}
	}
	t.ChatEnabled = h.tutor != nil
	httpx.WriteJSON(w, http.StatusOK, t)
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	var in StartInput
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	errs := map[string]string{}
	if _, known := catalog.byKey[in.Topic]; !known {
		errs["topic"] = "Choose a topic."
	}
	if in.Questions < minQuestions || in.Questions > maxQuestions {
		errs["questions"] = "Choose 5 to 200 questions."
	}
	if in.DurationMinutes < minMinutes || in.DurationMinutes > maxMinutes {
		errs["durationMinutes"] = "Choose 5 to 180 minutes."
	}
	if len(errs) > 0 {
		httpx.WriteValidation(w, errs)
		return
	}
	var tid string
	err := pgx.BeginFunc(r.Context(), h.db, func(tx pgx.Tx) error {
		var err error
		tid, err = createTest(r.Context(), tx, userID(r), id, in)
		return err
	})
	var few tooFewError
	if errors.As(err, &few) {
		msg := "This topic doesn't have enough questions yet."
		if few.available >= minQuestions {
			msg = "Only " + itoa(few.available) + " questions are available for this topic."
		}
		httpx.WriteValidation(w, map[string]string{"questions": msg})
		return
	}
	if h.failed(w, err) {
		return
	}
	t, err := getTest(r.Context(), h.db, id, tid)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, t)
}

func (h *Handler) answer(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	var in struct {
		Position int  `json:"position"`
		Selected *int `json:"selected"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	if in.Selected != nil && (*in.Selected < 0 || *in.Selected > 3) {
		httpx.WriteValidation(w, map[string]string{"selected": "Choose one of the four options."})
		return
	}
	err := saveAnswer(r.Context(), h.db, id, r.PathValue("tid"), in.Position, in.Selected)
	if err == nil {
		err = cancelLeave(r.Context(), h.db, id, r.PathValue("tid")) // still being used
	}
	if errors.Is(err, errClosed) {
		httpx.WriteError(w, http.StatusConflict, "test_closed", "This test is finished.")
		return
	}
	if h.failed(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) submit(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	if h.failed(w, submit(r.Context(), h.db, id, r.PathValue("tid"))) {
		return
	}
	t, err := getTest(r.Context(), h.db, id, r.PathValue("tid"))
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, t)
}

func itoa(n int) string { return strconv.Itoa(n) }

func (h *Handler) mark(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	var in struct {
		Position int  `json:"position"`
		Marked   bool `json:"marked"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	err := setMark(r.Context(), h.db, id, r.PathValue("tid"), in.Position, in.Marked)
	if errors.Is(err, errClosed) {
		httpx.WriteError(w, http.StatusConflict, "test_closed", "This test is finished.")
		return
	}
	if h.failed(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// leave is sent when the test tab is closed. The test is submitted shortly after unless it is opened again.
func (h *Handler) leave(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if h.failed(w, ownsWorkspace(r.Context(), h.db, userID(r), id)) {
		return
	}
	if h.failed(w, markLeft(r.Context(), h.db, id, r.PathValue("tid"))) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func position(w http.ResponseWriter, r *http.Request) (int, bool) {
	n, err := strconv.Atoi(r.URL.Query().Get("position"))
	if err != nil || n < 0 {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found.")
		return 0, false
	}
	return n, true
}

func (h *Handler) chatHistory(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	pos, ok := position(w, r)
	if !ok {
		return
	}
	if _, err := chatContext(r.Context(), h.db, id, r.PathValue("tid"), pos); h.failed(w, err) {
		return
	}
	out, err := chatMessages(r.Context(), h.db, r.PathValue("tid"), pos)
	if h.failed(w, err) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) chatSend(w http.ResponseWriter, r *http.Request) {
	id, ok := h.owned(w, r)
	if !ok {
		return
	}
	if h.tutor == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "ai_unavailable", "The tutor isn't available right now.")
		return
	}
	var in struct {
		Position int    `json:"position"`
		Message  string `json:"message"`
	}
	if !httpx.DecodeJSON(w, r, &in) {
		return
	}
	msg := strings.TrimSpace(in.Message)
	if msg == "" || len([]rune(msg)) > maxChatChars {
		httpx.WriteValidation(w, map[string]string{"message": "Write 1 to 500 characters."})
		return
	}
	tid := r.PathValue("tid")
	c, err := chatContext(r.Context(), h.db, id, tid, in.Position)
	if h.failed(w, err) {
		return
	}
	history, err := chatMessages(r.Context(), h.db, tid, in.Position)
	if h.failed(w, err) {
		return
	}
	asked := 0
	for _, t := range history {
		if t.Role == "user" {
			asked++
		}
	}
	if asked >= maxChatQuestion {
		httpx.WriteValidation(w, map[string]string{"message": "You've reached the message limit for this question."})
		return
	}
	if !h.chat.Allow(userID(r)) {
		httpx.WriteError(w, http.StatusTooManyRequests, "rate_limited", "Too many questions for now. Try again later.")
		return
	}
	if len(history) > chatHistory {
		history = history[len(history)-chatHistory:]
	}
	reply, onTopic, err := h.tutor.Chat(r.Context(), c, history, msg)
	if err != nil {
		h.log.Error("mcq chat", "err", err)
		httpx.WriteError(w, http.StatusBadGateway, "ai_failed", "The tutor couldn't answer. Try again.")
		return
	}
	if !onTopic {
		reply = offTopicReply
	}
	turns := []ChatTurn{{"user", msg}, {"assistant", reply}}
	if h.failed(w, addChat(r.Context(), h.db, tid, in.Position, turns...)) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, turns)
}
