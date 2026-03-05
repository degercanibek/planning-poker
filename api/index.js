/* ═══════════════════════════════════════════════════════════════════════════
   Planning Poker 🃏 — REST API  (Vercel Serverless + Local Express)
   ═══════════════════════════════════════════════════════════════════════════ */
const express = require('express');
const crypto = require('crypto');
const store = require('../lib/store');
const SCALES = require('../lib/scales');

const app = express();
app.use(express.json());

// ─── Helpers ────────────────────────────────────────────────────────────────
const generateId = () => crypto.randomUUID();
const generateToken = () => crypto.randomBytes(32).toString('hex');
const hashPassword = (pw) => crypto.createHash('sha256').update(pw).digest('hex');
const AVATARS = ['🦊','🐱','🐶','🐼','🦁','🐸','🐵','🦄','🐲','🦅','🐺','🦈','🐍','🦋','🐢','🦉','🐧','🐙'];
const PARTICIPANT_TTL = 30; // seconds — user considered "present" if polled within this window

async function getUsers() {
  let users = await store.get('pp:users');
  if (!users || users.length === 0) {
    users = [{
      id: generateId(), username: 'admin', displayName: 'Admin',
      passwordHash: hashPassword('admin'), role: 'admin', avatar: '👑',
      active: true, createdAt: new Date().toISOString()
    }];
    await store.set('pp:users', users);
  }
  return users;
}

async function saveUsers(users) { await store.set('pp:users', users); }
async function getSessions() { return (await store.get('pp:sessions')) || []; }
async function saveSessions(sessions) { await store.set('pp:sessions', sessions); }

function computeResult(item, scaleName) {
  const scale = SCALES[scaleName];
  if (!scale) return;
  const numericVotes = [];
  const allValues = [];
  for (const vote of Object.values(item.votes)) {
    allValues.push(vote.value);
    const n = scale.numeric[vote.value];
    if (n !== undefined) numericVotes.push(n);
  }
  if (numericVotes.length === 0) {
    item.result = { average: null, median: null, min: null, max: null, consensus: false, totalVotes: allValues.length, numericVotes: 0 };
    return;
  }
  numericVotes.sort((a, b) => a - b);
  const avg = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
  const mid = Math.floor(numericVotes.length / 2);
  const median = numericVotes.length % 2 ? numericVotes[mid] : (numericVotes[mid - 1] + numericVotes[mid]) / 2;
  item.result = {
    average: Math.round(avg * 10) / 10, median,
    min: numericVotes[0], max: numericVotes[numericVotes.length - 1],
    consensus: new Set(numericVotes).size === 1,
    totalVotes: allValues.length, numericVotes: numericVotes.length
  };
}

function getActiveParticipants(pings) {
  if (!pings) return [];
  const cutoff = Date.now() - PARTICIPANT_TTL * 1000;
  return Object.entries(pings)
    .filter(([, ts]) => ts > cutoff)
    .map(([uid]) => uid);
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const userId = await store.get(`pp:token:${token}`);
  if (!userId) return res.status(401).json({ error: 'Session expired' });
  const users = await getUsers();
  req.user = users.find(u => u.id === userId);
  if (!req.user) return res.status(401).json({ error: 'User not found' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

// Wrap async handlers
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ═══ AUTH ════════════════════════════════════════════════════════════════════
app.post('/api/login', h(async (req, res) => {
  const { username, password } = req.body;
  const users = await getUsers();
  const user = users.find(u => u.username === username && u.active);
  if (!user || user.passwordHash !== hashPassword(password))
    return res.status(401).json({ error: 'Invalid username or password' });
  const token = generateToken();
  await store.set(`pp:token:${token}`, user.id, { ex: 86400 }); // 24h
  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role, avatar: user.avatar, theme: user.theme || 'midnight' }
  });
}));

app.post('/api/logout', authenticate, h(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  await store.del(`pp:token:${token}`);
  res.json({ ok: true });
}));

app.get('/api/me', authenticate, h(async (req, res) => {
  const u = req.user;
  res.json({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, avatar: u.avatar, theme: u.theme || 'midnight' });
}));

app.get('/api/scales', (req, res) => res.json(SCALES));

// ═══ PROFILE (self-service) ════════════════════════════════════════════════
app.put('/api/me', authenticate, h(async (req, res) => {
  const users = await getUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { displayName, avatar, theme } = req.body;
  if (displayName !== undefined && displayName.trim()) user.displayName = displayName.trim();
  if (avatar !== undefined) user.avatar = avatar;
  if (theme !== undefined) user.theme = theme;
  await saveUsers(users);
  res.json({ id: user.id, displayName: user.displayName, avatar: user.avatar, theme: user.theme || 'midnight' });
}));

app.put('/api/me/password', authenticate, h(async (req, res) => {
  const users = await getUsers();
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password are required' });
  if (user.passwordHash !== hashPassword(currentPassword)) return res.status(400).json({ error: 'Current password is incorrect' });
  if (newPassword.length < 3) return res.status(400).json({ error: 'New password must be at least 3 characters' });
  user.passwordHash = hashPassword(newPassword);
  await saveUsers(users);
  res.json({ ok: true });
}));

// ═══ USERS CRUD (admin) ════════════════════════════════════════════════════
app.get('/api/users', authenticate, requireRole('admin'), h(async (req, res) => {
  const users = await getUsers();
  res.json(users.map(u => ({
    id: u.id, username: u.username, displayName: u.displayName,
    role: u.role, avatar: u.avatar, active: u.active, createdAt: u.createdAt
  })));
}));

app.post('/api/users', authenticate, requireRole('admin'), h(async (req, res) => {
  const { username, displayName, password, role, avatar } = req.body;
  if (!username || !password || !displayName)
    return res.status(400).json({ error: 'Required fields are missing' });
  const users = await getUsers();
  if (users.some(u => u.username === username))
    return res.status(400).json({ error: 'This username already exists' });
  const newUser = {
    id: generateId(), username, displayName,
    passwordHash: hashPassword(password),
    role: role || 'voter',
    avatar: avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
    active: true, createdAt: new Date().toISOString()
  };
  users.push(newUser);
  await saveUsers(users);
  res.json({ id: newUser.id, username: newUser.username, displayName: newUser.displayName, role: newUser.role, avatar: newUser.avatar });
}));

app.put('/api/users/:id', authenticate, requireRole('admin'), h(async (req, res) => {
  const users = await getUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { displayName, role, avatar, active, password } = req.body;
  if (displayName !== undefined) user.displayName = displayName;
  if (role) user.role = role;
  if (avatar) user.avatar = avatar;
  if (active !== undefined) user.active = active;
  if (password) user.passwordHash = hashPassword(password);
  await saveUsers(users);
  res.json({ ok: true });
}));

app.delete('/api/users/:id', authenticate, requireRole('admin'), h(async (req, res) => {
  const users = await getUsers();
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.username === 'admin') return res.status(400).json({ error: 'Admin user cannot be deleted' });
  user.active = false;
  await saveUsers(users);
  res.json({ ok: true });
}));

// ═══ SESSIONS CRUD ══════════════════════════════════════════════════════════
app.get('/api/sessions', authenticate, h(async (req, res) => {
  const sessions = await getSessions();
  const users = await getUsers();
  res.json(sessions.map(s => ({
    id: s.id, name: s.name, description: s.description, scale: s.scale,
    status: s.status, createdBy: s.createdBy, createdAt: s.createdAt,
    closedAt: s.closedAt, itemCount: s.items.length,
    creatorName: users.find(u => u.id === s.createdBy)?.displayName || '?'
  })));
}));

app.post('/api/sessions', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const { name, description, scale } = req.body;
  if (!name) return res.status(400).json({ error: 'Session name is required' });
  const sessions = await getSessions();
  const session = {
    id: generateId(), name, description: description || '',
    scale: scale || 'fibonacci', status: 'active',
    createdBy: req.user.id, createdAt: new Date().toISOString(),
    closedAt: null, currentItemId: null, items: []
  };
  sessions.push(session);
  await saveSessions(sessions);
  res.json(session);
}));

app.put('/api/sessions/:id/status', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { status } = req.body;
  if (status === 'closed') { session.status = 'closed'; session.closedAt = new Date().toISOString(); }
  else if (status === 'active') { session.status = 'active'; session.closedAt = null; }
  await saveSessions(sessions);
  res.json({ ok: true });
}));

app.delete('/api/sessions/:id', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const sessions = await getSessions();
  const idx = sessions.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Session not found' });
  sessions.splice(idx, 1);
  await saveSessions(sessions);
  // Clean up pings
  await store.del(`pp:pings:${req.params.id}`);
  res.json({ ok: true });
}));

// ── Session detail (for history viewing) ────────────────────────────────────
app.get('/api/sessions/:id', authenticate, h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
}));

// ── Export ───────────────────────────────────────────────────────────────────
app.get('/api/sessions/:id/export', authenticate, h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const users = await getUsers();
  const exportData = {
    name: session.name, description: session.description,
    scale: SCALES[session.scale]?.name || session.scale,
    status: session.status, createdAt: session.createdAt, closedAt: session.closedAt,
    items: session.items.map(item => {
      const votes = {};
      for (const [uid, v] of Object.entries(item.votes)) {
        const u = users.find(x => x.id === uid);
        votes[u?.displayName || uid] = v.value;
      }
      return { title: item.title, votes, result: item.result, rounds: item.rounds.length + 1 };
    })
  };
  res.setHeader('Content-Disposition', `attachment; filename="planning-poker-${session.name}.json"`);
  res.json(exportData);
}));

// ═══ POLLING STATE ENDPOINT ═════════════════════════════════════════════════
// Client polls this every 2-3s to get real-time session state
app.get('/api/sessions/:id/state', authenticate, h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Update participant ping
  const pings = (await store.get(`pp:pings:${session.id}`)) || {};
  pings[req.user.id] = Date.now();
  await store.set(`pp:pings:${session.id}`, pings, { ex: 120 });

  // Resolve active participants
  const users = await getUsers();
  const activeIds = getActiveParticipants(pings);
  const participants = activeIds.map(uid => {
    const u = users.find(x => x.id === uid);
    return u ? { id: u.id, displayName: u.displayName, avatar: u.avatar, role: u.role } : null;
  }).filter(Boolean);

  // Build sanitized items (hide votes during voting, show after reveal)
  const items = session.items.map(item => {
    if (item.status === 'pending') {
      return { ...item };
    }
    if (item.status === 'voting') {
      return {
        ...item,
        votes: Object.fromEntries(
          Object.entries(item.votes).map(([uid, v]) => {
            const u = users.find(x => x.id === uid);
            return [uid, { voted: true, displayName: u?.displayName || '?', avatar: u?.avatar || '👤' }];
          })
        )
      };
    }
    // Revealed: include full vote info with names
    const resolvedVotes = {};
    for (const [uid, v] of Object.entries(item.votes)) {
      const u = users.find(x => x.id === uid);
      resolvedVotes[uid] = { ...v, displayName: u?.displayName || '?', avatar: u?.avatar || '👤' };
    }
    return { ...item, votes: resolvedVotes };
  });

  res.json({
    ...session,
    items,
    participants
  });
}));

// ═══ SESSION ACTIONS ════════════════════════════════════════════════════════

// ── Add item (pending — waits for admin to start voting) ────────────────────
app.post('/api/sessions/:id/items', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session || session.status !== 'active') return res.status(400).json({ error: 'Session is not active' });
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const item = {
    id: generateId(), title, status: 'pending',
    votes: {}, rounds: [], result: null,
    createdAt: new Date().toISOString()
  };
  session.items.push(item);
  await saveSessions(sessions);
  res.json(item);
}));

// ── Start voting on a pending item ──────────────────────────────────────────
app.post('/api/sessions/:id/items/:itemId/start', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session || session.status !== 'active') return res.status(400).json({ error: 'Session is not active' });
  const item = session.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  // If there's a current voting item, keep it as-is (don't auto-reveal)
  // Admin must manually reveal or it stays in voting
  if (session.currentItemId) {
    const prev = session.items.find(i => i.id === session.currentItemId);
    if (prev && prev.status === 'voting') {
      return res.status(400).json({ error: 'Please finish the current vote first' });
    }
  }

  item.status = 'voting';
  item.votes = {};
  item.result = null;
  session.currentItemId = item.id;
  await saveSessions(sessions);
  res.json({ ok: true });
}));

// ── Cast vote ───────────────────────────────────────────────────────────────
app.post('/api/sessions/:id/items/:itemId/vote', authenticate, h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session || session.status !== 'active') return res.status(400).json({ error: 'Session is not active' });
  const item = session.items.find(i => i.id === req.params.itemId);
  if (!item || item.status !== 'voting') return res.status(400).json({ error: 'Voting has ended for this item' });
  const { value } = req.body;
  const scale = SCALES[session.scale];
  if (!scale || !scale.values.includes(value)) return res.status(400).json({ error: 'Invalid vote' });

  item.votes[req.user.id] = { value, timestamp: new Date().toISOString() };

  await saveSessions(sessions);
  res.json({ ok: true });
}));

// ── Reveal votes ────────────────────────────────────────────────────────────
app.post('/api/sessions/:id/items/:itemId/reveal', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const item = session.items.find(i => i.id === req.params.itemId);
  if (!item || item.status !== 'voting') return res.status(400).json({ error: 'Already revealed' });

  item.status = 'revealed';
  computeResult(item, session.scale);
  await saveSessions(sessions);
  res.json({ ok: true });
}));

// ── Close voting (move to history) ──────────────────────────────────────────
app.post('/api/sessions/:id/items/:itemId/close', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const item = session.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (session.currentItemId === item.id) {
    session.currentItemId = null;
  }
  await saveSessions(sessions);
  res.json({ ok: true });
}));

// ── Revote ──────────────────────────────────────────────────────────────────
app.post('/api/sessions/:id/items/:itemId/revote', authenticate, requireRole('admin', 'session_manager'), h(async (req, res) => {
  const sessions = await getSessions();
  const session = sessions.find(s => s.id === req.params.id);
  if (!session || session.status !== 'active') return res.status(400).json({ error: 'Session is not active' });
  const item = session.items.find(i => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (Object.keys(item.votes).length > 0) {
    item.rounds.push({ votes: { ...item.votes }, result: item.result ? { ...item.result } : null });
  }
  item.votes = {};
  item.result = null;
  item.status = 'voting';
  session.currentItemId = item.id;
  await saveSessions(sessions);
  res.json({ ok: true });
}));

// ── Leave session (stop counting as participant) ────────────────────────────
app.post('/api/sessions/:id/leave', authenticate, h(async (req, res) => {
  const pings = (await store.get(`pp:pings:${req.params.id}`)) || {};
  delete pings[req.user.id];
  await store.set(`pp:pings:${req.params.id}`, pings, { ex: 120 });
  res.json({ ok: true });
}));

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('API Error:', err);
  res.status(500).json({ error: 'Server error' });
});

module.exports = app;
