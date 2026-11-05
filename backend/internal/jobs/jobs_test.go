package jobs

import (
	"errors"
	"testing"
	"time"
)

func TestStore(t *testing.T) {
	s := NewStore[int]()
	release := make(chan struct{})
	id := s.Go("u1", func() (int, error) { <-release; return 42, nil })
	if j, ok := s.Get(id, "u1"); !ok || j.Done {
		t.Fatalf("running job must be pending: %+v %v", j, ok)
	}
	if _, ok := s.Get(id, "u2"); ok {
		t.Fatal("other owners must not see the job")
	}
	close(release)
	if j := wait(t, s, id); j.Result != 42 || j.Err != nil {
		t.Fatalf("got %+v", j)
	}
	boom := errors.New("boom")
	if j := wait(t, s, s.Go("u1", func() (int, error) { return 0, boom })); !errors.Is(j.Err, boom) {
		t.Fatalf("error must be kept: %+v", j)
	}
}

func wait(t *testing.T, s *Store[int], id string) Job[int] {
	t.Helper()
	for range 100 {
		if j, _ := s.Get(id, "u1"); j.Done {
			return j
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("job didn't finish")
	return Job[int]{}
}
