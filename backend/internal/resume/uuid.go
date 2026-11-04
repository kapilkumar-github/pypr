package resume

import (
	"errors"

	"github.com/jackc/pgx/v5/pgconn"
)

func isInvalidUUID(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "22P02"
}
