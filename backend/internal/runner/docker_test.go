package runner

import (
	"context"
	"strings"
	"testing"
	"time"
)

// Needs Docker and the image (docker pull node:22-alpine); skipped otherwise.
func TestDockerRunner(t *testing.T) {
	d := NewDocker(DefaultImage)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := d.Ensure(ctx); err != nil {
		t.Skip(err)
	}
	res, err := d.Run(ctx, []Job{
		{Language: "nodejs", Source: "console.log(require('fs').readFileSync(0, 'utf8').trim().toUpperCase())", Stdin: "abc\n"},
		{Language: "typescript", Source: "const s: string = require('fs').readFileSync(0, 'utf8').trim(); interface P { n: number } const p: P = { n: 1 }; console.log(s + p.n)", Stdin: "x\n"},
		{Language: "nodejs", Source: "process.exit(3)"},
		{Language: "nodejs", Source: "throw new Error('boom')"},
		{Language: "nodejs", Source: "while (true) {}"},
		{Language: "nodejs", Source: "const a = []; while (true) a.push(Buffer.alloc(1e7, 1))"},
		{Language: "nodejs", Source: "fetch('http://1.1.1.1').then(() => console.log('connected'), (e) => console.log('blocked'))"},
		{Language: "nodejs", Source: "try { require('fs').writeFileSync('/etc/x', '1'); console.log('wrote') } catch { console.log('read-only') }; console.log(process.env.PYPR_SRC === undefined ? 'no source in env' : 'leak')"},
		{Language: "nodejs", Source: "console.log('x'.repeat(100000))"},
		{Language: "nodejs", Source: "require('child_process').spawn('sleep', ['300'], { detached: true, stdio: 'ignore' }).unref(); console.log('spawned')"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for i, r := range res {
		t.Logf("job %d: %s %dms stdout=%.40q stderr=%.60q", i, r.Verdict, r.TimeMs, r.Stdout, r.Stderr)
	}
	check := func(i int, verdict, stdout string) {
		t.Helper()
		if res[i].Verdict != verdict || !strings.Contains(res[i].Stdout, stdout) {
			t.Errorf("job %d: %+v, want %s containing %q", i, res[i], verdict, stdout)
		}
	}
	check(0, Ran, "ABC")
	check(1, Ran, "x1")
	check(2, RuntimeError, "")
	check(3, RuntimeError, "")
	if !strings.Contains(res[3].Stderr, "boom") {
		t.Errorf("stderr: %q", res[3].Stderr)
	}
	check(4, TimeLimit, "")
	if res[5].Verdict == Ran {
		t.Error("memory hog must be stopped")
	}
	check(6, Ran, "blocked")
	check(7, Ran, "read-only")
	check(7, Ran, "no source in env")
	if len(res[8].Stdout) > 20000 {
		t.Errorf("output not capped: %d", len(res[8].Stdout))
	}
	check(9, Ran, "spawned")
	if out, _ := d.docker(ctx, "exec", ContainerName, "ls", "-A", "/tmp"); out != "" {
		t.Errorf("files left behind in /tmp: %q", out)
	}
	if out, _ := d.docker(ctx, "exec", ContainerName, "ps"); strings.Contains(out, "sleep 300") {
		t.Errorf("a process outlived its run:\n%s", out)
	}
}
