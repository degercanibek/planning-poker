/* ═══════════════════════════════════════════════════════════════════════════
   Planning Poker 🃏 — Client Application  (Polling-based, no WebSocket)
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('pp_token'),
  user: null,
  sessions: [],
  currentSession: null,
  currentSessionId: null,
  scales: {},
  currentView: 'dashboard',
  sessionTab: 'active',
  myVote: null,
  expandedHistory: new Set(),
  pollTimer: null,
  dashboardTimer: null,
  lastStateJSON: null,
  lastPingTime: 0,
  currentPollInterval: 3000
};

// ─── API Helper ─────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API error');
  return data;
}

// ─── Polling ────────────────────────────────────────────────────────────────
const POLL_FAST = 3000;   // active voting
const POLL_SLOW = 10000;  // idle / revealed
const PING_INTERVAL = 15000; // ping every 15s (TTL=30s)

function startSessionPolling() {
  stopSessionPolling();
  state.currentPollInterval = POLL_FAST;
  pollSessionState();
  state.pollTimer = setInterval(pollSessionState, state.currentPollInterval);
}

function adjustPollInterval(session) {
  const hasActiveVoting = session.items?.some(i => i.status === 'voting');
  const desired = hasActiveVoting ? POLL_FAST : POLL_SLOW;
  if (desired !== state.currentPollInterval) {
    state.currentPollInterval = desired;
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(pollSessionState, desired);
  }
}

function stopSessionPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  state.lastStateJSON = null;
}

async function pollSessionState() {
  if (!state.currentSessionId || !state.token) return;
  try {
    const now = Date.now();
    const needPing = now - state.lastPingTime >= PING_INTERVAL;
    const url = needPing
      ? `/api/sessions/${state.currentSessionId}/state`
      : `/api/sessions/${state.currentSessionId}/state?noping=1`;
    const data = await api('GET', url);
    if (needPing) state.lastPingTime = now;
    const json = JSON.stringify(data);
    if (json !== state.lastStateJSON) {
      state.currentSession = data;
      state.lastStateJSON = json;
      renderSession();
    }
    adjustPollInterval(data);
  } catch (err) {
    console.error('Polling error:', err);
  }
}

function startDashboardPolling() {
  stopDashboardPolling();
  state.dashboardTimer = setInterval(() => {
    if (state.currentView === 'dashboard') loadSessions();
  }, 10000);
}

function stopDashboardPolling() {
  if (state.dashboardTimer) { clearInterval(state.dashboardTimer); state.dashboardTimer = null; }
}

// ─── Visibility API: pause polling when tab is hidden ───────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopSessionPolling();
    stopDashboardPolling();
  } else if (state.token && state.user) {
    if (state.currentSessionId) {
      startSessionPolling();
    } else if (state.currentView === 'dashboard') {
      loadSessions();
      startDashboardPolling();
    }
  }
});

// ─── Auth ───────────────────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('POST', '/api/login', { username, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('pp_token', data.token);
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
}

async function handleLogout() {
  try { await api('POST', '/api/logout'); } catch {}
  stopSessionPolling();
  stopDashboardPolling();
  state.token = null;
  state.user = null;
  state.currentSession = null;
  state.currentSessionId = null;
  localStorage.removeItem('pp_token');
  localStorage.removeItem('pp_theme');
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('login-form').reset();
  document.getElementById('login-error').textContent = '';
}

async function tryAutoLogin() {
  if (!state.token) return false;
  try {
    state.user = await api('GET', '/api/me');
    return true;
  } catch {
    localStorage.removeItem('pp_token');
    state.token = null;
    return false;
  }
}

// ─── App Bootstrap ──────────────────────────────────────────────────────────
function showApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');

  const badge = document.getElementById('user-badge');
  badge.textContent = `${state.user.avatar} ${state.user.displayName}`;

  const adminBtn = document.getElementById('admin-nav-btn');
  adminBtn.style.display = state.user.role === 'admin' ? '' : 'none';

  const createBtn = document.getElementById('create-session-btn');
  createBtn.style.display = ['admin', 'session_manager'].includes(state.user.role) ? '' : 'none';

  applyTheme(state.user.theme || 'midnight');

  showView('dashboard');
  loadScales();
  loadSessions();
  startDashboardPolling();
}

// ─── View Navigation ────────────────────────────────────────────────────────
function showView(name) {
  state.currentView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${name}-view`).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));

  if (name === 'dashboard') {
    if (state.currentSessionId) {
      api('POST', `/api/sessions/${state.currentSessionId}/leave`).catch(() => {});
      stopSessionPolling();
      state.currentSession = null;
      state.currentSessionId = null;
      state.myVote = null;
    }
    loadSessions();
    startDashboardPolling();
  } else if (name === 'admin') {
    loadUsers();
  } else if (name === 'session') {
    stopDashboardPolling();
  }
}

// ─── Load Scales ────────────────────────────────────────────────────────────
async function loadScales() {
  try {
    state.scales = await api('GET', '/api/scales');
  } catch (err) {
    console.error('Failed to load scales:', err);
  }
}

// ═══ DASHBOARD ══════════════════════════════════════════════════════════════
async function loadSessions() {
  try {
    state.sessions = await api('GET', '/api/sessions');
    renderSessions();
  } catch (err) {
    showNotification('Failed to load sessions: ' + err.message, 'error');
  }
}

function renderSessions() {
  const grid = document.getElementById('sessions-grid');
  const empty = document.getElementById('no-sessions');
  const filtered = state.sessions.filter(s => s.status === state.sessionTab);

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = filtered.map(s => {
    const scaleName = state.scales[s.scale]?.name || s.scale;
    const scaleIcon = state.scales[s.scale]?.icon || '📊';
    const timeSince = timeAgo(s.createdAt);
    const isManager = ['admin', 'session_manager'].includes(state.user.role);
    return `
      <div class="session-card" onclick="joinSession('${s.id}')">
        <div class="session-card-header">
          <span class="session-card-title">${esc(s.name)}</span>
          <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">
            ${s.status === 'active' ? '🟢 Active' : '🔴 Closed'}
          </span>
        </div>
        ${s.description ? `<p style="font-size:0.95rem;color:var(--text-secondary);margin-bottom:8px">${esc(s.description)}</p>` : ''}
        <div class="session-card-meta">
          <span>${scaleIcon} ${scaleName}</span>
          <span>📝 ${s.itemCount} votes</span>
          <span>👤 ${esc(s.creatorName)}</span>
          <span>🕐 ${timeSince}</span>
        </div>
        ${isManager ? `
          <div class="session-card-actions" onclick="event.stopPropagation()">
            ${s.status === 'active'
              ? `<button class="btn btn-ghost btn-sm" onclick="toggleSessionStatus('${s.id}','closed')">🔒 Close</button>`
              : `<button class="btn btn-ghost btn-sm" onclick="toggleSessionStatus('${s.id}','active')">🔓 Reopen</button>`
            }
            <button class="btn btn-ghost btn-sm" onclick="deleteSession('${s.id}')">🗑️</button>
            <button class="btn btn-ghost btn-sm" onclick="exportSession('${s.id}','${escAttr(s.name)}')">📥</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function toggleSessionStatus(id, status) {
  try {
    await api('PUT', `/api/sessions/${id}/status`, { status });
    loadSessions();
    showNotification(`Session ${status === 'active' ? 'reopened' : 'closed'}`, 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function deleteSession(id) {
  if (!confirm('Are you sure you want to delete this session?')) return;
  try {
    await api('DELETE', `/api/sessions/${id}`);
    loadSessions();
    showNotification('Session deleted', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function exportSession(id, name) {
  try {
    const data = await api('GET', `/api/sessions/${id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planning-poker-${name.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Exported', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

function showCreateSessionModal() {
  const scaleOptions = Object.entries(state.scales).map(([key, s]) => {
    const preview = s.values.slice(0, 6).join(', ') + '...';
    return `
      <div class="scale-option ${key === 'fibonacci' ? 'selected' : ''}" data-scale="${key}" onclick="selectScale(this, '${key}')">
        <span class="scale-option-icon">${s.icon}</span>
        <div>
          <div class="scale-option-name">${s.name}</div>
          <div class="scale-option-preview">${preview}</div>
        </div>
      </div>
    `;
  }).join('');

  showModal('Create New Session', `
    <div class="input-group">
      <label>Session Name</label>
      <input type="text" id="session-name-input" placeholder="e.g. Sprint 14 Refinement" required>
    </div>
    <div class="input-group">
      <label>Description (optional)</label>
      <input type="text" id="session-desc-input" placeholder="e.g. Backend user stories">
    </div>
    <div class="input-group">
      <label>Scale</label>
      <div class="scale-options" id="scale-options">
        ${scaleOptions}
      </div>
    </div>
    <input type="hidden" id="selected-scale" value="fibonacci">
    <button class="btn btn-primary btn-block" onclick="createSession()">🚀 Create Session</button>
  `);
  setTimeout(() => document.getElementById('session-name-input')?.focus(), 200);
}

function selectScale(el, key) {
  document.querySelectorAll('.scale-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('selected-scale').value = key;
}

async function createSession() {
  const name = document.getElementById('session-name-input').value.trim();
  const description = document.getElementById('session-desc-input').value.trim();
  const scale = document.getElementById('selected-scale').value;
  if (!name) return showNotification('Please enter a session name', 'warning');
  try {
    await api('POST', '/api/sessions', { name, description, scale });
    hideModal();
    loadSessions();
    showNotification('Session created! 🎉', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// ═══ SESSION ════════════════════════════════════════════════════════════════
async function joinSession(sessionId) {
  state.myVote = null;
  state.expandedHistory = new Set();
  state.currentSessionId = sessionId;
  state.lastStateJSON = null;
  showView('session');
  startSessionPolling();
}

function renderSession() {
  const s = state.currentSession;
  if (!s) return;

  const isManager = ['admin', 'session_manager'].includes(state.user.role);
  const currentItem = s.items.find(i => i.id === s.currentItemId && (i.status === 'voting' || i.status === 'revealed'));
  const pendingItems = s.items.filter(i => i.status === 'pending');
  const completedItems = s.items.filter(i => i.status === 'revealed' && i.id !== s.currentItemId).reverse();
  const scale = state.scales[s.scale] || {};

  document.getElementById('session-title').textContent = s.name;
  document.getElementById('session-scale-badge').textContent = `${scale.icon || ''} ${scale.name || s.scale}`;
  document.getElementById('session-status-badge').textContent = s.status === 'active' ? '🟢 Active' : '🔴 Closed';
  document.getElementById('session-status-badge').className = `badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}`;

  const controlsEl = document.getElementById('session-controls');
  controlsEl.innerHTML = isManager && s.status === 'active'
    ? `<button class="btn btn-danger btn-sm" onclick="closeCurrentSession()">🔒 Close Session</button>`
    : isManager && s.status === 'closed'
    ? `<button class="btn btn-success btn-sm" onclick="reopenCurrentSession()">🔓 Reopen</button>`
    : '';

  const addArea = document.getElementById('add-item-area');
  addArea.style.display = (isManager && s.status === 'active') ? '' : 'none';

  // Pending items queue
  renderPendingItems(pendingItems, isManager, s.status);

  const curArea = document.getElementById('current-item-area');
  if (currentItem) {
    curArea.style.display = '';
    document.getElementById('current-item-title').textContent = currentItem.title;
    const statusEl = document.getElementById('current-item-status');
    const votingActionsEl = document.getElementById('voting-actions');
    if (currentItem.status === 'voting') {
      statusEl.textContent = '⏳ Voting in progress...';
      statusEl.className = 'badge badge-warning';
      const voteCount = Object.keys(currentItem.votes).length;
      if (isManager) {
        votingActionsEl.innerHTML = `
          <button class="btn btn-primary btn-sm" onclick="revealVotes()" title="Reveal votes">
            👁️ Reveal Votes ${voteCount > 0 ? '(' + voteCount + ' votes)' : ''}
          </button>
        `;
      } else {
        votingActionsEl.innerHTML = '';
      }
    } else if (currentItem.status === 'revealed') {
      statusEl.textContent = '✅ Results Revealed';
      statusEl.className = 'badge badge-success';
      if (isManager) {
        votingActionsEl.innerHTML = `
          <button class="btn btn-danger btn-sm" onclick="closeVoting()">📥 Move to History</button>
        `;
      } else {
        votingActionsEl.innerHTML = '';
      }
    }
    const roundNum = currentItem.rounds ? currentItem.rounds.length + 1 : 1;
    document.getElementById('round-info').textContent = roundNum > 1 ? `Round ${roundNum}` : '';
  } else {
    curArea.style.display = 'none';
  }

  renderVotingCards(currentItem, scale, s.status);
  renderParticipants(currentItem);
  renderResults(currentItem, scale, isManager);
  renderItemsHistory(completedItems, scale);
}

function renderPendingItems(pendingItems, isManager, sessionStatus) {
  const area = document.getElementById('pending-items-area');
  const list = document.getElementById('pending-items-list');
  const countEl = document.getElementById('pending-count');

  if (pendingItems.length === 0) {
    area.style.display = 'none';
    return;
  }

  area.style.display = '';
  countEl.textContent = pendingItems.length;

  // Check if there's an active voting item (admin must reveal first)
  const hasActiveVoting = state.currentSession?.items.some(i => i.status === 'voting');

  list.innerHTML = pendingItems.map((item, idx) => `
    <div class="pending-item card" style="padding:10px 14px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:1rem"><strong>${idx + 1}.</strong> ${esc(item.title)}</span>
      ${isManager && sessionStatus === 'active' ? `
        <button class="btn btn-success btn-sm" onclick="startVoting('${item.id}')"
                ${hasActiveVoting ? 'disabled title="Please finish the current vote first"' : ''}>
          ▶️ Start Voting
        </button>
      ` : ''}
    </div>
  `).join('');
}

function renderVotingCards(currentItem, scale, sessionStatus) {
  const area = document.getElementById('voting-cards-area');
  const container = document.getElementById('voting-cards');

  if (!currentItem || currentItem.status !== 'voting' || sessionStatus !== 'active') {
    area.style.display = 'none';
    return;
  }

  area.style.display = '';
  const values = scale.values || [];
  const labels = scale.labels || {};

  container.innerHTML = values.map(v => {
    const isSelected = state.myVote === v;
    const label = labels[v] || '';
    const isSpecial = v === '?' || v === '☕' || v === '🤷';
    return `
      <div class="vote-card ${isSelected ? 'selected' : ''} ${isSpecial ? 'vote-card-special' : ''}"
           onclick="castVote('${escAttr(v)}')" title="${esc(label)}">
        <span>${v}</span>
        ${label ? `<span class="vote-label">${esc(label)}</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderParticipants(currentItem) {
  const s = state.currentSession;
  if (!s) return;

  const list = document.getElementById('participants-list');
  const countEl = document.getElementById('participants-count');
  const participants = s.participants || [];
  countEl.textContent = participants.length;

  list.innerHTML = participants.map(p => {
    let statusClass = '';
    let voteDisplay = '';

    if (currentItem) {
      const vote = currentItem.votes[p.id];
      if (currentItem.status === 'voting') {
        if (vote && vote.voted) {
          statusClass = 'voted';
          voteDisplay = '✓ Voted';
        } else {
          statusClass = 'not-voted';
          voteDisplay = '⏳ Waiting';
        }
      } else if (currentItem.status === 'revealed') {
        statusClass = 'revealed';
        voteDisplay = vote ? vote.value : '—';
      }
    }

    return `
      <div class="participant ${statusClass}">
        <span class="participant-avatar">${p.avatar}</span>
        <span class="participant-name">${esc(p.displayName)}</span>
        ${voteDisplay ? `<span class="participant-vote">${voteDisplay}</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderResults(currentItem, scale, isManager) {
  const area = document.getElementById('results-area');
  if (!currentItem || currentItem.status !== 'revealed') {
    area.style.display = 'none';
    return;
  }

  area.style.display = '';
  const result = currentItem.result;
  const summaryEl = document.getElementById('results-summary');
  const votesEl = document.getElementById('results-votes');
  const actionsEl = document.getElementById('results-actions');

  if (result) {
    summaryEl.innerHTML = `
      <div class="result-stat ${result.consensus ? 'consensus' : ''}">
        <div class="result-stat-value">${result.consensus ? '🎯' : ''} ${result.average ?? '—'}</div>
        <div class="result-stat-label">Average</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-value">${result.median ?? '—'}</div>
        <div class="result-stat-label">Median</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-value">${result.min ?? '—'}</div>
        <div class="result-stat-label">Minimum</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-value">${result.max ?? '—'}</div>
        <div class="result-stat-label">Maximum</div>
      </div>
      ${result.consensus ? `
        <div class="result-stat consensus" style="grid-column:1/-1">
          <div class="result-stat-value">🎉 Consensus!</div>
          <div class="result-stat-label">Everyone voted the same</div>
        </div>
      ` : ''}
    `;
    if (result.consensus) triggerConfetti();
  } else {
    summaryEl.innerHTML = '<p style="color:var(--text-muted)">Could not calculate results</p>';
  }

  const votes = Object.entries(currentItem.votes);
  votesEl.innerHTML = votes.map(([uid, v], i) => `
    <div class="result-vote-card animate-pop" style="animation-delay:${i * 0.1}s">
      <span class="rv-avatar">${v.avatar || '👤'}</span>
      <span class="rv-name">${esc(v.displayName || uid)}</span>
      <span class="rv-value">${v.value}</span>
    </div>
  `).join('');

  if (isManager && state.currentSession?.status === 'active') {
    actionsEl.innerHTML = `
      <button class="btn btn-warning" onclick="revote()">🔄 Revote</button>
      <button class="btn btn-danger" onclick="closeVoting()">📥 Move to History</button>
    `;
  } else {
    actionsEl.innerHTML = '';
  }
}

function renderItemsHistory(completedItems, scale) {
  const container = document.getElementById('items-history');
  const empty = document.getElementById('no-items');

  if (completedItems.length === 0) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  const isManager = ['admin', 'session_manager'].includes(state.user.role);

  container.innerHTML = completedItems.map((item, idx) => {
    const isExpanded = state.expandedHistory.has(item.id);
    const result = item.result;
    const voteCount = Object.keys(item.votes).length;
    const roundCount = (item.rounds?.length || 0) + 1;

    let detailHTML = '';
    if (isExpanded) {
      const voteEntries = Object.entries(item.votes);
      detailHTML = `
        <div class="history-item-detail" style="margin-top:10px">
          ${item.status === 'revealed' && result ? `
            <div style="margin-bottom:10px;font-size:0.9rem;color:var(--text-secondary)">
              Avg: <strong style="color:var(--accent)">${result.average}</strong> &nbsp;|&nbsp;
              Med: <strong>${result.median}</strong> &nbsp;|&nbsp;
              Min: ${result.min} &nbsp;|&nbsp; Max: ${result.max}
              ${result.consensus ? ' &nbsp;|&nbsp; 🎯 Consensus!' : ''}
            </div>
          ` : ''}
          ${voteEntries.length > 0 ? `
            <div class="history-votes-grid">
              ${voteEntries.map(([uid, v]) => `
                <span class="history-vote-chip">
                  <span class="hv-name">${v.avatar || '👤'} ${esc(v.displayName || uid)}</span>
                  <span class="hv-value">${v.value}</span>
                </span>
              `).join('')}
            </div>
          ` : '<p style="color:var(--text-muted);font-size:0.9rem">No votes cast</p>'}
          ${isManager ? `
            <div style="margin-top:10px">
              <button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); revoteHistoryItem('${item.id}')">🔄 Revote</button>
            </div>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="history-item ${isExpanded ? 'expanded' : ''}" onclick="toggleHistoryItem('${item.id}')" style="cursor:pointer">
        <div class="history-item-header">
          <span class="history-item-title">${esc(item.title)}</span>
          <span class="badge ${item.status === 'revealed' ? 'badge-success' : 'badge-warning'}">
            ${item.status === 'revealed' ? '✅' : '⏳'}
          </span>
        </div>
        <div class="history-item-meta">
          <span>👥 ${voteCount} votes</span>
          ${result ? `<span>📊 Avg: ${result.average}</span>` : ''}
          ${roundCount > 1 ? `<span>🔄 ${roundCount} rounds</span>` : ''}
          ${result?.consensus ? '<span>🎯 Consensus</span>' : ''}
          <span style="margin-left:auto;font-size:0.85rem;color:var(--text-muted)">${isExpanded ? '▲ Collapse' : '▼ Details'}</span>
        </div>
        ${detailHTML}
      </div>
    `;
  }).join('');
}

function toggleHistoryItem(itemId) {
  if (state.expandedHistory.has(itemId)) {
    state.expandedHistory.delete(itemId);
  } else {
    state.expandedHistory.add(itemId);
  }
  renderSession();
}

async function revoteHistoryItem(itemId) {
  if (!state.currentSessionId) return;
  state.myVote = null;
  try {
    await api('POST', `/api/sessions/${state.currentSessionId}/items/${itemId}/revote`);
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// ─── Session Actions (REST API) ─────────────────────────────────────────────
async function castVote(value) {
  const s = state.currentSession;
  if (!s) return;
  const currentItem = s.items.find(i => i.id === s.currentItemId);
  if (!currentItem || currentItem.status !== 'voting') return;

  state.myVote = value;
  const cards = document.querySelectorAll('.vote-card');
  cards.forEach(c => {
    const cardValue = c.querySelector('span').textContent;
    c.classList.toggle('selected', cardValue === value);
  });

  try {
    await api('POST', `/api/sessions/${s.id}/items/${currentItem.id}/vote`, { value });
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function addItem() {
  const input = document.getElementById('new-item-input');
  const title = input.value.trim();
  if (!title || !state.currentSessionId) return;
  try {
    await api('POST', `/api/sessions/${state.currentSessionId}/items`, { title });
    input.value = '';
    showNotification('Item added, pending voting', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function startVoting(itemId) {
  if (!state.currentSessionId) return;
  state.myVote = null;
  try {
    await api('POST', `/api/sessions/${state.currentSessionId}/items/${itemId}/start`);
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function revealVotes() {
  const s = state.currentSession;
  if (!s) return;
  const currentItem = s.items.find(i => i.id === s.currentItemId);
  if (!currentItem) return;
  try {
    await api('POST', `/api/sessions/${s.id}/items/${currentItem.id}/reveal`);
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function revote() {
  const s = state.currentSession;
  if (!s) return;
  const currentItem = s.items.find(i => i.id === s.currentItemId);
  if (!currentItem) return;
  state.myVote = null;
  try {
    await api('POST', `/api/sessions/${s.id}/items/${currentItem.id}/revote`);
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function closeCurrentSession() {
  const s = state.currentSession;
  if (!s) return;
  try {
    await api('PUT', `/api/sessions/${s.id}/status`, { status: 'closed' });
    showNotification('Session closed', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function reopenCurrentSession() {
  const s = state.currentSession;
  if (!s) return;
  try {
    await api('PUT', `/api/sessions/${s.id}/status`, { status: 'active' });
    showNotification('Session reopened', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function closeVoting() {
  const s = state.currentSession;
  if (!s) return;
  const currentItem = s.items.find(i => i.id === s.currentItemId);
  if (!currentItem) return;
  try {
    await api('POST', `/api/sessions/${s.id}/items/${currentItem.id}/close`);
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// ═══ PROFILE & THEMES ══════════════════════════════════════════════════════
const THEMES = [
  { id: 'midnight', name: 'Midnight', icon: '🌙', color: '#7c3aed' },
  { id: 'ocean', name: 'Ocean', icon: '🌊', color: '#3b82f6' },
  { id: 'forest', name: 'Forest', icon: '🌲', color: '#10b981' },
  { id: 'sunset', name: 'Sunset', icon: '🌅', color: '#f97316' },
  { id: 'rose', name: 'Rose', icon: '🌹', color: '#ec4899' },
  { id: 'light', name: 'Light', icon: '☀️', color: '#6366f1' },
];

function applyTheme(theme) {
  if (theme && theme !== 'midnight') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('pp_theme', theme || 'midnight');
}

function showProfileModal() {
  const u = state.user;
  const avatars = ['👑','🦊','🐱','🐶','🐼','🦁','🐸','🐵','🦄','🐲','🦅','🐺','🦈','🐍','🦋','🐢','🦉','🐧','🐙','🎯','🚀','⚡','🔥','💎','🎸','🎮','🏆','🌟'];
  const currentTheme = u.theme || 'midnight';

  showModal('👤 Profile Settings', `
    <div class="input-group">
      <label>Display Name</label>
      <input type="text" id="profile-displayname" value="${esc(u.displayName)}">
    </div>
    <div class="input-group">
      <label>Avatar</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${avatars.map(a => `
          <span class="vote-card" style="width:40px;height:40px;font-size:1.2rem;${a === u.avatar ? 'border-color:var(--accent)' : ''}"
                onclick="selectProfileAvatar(this,'${a}')" data-avatar="${a}">${a}</span>
        `).join('')}
      </div>
      <input type="hidden" id="profile-avatar" value="${u.avatar}">
    </div>
    <div class="input-group">
      <label>Theme</label>
      <div class="theme-grid">
        ${THEMES.map(t => `
          <div class="theme-option ${t.id === currentTheme ? 'selected' : ''}" onclick="selectTheme(this, '${t.id}')" data-theme="${t.id}">
            <span class="theme-swatch" style="background:${t.color}"></span>
            <span>${t.icon} ${t.name}</span>
          </div>
        `).join('')}
      </div>
      <input type="hidden" id="profile-theme" value="${currentTheme}">
    </div>
    <button class="btn btn-primary btn-block" onclick="saveProfile()">💾 Save Profile</button>
    <hr style="border-color:var(--border);margin:20px 0">
    <h4 style="margin-bottom:12px;font-size:0.95rem">🔒 Change Password</h4>
    <div class="input-group">
      <label>Current Password</label>
      <input type="password" id="profile-current-pw" placeholder="••••••">
    </div>
    <div class="input-group">
      <label>New Password</label>
      <input type="password" id="profile-new-pw" placeholder="••••••">
    </div>
    <button class="btn btn-warning btn-block" onclick="changePassword()">🔑 Change Password</button>
  `);
}

function selectProfileAvatar(el, avatar) {
  el.parentElement.querySelectorAll('.vote-card').forEach(c => c.style.borderColor = '');
  el.style.borderColor = 'var(--accent)';
  document.getElementById('profile-avatar').value = avatar;
}

function selectTheme(el, themeId) {
  document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('profile-theme').value = themeId;
  applyTheme(themeId);
}

async function saveProfile() {
  const displayName = document.getElementById('profile-displayname').value.trim();
  const avatar = document.getElementById('profile-avatar').value;
  const theme = document.getElementById('profile-theme').value;
  if (!displayName) return showNotification('Display name cannot be empty', 'warning');
  try {
    const data = await api('PUT', '/api/me', { displayName, avatar, theme });
    state.user.displayName = data.displayName;
    state.user.avatar = data.avatar;
    state.user.theme = data.theme;
    document.getElementById('user-badge').textContent = `${state.user.avatar} ${state.user.displayName}`;
    applyTheme(theme);
    hideModal();
    showNotification('Profile updated! ✨', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function changePassword() {
  const currentPassword = document.getElementById('profile-current-pw').value;
  const newPassword = document.getElementById('profile-new-pw').value;
  if (!currentPassword || !newPassword) return showNotification('Please fill in both password fields', 'warning');
  try {
    await api('PUT', '/api/me/password', { currentPassword, newPassword });
    document.getElementById('profile-current-pw').value = '';
    document.getElementById('profile-new-pw').value = '';
    showNotification('Password changed! 🔑', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// ═══ ADMIN ══════════════════════════════════════════════════════════════════
async function loadUsers() {
  try {
    const usersList = await api('GET', '/api/users');
    renderUsers(usersList);
  } catch (err) {
    showNotification('Failed to load users: ' + err.message, 'error');
  }
}

function renderUsers(usersList) {
  const container = document.getElementById('users-table-container');
  const roleLabels = { admin: '👑 Admin', session_manager: '📋 Session Manager', voter: '🗳️ Voter' };
  const roleColors = { admin: 'badge-danger', session_manager: 'badge-warning', voter: 'badge-info' };

  container.innerHTML = `
    <table class="users-table">
      <thead>
        <tr>
          <th></th>
          <th>Username</th>
          <th>Display Name</th>
          <th>Role</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${usersList.map(u => `
          <tr style="${!u.active ? 'opacity:0.5' : ''}">
            <td class="user-avatar">${u.avatar}</td>
            <td><strong>${esc(u.username)}</strong></td>
            <td>${esc(u.displayName)}</td>
            <td><span class="badge role-badge ${roleColors[u.role] || ''}">${roleLabels[u.role] || u.role}</span></td>
            <td><span class="badge ${u.active ? 'badge-success' : 'badge-danger'}">${u.active ? 'Active' : 'Inactive'}</span></td>
            <td class="user-actions">
              <button class="btn btn-ghost btn-sm" onclick="showEditUserModal('${u.id}','${escAttr(u.username)}','${escAttr(u.displayName)}','${u.role}','${u.avatar}',${u.active})">✏️</button>
              ${u.username !== 'admin' ? `<button class="btn btn-ghost btn-sm" onclick="toggleUserActive('${u.id}',${!u.active})">${u.active ? '🚫' : '✅'}</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function showAddUserModal() {
  const avatars = ['🦊','🐱','🐶','🐼','🦁','🐸','🐵','🦄','🐲','🦅','🐺','🦈','🐍','🦋','🐢','🦉','🐧','🐙'];
  showModal('Add New User', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
      <div class="input-group">
        <label>Username</label>
        <input type="text" id="new-username" placeholder="username" required>
      </div>
      <div class="input-group">
        <label>Display Name</label>
        <input type="text" id="new-displayname" placeholder="Full Name" required>
      </div>
      <div class="input-group">
        <label>Password</label>
        <input type="password" id="new-password" placeholder="••••••" required>
      </div>
      <div class="input-group">
        <label>Role</label>
        <select id="new-role">
          <option value="voter">🗳️ Voter</option>
          <option value="session_manager">📋 Session Manager</option>
          <option value="admin">👑 Admin</option>
        </select>
      </div>
    </div>
    <div class="input-group">
      <label>Avatar</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${avatars.map((a, i) => `
          <span class="vote-card" style="width:40px;height:40px;font-size:1.2rem;${i === 0 ? 'border-color:var(--accent)' : ''}"
                onclick="selectAvatar(this,'${a}')" data-avatar="${a}">${a}</span>
        `).join('')}
      </div>
      <input type="hidden" id="new-avatar" value="${avatars[0]}">
    </div>
    <button class="btn btn-primary btn-block" onclick="createUser()">Create User</button>
  `);
  setTimeout(() => document.getElementById('new-username')?.focus(), 200);
}

function selectAvatar(el, avatar) {
  el.parentElement.querySelectorAll('.vote-card').forEach(c => c.style.borderColor = '');
  el.style.borderColor = 'var(--accent)';
  document.getElementById('new-avatar').value = avatar;
}

async function createUser() {
  const username = document.getElementById('new-username').value.trim();
  const displayName = document.getElementById('new-displayname').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const avatar = document.getElementById('new-avatar').value;
  if (!username || !displayName || !password)
    return showNotification('Please fill in all fields', 'warning');
  try {
    await api('POST', '/api/users', { username, displayName, password, role, avatar });
    hideModal();
    loadUsers();
    showNotification('User created! 🎉', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

function showEditUserModal(id, username, displayName, role, avatar, active) {
  showModal('Edit User', `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
      <div class="input-group">
        <label>Username</label>
        <input type="text" value="${esc(username)}" disabled style="opacity:0.5">
      </div>
      <div class="input-group">
        <label>Display Name</label>
        <input type="text" id="edit-displayname" value="${esc(displayName)}">
      </div>
      <div class="input-group">
        <label>New Password (leave blank to keep)</label>
        <input type="password" id="edit-password" placeholder="••••••">
      </div>
      <div class="input-group">
        <label>Role</label>
        <select id="edit-role">
          <option value="voter" ${role === 'voter' ? 'selected' : ''}>🗳️ Voter</option>
          <option value="session_manager" ${role === 'session_manager' ? 'selected' : ''}>📋 Session Manager</option>
          <option value="admin" ${role === 'admin' ? 'selected' : ''}>👑 Admin</option>
        </select>
      </div>
    </div>
    <button class="btn btn-primary btn-block" onclick="updateUser('${id}')">Save</button>
  `);
}

async function updateUser(id) {
  const displayName = document.getElementById('edit-displayname').value.trim();
  const password = document.getElementById('edit-password').value;
  const role = document.getElementById('edit-role').value;
  const body = { displayName, role };
  if (password) body.password = password;
  try {
    await api('PUT', `/api/users/${id}`, body);
    hideModal();
    loadUsers();
    showNotification('User updated', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

async function toggleUserActive(id, active) {
  try {
    await api('PUT', `/api/users/${id}`, { active });
    loadUsers();
    showNotification(active ? 'User activated' : 'User deactivated', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

// ═══ MODAL ══════════════════════════════════════════════════════════════════
function showModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function hideModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

// ═══ NOTIFICATIONS ══════════════════════════════════════════════════════════
function showNotification(message, type = 'info') {
  const container = document.getElementById('notifications');
  const el = document.createElement('div');
  el.className = `notification ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ═══ CONFETTI ═══════════════════════════════════════════════════════════════
function triggerConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#7c3aed', '#06d6a0', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 6 + 3,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10
    });
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.rotation += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - frame / 120);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    frame++;
    if (frame < 120) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  animate();
}

// ═══ UTILITIES ══════════════════════════════════════════════════════════════
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function escAttr(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US');
}

// ═══ EVENT BINDINGS ═════════════════════════════════════════════════════════
function bindEvents() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  document.querySelectorAll('.tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      state.sessionTab = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
      renderSessions();
    });
  });

  document.getElementById('create-session-btn').addEventListener('click', showCreateSessionModal);
  document.getElementById('add-user-btn').addEventListener('click', showAddUserModal);
  document.getElementById('back-to-dashboard').addEventListener('click', () => showView('dashboard'));

  document.getElementById('add-item-btn').addEventListener('click', addItem);
  document.getElementById('new-item-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addItem();
  });

  document.getElementById('modal-close').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
  });
}

// ═══ INIT ═══════════════════════════════════════════════════════════════════
async function init() {
  bindEvents();
  const loggedIn = await tryAutoLogin();
  if (loggedIn) {
    showApp();
  }
}

window.PP = { showView };

document.addEventListener('DOMContentLoaded', init);
