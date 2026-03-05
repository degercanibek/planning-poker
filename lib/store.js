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
}

// ─── Export singleton based on environment ──────────────────────────────────
module.exports = process.env.UPSTASH_REDIS_REST_URL
  ? new RedisStore()
  : new MemoryStore();
