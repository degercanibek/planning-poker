/* ═══════════════════════════════════════════════════════════════════════════
   Planning Poker — Storage Abstraction
   Uses Upstash Redis on Vercel, file-backed memory store locally.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

// ─── Memory Store (local development) ───────────────────────────────────────
class MemoryStore {
  constructor() {
    this._dir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(this._dir)) fs.mkdirSync(this._dir, { recursive: true });
    this._data = new Map();
    this._ttls = new Map();
    this._hashes = new Map();
    // Bootstrap persisted data
    for (const key of ['users', 'sessions']) {
      const file = path.join(this._dir, `${key}.json`);
      try { this._data.set(`pp:${key}`, JSON.parse(fs.readFileSync(file, 'utf8'))); }
      catch { /* no existing data */ }
    }
  }

  async get(key) {
    if (this._ttls.has(key) && Date.now() > this._ttls.get(key)) {
      this._data.delete(key);
      this._ttls.delete(key);
      return null;
    }
    const v = this._data.get(key);
    return v === undefined ? null : v;
  }

  async set(key, value, opts) {
    this._data.set(key, value);
    if (opts?.ex) this._ttls.set(key, Date.now() + opts.ex * 1000);
    // Persist users/sessions to disk
    const m = key.match(/^pp:(users|sessions)$/);
    if (m) fs.writeFileSync(path.join(this._dir, `${m[1]}.json`), JSON.stringify(value, null, 2), 'utf8');
  }

  async del(key) {
    this._data.delete(key);
    this._ttls.delete(key);
    this._hashes.delete(key);
  }

  async hset(key, field, value) {
    if (!this._hashes.has(key)) this._hashes.set(key, new Map());
    this._hashes.get(key).set(field, value);
  }

  async hgetall(key) {
    const h = this._hashes.get(key);
    if (!h || h.size === 0) return null;
    const obj = {};
    for (const [f, v] of h) obj[f] = v;
    return obj;
  }

  async hdel(key, field) {
    const h = this._hashes.get(key);
    if (h) h.delete(field);
  }
}

// ─── Redis Store (Vercel / production) ──────────────────────────────────────
class RedisStore {
  constructor() {
    const { Redis } = require('@upstash/redis');
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  async get(key) {
    return await this.redis.get(key);
  }

  async set(key, value, opts) {
    if (opts?.ex) {
      await this.redis.set(key, value, { ex: opts.ex });
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key) {
    await this.redis.del(key);
  }

  async hset(key, field, value) {
    await this.redis.hset(key, { [field]: value });
  }

  async hgetall(key) {
    return await this.redis.hgetall(key);
  }

  async hdel(key, field) {
    await this.redis.hdel(key, field);
  }
}

// ─── Export singleton based on environment ──────────────────────────────────
module.exports = process.env.UPSTASH_REDIS_REST_URL
  ? new RedisStore()
  : new MemoryStore();
