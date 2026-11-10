package machine

import _ "embed"

// FakeRedisSource is the read-only prelude for problems that use Redis. See fakeredis.js.
//
//go:embed fakeredis.js
var FakeRedisSource string

// FakeRedisDoc is how problem statements describe FakeRedis to learners.
const FakeRedisDoc = "`FakeRedis` is provided (read-only tab `fake-redis.js`): an in-memory Redis stand-in. Create one with `new FakeRedis({ now })`. " +
	"Async commands: `get`, `set(key, value, { NX, XX, PX, EX })`, `del(...keys)`, `exists`, `incr`, `incrBy`, `decr`, `expire`, `pExpire`, `ttl`, `pTtl`, " +
	"`hSet`, `hGet`, `hGetAll`, `hIncrBy`, `zAdd(key, score, member)`, `zRemRangeByScore(key, min, max)`, `zCard`, `zRange`, `rPush`, `lPush`, `lPop`, `lLen`. " +
	"`await redis.eval((tx, keys, args) => ..., { keys, args })` runs a synchronous function atomically; `tx` has the same commands without `await` (like a Lua script). " +
	"`redis.multi().incr('a').expire('a', 60).exec()` runs queued commands atomically. " +
	"For failure tests: `redis.fail()` makes every command reject, `redis.delay(ms)` adds latency, `redis.recover()` resets both; `redis.calls` counts commands."
