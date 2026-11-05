// Package httpx holds JSON request/response helpers and middleware shared by handlers.
package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"time"
)

const maxBodyBytes = 1 << 20

type errorBody struct {
	Error APIError `json:"error"`
}

type APIError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v != nil {
		_ = json.NewEncoder(w).Encode(v)
	}
}

func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, errorBody{APIError{Code: code, Message: message}})
}

func WriteValidation(w http.ResponseWriter, fields map[string]string) {
	WriteJSON(w, http.StatusUnprocessableEntity, errorBody{APIError{
		Code: "validation_failed", Message: "Please fix the highlighted fields.", Fields: fields,
	}})
}

// DecodeJSON reads a size-limited JSON body into dst. It writes the error response itself and returns false on failure.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	return DecodeJSONLimit(w, r, dst, maxBodyBytes)
}

// DecodeJSONLimit is DecodeJSON with a custom body size limit, for endpoints that take uploads.
func DecodeJSONLimit(w http.ResponseWriter, r *http.Request, dst any, limit int64) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, limit))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			WriteError(w, http.StatusRequestEntityTooLarge, "body_too_large", "Request body is too large.")
		} else {
			WriteError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		}
		return false
	}
	if dec.Decode(&struct{}{}) != io.EOF {
		WriteError(w, http.StatusBadRequest, "invalid_json", "Request body must contain a single JSON value.")
		return false
	}
	return true
}

// RequireJSON rejects state-changing requests that are not application/json.
// Browsers cannot send that content type cross-site without a CORS preflight, which this API never grants,
// so together with SameSite=Lax cookies this blocks CSRF.
func RequireJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
		default:
			mt, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if mt != "application/json" {
				WriteError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json.")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func Logging(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if p := recover(); p != nil {
				log.Error("panic", "err", p, "path", r.URL.Path)
				WriteError(rec, http.StatusInternalServerError, "internal", "Something went wrong.")
			}
			log.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status, "dur", time.Since(start))
		}()
		next.ServeHTTP(rec, r)
	})
}

func Internal(w http.ResponseWriter, log *slog.Logger, err error) {
	log.Error("internal error", "err", err)
	WriteError(w, http.StatusInternalServerError, "internal", "Something went wrong.")
}
