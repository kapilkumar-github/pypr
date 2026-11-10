// FakeRedis: an in-memory stand-in for a Redis client, provided read-only by the platform.
// Commands are async and atomic one at a time (like Redis); eval() and multi() run several commands as one atomic step.
// Failure injection for tests: fail(), delay(ms), recover().
class FakeRedis {
  constructor(options = {}) {
    this.now = options.now || Date.now // inject a clock to control time
    this.calls = 0 // commands received, failed ones included
    this._down = null
    this._latency = 0
    this._store = new FakeRedisStore(() => this.now())
  }
  // Make every command reject until recover() is called.
  fail(message = 'connection refused') { this._down = message }
  // Make every command take `ms` milliseconds before it runs (or fails).
  delay(ms) { this._latency = ms }
  recover() { this._down = null; this._latency = 0 }
  async _enter() {
    this.calls++
    if (this._latency) await new Promise((resolve) => setTimeout(resolve, this._latency))
    if (this._down) throw new Error('FakeRedis: ' + this._down)
  }
  // eval(script, { keys, args }): script(tx, keys, args) runs synchronously and atomically; tx has the same commands, without await.
  async eval(script, { keys = [], args = [] } = {}) {
    await this._enter()
    return script(this._store, keys, args)
  }
  // multi().set('a', 1).incr('a').exec() runs the queued commands as one atomic step and resolves to their results.
  multi() {
    const queue = []
    const chain = { exec: async () => { await this._enter(); return queue.map(([name, args]) => this._store[name](...args)) } }
    for (const name of FakeRedisStore.commands) chain[name] = (...args) => { queue.push([name, args]); return chain }
    return chain
  }
}

class FakeRedisStore {
  constructor(now) { this.now = now; this.data = new Map(); this.expires = new Map() }
  _live(key) {
    const at = this.expires.get(key)
    if (at !== undefined && at <= this.now()) { this.data.delete(key); this.expires.delete(key) }
    return this.data.has(key)
  }
  _kind(key, kind, make) {
    if (!this._live(key)) { if (!make) return undefined; this.data.set(key, make()) }
    const v = this.data.get(key)
    if (kind === 'string' ? typeof v !== 'string' : v.kind !== kind) throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value')
    return v
  }
  get(key) { return this._live(key) ? this._kind(key, 'string') : null }
  // set(key, value, { NX, XX, PX, EX }) resolves to 'OK', or null when NX/XX stopped it. A plain set clears the expiry.
  set(key, value, o = {}) {
    const exists = this._live(key)
    if ((o.NX && exists) || (o.XX && !exists)) return null
    this.data.set(key, String(value))
    this.expires.delete(key)
    if (o.PX) this.expires.set(key, this.now() + o.PX)
    else if (o.EX) this.expires.set(key, this.now() + o.EX * 1000)
    return 'OK'
  }
  del(...keys) { let n = 0; for (const k of keys) if (this._live(k)) { this.data.delete(k); this.expires.delete(k); n++ } return n }
  exists(key) { return this._live(key) ? 1 : 0 }
  incrBy(key, n) {
    const cur = this._live(key) ? this._kind(key, 'string') : '0'
    if (!/^-?\d+$/.test(cur)) throw new Error('ERR value is not an integer or out of range')
    const next = Number(cur) + n
    this.data.set(key, String(next))
    return next
  }
  incr(key) { return this.incrBy(key, 1) }
  decr(key) { return this.incrBy(key, -1) }
  pExpire(key, ms) { if (!this._live(key)) return 0; this.expires.set(key, this.now() + ms); return 1 }
  expire(key, seconds) { return this.pExpire(key, seconds * 1000) }
  pTtl(key) { if (!this._live(key)) return -2; const at = this.expires.get(key); return at === undefined ? -1 : at - this.now() }
  ttl(key) { const ms = this.pTtl(key); return ms < 0 ? ms : Math.ceil(ms / 1000) }
  hSet(key, field, value) { const h = this._kind(key, 'hash', () => ({ kind: 'hash', map: new Map() })); const fresh = !h.map.has(field); h.map.set(field, String(value)); return fresh ? 1 : 0 }
  hGet(key, field) { const h = this._kind(key, 'hash'); return h && h.map.has(field) ? h.map.get(field) : null }
  hGetAll(key) { const h = this._kind(key, 'hash'); return h ? Object.fromEntries(h.map) : {} }
  hIncrBy(key, field, n) { const h = this._kind(key, 'hash', () => ({ kind: 'hash', map: new Map() })); const next = Number(h.map.get(field) || 0) + n; h.map.set(field, String(next)); return next }
  zAdd(key, score, member) { const z = this._kind(key, 'zset', () => ({ kind: 'zset', items: new Map() })); const fresh = !z.items.has(member); z.items.set(member, score); return fresh ? 1 : 0 }
  zRemRangeByScore(key, min, max) { const z = this._kind(key, 'zset'); if (!z) return 0; let n = 0; for (const [m, s] of z.items) if (s >= min && s <= max) { z.items.delete(m); n++ } return n }
  zCard(key) { const z = this._kind(key, 'zset'); return z ? z.items.size : 0 }
  zRange(key, start, stop) {
    const z = this._kind(key, 'zset'); if (!z) return []
    const all = [...z.items].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([m]) => m)
    return all.slice(start < 0 ? Math.max(all.length + start, 0) : start, stop < 0 ? all.length + stop + 1 : stop + 1)
  }
  rPush(key, value) { const l = this._kind(key, 'list', () => ({ kind: 'list', items: [] })); return l.items.push(String(value)) }
  lPush(key, value) { const l = this._kind(key, 'list', () => ({ kind: 'list', items: [] })); return l.items.unshift(String(value)) }
  lPop(key) { const l = this._kind(key, 'list'); return l && l.items.length ? l.items.shift() : null }
  lLen(key) { const l = this._kind(key, 'list'); return l ? l.items.length : 0 }
}
FakeRedisStore.commands = Object.getOwnPropertyNames(FakeRedisStore.prototype).filter((n) => !n.startsWith('_') && n !== 'constructor')
for (const name of FakeRedisStore.commands) {
  FakeRedis.prototype[name] = async function (...args) { await this._enter(); return this._store[name](...args) }
}
