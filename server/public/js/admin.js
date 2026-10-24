(function () {
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const state = {
    actor: null,
    configured: true,
    route: 'dashboard',
    id: '',
    data: {},
    loading: false,
    error: '',
    toast: '',
    modal: null,
    searchHits: [],
    days: 7,
    page: 1,
    filters: { q: '', role: 'all', status: 'all', pay: 'all', category: 'all' },
    form: {},
    clock: '',
    perms: [],
    hint: '',
    apiOk: true,
  };

  function tokenGet() {
    try { return sessionStorage.getItem('qb_admin_tok') || ''; } catch (_) { return ''; }
  }
  function tokenSet(t) {
    try {
      if (t) sessionStorage.setItem('qb_admin_tok', t);
      else sessionStorage.removeItem('qb_admin_tok');
    } catch (_) {}
  }

  const ICONS = {
    dash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    shops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1-4h16l1 4"/><path d="M4 9h16v11H4z"/><path d="M9 22v-6h6v6"/></svg>',
    riders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 18h7l3-7h4"/><path d="M9 11l3 7"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h12v4H6z"/><path d="M4 6h16l-1 14H5L4 6z"/></svg>',
    wd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16l3-5 3 3 5-8"/></svg>',
    anal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6 3"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L12 2l-1.8 4a7 7 0 0 0-1.7 1L6 6l-2 3.5L6 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1L12 22l1.8-4a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
  };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dash', perm: 'dashboard' },
    { id: 'users', label: 'Users', icon: 'users', perm: 'usersRead' },
    { id: 'shops', label: 'Shops', icon: 'shops', perm: 'shopsRead' },
    { id: 'riders', label: 'Riders', icon: 'riders', perm: 'ridersRead' },
    { id: 'orders', label: 'Orders', icon: 'orders', perm: 'ordersRead' },
    { id: 'withdrawals', label: 'Withdrawals', icon: 'wd', perm: 'withdrawals' },
    { id: 'support', label: 'Questions & Support', icon: 'help', perm: 'support' },
    { id: 'reports', label: 'Reports', icon: 'chart', perm: 'reports' },
    { id: 'analytics', label: 'Analytics', icon: 'anal', perm: 'analytics' },
    { id: 'settings', label: 'Settings', icon: 'gear', perm: 'config' },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) {
    n = Math.round(Number(n) || 0);
    return 'Rs. ' + n.toLocaleString('en-LK');
  }
  function when(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts : ts);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
  }
  function initials(name) {
    const p = String(name || 'A').trim().split(/\s+/);
    return ((p[0] && p[0][0]) || 'A').toUpperCase();
  }
  const ROLE_PERMS = {
    super: '*',
    finance: ['dashboard','usersRead','shopsRead','ridersRead','ordersRead','withdrawals','analytics','reports','notifications','audit'],
    support: ['dashboard','usersRead','shopsRead','ridersRead','ordersRead','support','notifications'],
    operations: ['dashboard','users','usersRead','shops','shopsRead','riders','ridersRead','orders','ordersRead','notifications'],
  };
  function allowed(perm) {
    if (!state.actor) return false;
    if (state.actor.role === 'super') return true;
    if (state.perms && state.perms.length) return state.perms.indexOf(perm) >= 0;
    const list = ROLE_PERMS[state.actor.role] || [];
    return list === '*' || list.indexOf(perm) >= 0;
  }
  function parseHash() {
    const h = String(location.hash || '#/dashboard').replace(/^#\/?/, '');
    const parts = h.split('/').filter(Boolean);
    state.route = parts[0] || 'dashboard';
    state.id = parts[1] ? decodeURIComponent(parts[1]) : '';
  }
  function go(path) {
    location.hash = '#/' + String(path || 'dashboard').replace(/^#\/?/, '');
  }

  async function api(action, payload) {
    const tok = tokenGet();
    const res = await fetch('/api/admin', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': payload && payload.idempotencyKey || '',
        Authorization: tok ? ('Bearer ' + tok) : '',
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {})),
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
    if (!res.ok && !data.message && /<!doctype|<html/i.test(text)) {
      throw new Error('Admin API is not on this host. Production tracks main — merge PR #6, or open the Preview URL and set Preview env vars, then Retry.');
    }
    if (res.status === 401) {
      state.actor = null;
      tokenSet('');
      throw Object.assign(new Error(data.message || 'Wrong email or password.'), { auth: true });
    }
    if (res.status === 403) {
      state.route = 'unauthorized';
      throw Object.assign(new Error(data.message || 'Not allowed.'), { forbidden: true });
    }
    if (!res.ok || data.ok === false) throw new Error(data.message || ('Request failed (' + res.status + ')'));
    return data;
  }

  function toast(msg) {
    state.toast = msg;
    render();
    setTimeout(() => { if (state.toast === msg) { state.toast = ''; render(); } }, 3200);
  }

  function badge(status) {
    const s = String(status || '').toLowerCase().replace(/_/g, ' ');
    let k = 'muted';
    if (/deliver|active|approv|complete|online|resolv|closed|open shop|captured/.test(s)) k = 'ok';
    else if (/pend|prepar|new|wait/.test(s)) k = 'warn';
    else if (/way|progress|ready|info/.test(s)) k = 'info';
    else if (/cancel|reject|suspend|offline|fail/.test(s)) k = 'danger';
    else if (/restrict/.test(s)) k = 'purple';
    const label = s.replace(/\b\w/g, (c) => c.toUpperCase());
    return `<span class="ad-badge ${k}">${esc(label || '—')}</span>`;
  }
  function rateMarks(n) {
    n = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    if (!n) return '<span class="ad-muted">—</span>';
    let html = '<span class="ad-rate-mark" title="' + n + ' / 5">';
    for (let i = 1; i <= 5; i++) html += `<span class="${i <= n ? 'on' : ''}">★</span>`;
    return html + '</span>';
  }

  function pager(p) {
    if (!p || p.pages <= 1) return '';
    let html = '<div class="ad-pager">';
    for (let i = 1; i <= Math.min(p.pages, 8); i++) {
      html += `<button type="button" class="${i === p.page ? 'on' : ''}" data-page="${i}">${i}</button>`;
    }
    html += '</div>';
    return html;
  }

  function navHtml() {
    return NAV.filter((n) => n.perm === 'dashboard' || allowed(n.perm) || n.id === 'dashboard').map((n) => {
      const on = state.route === n.id || (n.id === 'users' && state.route === 'user') || (n.id + 's' === state.route + 's');
      const active = state.route === n.id || (state.route === n.id.replace(/s$/, '') );
      return `<a href="#/${n.id}" class="${state.route === n.id ? 'on' : ''}">${ICONS[n.icon] || ''}<span>${esc(n.label)}</span></a>`;
    }).join('');
  }

  function shell(inner) {
    const unread = (state.data && state.data.unread) || 0;
    return `<div class="ad-app" id="adApp">
      <aside class="ad-side">
        <div class="ad-brand"><span class="mark">Q</span><span>QuickBite</span></div>
        <div class="sub">Admin Panel</div>
        <nav class="ad-nav">${navHtml()}</nav>
        <div class="ad-side-foot">
          <div class="ad-ava">${esc(initials(state.actor && state.actor.name))}</div>
          <div class="who grow"><b>${esc((state.actor && state.actor.name) || 'Admin')}</b><span>${esc((state.actor && state.actor.role) || '')}</span></div>
        </div>
      </aside>
      <div class="ad-main">
        <header class="ad-top">
          <button class="ad-iconbtn ad-burger" type="button" data-nav>☰</button>
          <div class="ad-search">
            <span class="ico">⌕</span>
            <input id="adSearch" placeholder="Search anything…" autocomplete="off" />
            <div class="ad-hits" id="adHits"></div>
          </div>
          <button class="ad-iconbtn" type="button" data-go="notifications" title="Notifications">${ICONS.bell}${unread ? '<span class="dot"></span>' : ''}</button>
          <div class="ad-clock">${esc(state.clock || (state.data && state.data.clock && state.data.clock.label) || '')}</div>
          <div class="ad-ava" title="${esc(state.actor && state.actor.email || '')}">${esc(initials(state.actor && state.actor.name))}</div>
          <button class="ad-btn ghost sm" type="button" id="adLogout">Sign out</button>
        </header>
        <main class="ad-page" id="main">${inner}</main>
      </div>
      ${state.modal || ''}
      ${state.toast ? `<div class="ad-toast">${esc(state.toast)}</div>` : ''}
    </div>`;
  }

  function loginView() {
    const cfg = state.configured;
    let lead = 'Sign in with ADMIN_EMAIL and ADMIN_PASSWORD from Cloudflare Pages.';
    if (!state.apiOk) lead = 'This URL has no Admin API. Merge PR #6 to main (Production), or use the Preview deployment and set Preview variables.';
    else if (state.hint === 'missing_email') lead = 'ADMIN_EMAIL is not on this deployment. Add it for Production and Preview, then Deployments → Retry.';
    else if (state.hint === 'missing_password') lead = 'ADMIN_PASSWORD is not on this deployment. Add the secret for Production and Preview, then Retry.';
    else if (state.hint === 'password_short') lead = 'ADMIN_PASSWORD must be at least 8 characters. Update the secret, then Retry.';
    else if (!cfg) lead = 'Admin sign-in is not configured on this host yet.';
    return `<div class="ad-login"><form class="ad-login-card" id="adLogin">
      <div class="ad-brand"><span class="mark">Q</span><span>QuickBite</span></div>
      <h1>Admin Panel</h1>
      <p class="lead">${esc(lead)}</p>
      ${state.error ? `<div class="ad-error">${esc(state.error)}</div>` : ''}
      <label class="ad-lab">Email</label>
      <input class="ad-input" name="email" type="email" autocomplete="username" required ${cfg ? '' : 'disabled'} />
      <label class="ad-lab">Password</label>
      <input class="ad-input" name="password" type="password" autocomplete="current-password" required minlength="8" ${cfg ? '' : 'disabled'} />
      <div style="height:14px"></div>
      <button class="ad-btn" type="submit" ${cfg ? '' : 'disabled'} style="width:100%">Sign in</button>
    </form></div>`;
  }

  function kpis(m) {
    const t = (m && m.totals) || {};
    const cells = [
      { label: 'Total Users', val: t.users, tile: '', icon: ICONS.users },
      { label: 'Total Shops', val: t.shops, tile: 'amber', icon: ICONS.shops },
      { label: 'Total Riders', val: t.riders, tile: '', icon: ICONS.riders },
      { label: 'Total Orders', val: t.orders, tile: 'blue', icon: ICONS.orders },
      { label: 'Total Revenue', val: money(t.gmv), tile: 'purple', icon: ICONS.wd },
    ];
    return `<div class="ad-grid ad-kpis">${cells.map((c) => `<div class="ad-card ad-kpi">
      <div class="tile ${c.tile}">${c.icon}</div>
      <div><label>${c.label}</label><b>${esc(c.val)}</b><div class="ad-delta">Live · this range</div></div>
    </div>`).join('')}</div>`;
  }

  function dashboardView() {
    const d = state.data || {};
    const m = d.metrics || { totals: {}, byDay: {}, categories: {}, topShops: [] };
    const orders = d.recentOrders || [];
    const wds = d.recentWithdrawals || [];
    const warn = (d.warnings || []).map((w) => `<div class="ad-warn">${esc(w)}</div>`).join('');
    return `${warn}
      <div class="ad-head">
        <div><h1>Dashboard</h1><p>Overview of your platform’s performance</p></div>
        <select class="ad-input" id="adDays" style="width:auto">
          <option value="7" ${state.days===7?'selected':''}>Last 7 days</option>
          <option value="30" ${state.days===30?'selected':''}>Last 30 days</option>
          <option value="90" ${state.days===90?'selected':''}>Last 90 days</option>
        </select>
      </div>
      ${kpis(m)}
      <div class="ad-grid ad-split" style="margin-top:14px">
        <div class="ad-card">
          <h2>Order Overview</h2>
          <div class="ad-legend"><span><i style="background:var(--ad-primary)"></i>Completed</span><span><i style="background:var(--ad-warning)"></i>Pending</span><span><i style="background:var(--ad-purple)"></i>Cancelled</span></div>
          <canvas class="ad-chart" id="chartOrders" width="640" height="220"></canvas>
        </div>
        <div class="ad-card">
          <h2>Live Map</h2>
          <div class="ad-map" id="adMap"></div>
          <div class="ad-map-key"><span class="rider">Rider (live job coords only)</span><span class="shop">Shop</span><span class="customer">Customer drop-off</span></div>
        </div>
      </div>
      <div class="ad-grid ad-three" style="margin-top:14px">
        <div class="ad-card">
          <h2>Recent Orders</h2>
          ${tableOrders(orders)}
        </div>
        <div class="ad-card">
          <h2>Quick Actions</h2>
          <div class="ad-qa">
            <button type="button" data-go="users" data-open="user"><span class="ico g">${ICONS.users}</span>Add User</button>
            <button type="button" data-go="shops" data-open="shop"><span class="ico p">${ICONS.shops}</span>Add Shop</button>
            <button type="button" data-go="riders" data-open="rider"><span class="ico b">${ICONS.riders}</span>Add Rider</button>
            <button type="button" data-go="orders"><span class="ico pk">${ICONS.orders}</span>Orders</button>
            <button type="button" data-go="withdrawals"><span class="ico am">${ICONS.wd}</span>Withdraw Request</button>
            <button type="button" data-go="support"><span class="ico cy">${ICONS.help}</span>Support Ticket</button>
          </div>
        </div>
        <div class="ad-card">
          <h2>Recent Withdrawals <a class="more" href="#/withdrawals">View All</a></h2>
          ${wds.length ? `<table class="ad-table"><tbody>${wds.map((w) => `<tr>
            <td><div class="ad-person"><div class="ad-ava">${esc(initials(w.name))}</div><div><b>${esc(w.name)}</b><small>${esc(w.role)}</small></div></div></td>
            <td>${money(w.amount)}</td>
            <td>${badge(w.status)}</td>
          </tr>`).join('')}</tbody></table>` : `<div class="ad-empty">No withdrawal requests yet.</div>`}
        </div>
      </div>`;
  }

  function tableOrders(rows) {
    if (!rows.length) return '<div class="ad-empty">No orders in this view.</div>';
    return `<table class="ad-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Shop</th><th>Rider</th><th>Status</th><th>Amount</th></tr></thead><tbody>
      ${rows.map((o) => `<tr data-href="#/orders/${esc(o.id)}">
        <td><a href="#/orders/${esc(o.id)}">${esc(o.id)}</a></td>
        <td>${esc(o.customerName)}</td>
        <td>${esc(o.shopName)}</td>
        <td>${esc(o.riderName || '—')}</td>
        <td>${badge(labelStatus(o.status))}</td>
        <td>${money(o.totalAmount)}</td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  function labelStatus(s) {
    s = String(s || '');
    if (s === 'on_the_way' || s === 'picked_up') return 'On the Way';
    if (s === 'preparing' || s === 'accepted') return 'Preparing';
    if (s === 'pending') return 'Waiting for confirm';
    return s.replace(/_/g, ' ');
  }

  function listChrome(title, sub, extra, body) {
    return `<div class="ad-head"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>${extra || ''}</div>${body}`;
  }

  function usersView() {
    const d = state.data || {};
    const rows = d.rows || [];
    const c = d.counts || {};
    const extra = allowed('users') ? `<button class="ad-btn" type="button" data-open="user">+ Add User</button>` : '';
    return listChrome('Users Management', 'Manage all users (Customers, Shop Owners, Riders)', extra, `
      <div class="ad-tabs">
        ${tabBtn('role', 'all', 'All (' + (c.all || 0) + ')')}
        ${tabBtn('role', 'customer', 'Customers (' + (c.customer || 0) + ')')}
        ${tabBtn('role', 'shop', 'Shops (' + (c.shop || 0) + ')')}
        ${tabBtn('role', 'rider', 'Riders (' + (c.rider || 0) + ')')}
      </div>
      <div class="ad-filters">
        <input id="adQ" value="${esc(state.filters.q)}" placeholder="Search by name, phone or email…" />
        <select id="adStatus"><option value="all">Status: All</option><option value="active" ${state.filters.status==='active'?'selected':''}>Active</option><option value="suspended" ${state.filters.status==='suspended'?'selected':''}>Suspended</option><option value="restricted" ${state.filters.status==='restricted'?'selected':''}>Restricted</option></select>
      </div>
      ${rows.length ? `<div class="ad-card" style="padding:0 8px"><table class="ad-table">
        <thead><tr><th>Name</th><th>Phone</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((u) => `<tr>
          <td><div class="ad-person"><div class="ad-ava">${esc(initials(u.name))}</div><div><b>${esc(u.name)}</b><small>${esc(u.emailMasked)}</small></div></div></td>
          <td>${esc(u.phoneMasked)}</td>
          <td>${esc(u.role)}</td>
          <td>${badge(u.status)}</td>
          <td><a class="ad-btn ghost sm" href="#/users/${esc(u.id)}">View</a></td>
        </tr>`).join('')}</tbody>
      </table>${pager(d)}</div>` : '<div class="ad-empty">No accounts match.</div>'}`);
  }

  function tabBtn(key, val, label) {
    const on = (state.filters[key] || 'all') === val;
    return `<button type="button" class="${on ? 'on' : ''}" data-filter="${key}" data-val="${val}">${esc(label)}</button>`;
  }

  function userDetailView() {
    const a = state.data.account;
    if (!a) return '<div class="ad-empty">Account not found.</div>';
    return `<div class="ad-head"><div><h1>${esc(a.name)}</h1><p>${esc(a.role)} · ${esc(a.emailMasked)}</p></div>
      <a class="ad-btn ghost" href="#/users">Back</a></div>
      <div class="ad-detail">
        <div class="ad-card">
          <h2>Profile</h2>
          <dl class="ad-kv">
            <dt>Phone</dt><dd>${esc(a.phoneMasked)}</dd>
            <dt>Status</dt><dd>${badge(a.status)}</dd>
            <dt>Shop</dt><dd>${esc(a.shopId || '—')}</dd>
            <dt>Vehicle</dt><dd>${esc(a.vehicle || '—')}</dd>
          </dl>
          ${a.history && a.history.length ? `<h2 style="margin-top:16px">Audit</h2><table class="ad-table"><tbody>${a.history.map((h) => `<tr><td>${esc(when(h.ts))}</td><td>${esc(h.from)} → ${esc(h.to)}</td><td>${esc(h.reason)}</td></tr>`).join('')}</tbody></table>` : ''}
        </div>
        <div class="ad-card">
          <h2>Actions</h2>
          ${allowed('users') ? `
            <label class="ad-lab">Reason (required to suspend / restrict)</label>
            <textarea class="ad-area" id="stReason" placeholder="Why?"></textarea>
            <div class="ad-modal-actions" style="justify-content:flex-start">
              <button class="ad-btn sm" data-status="active">Reactivate</button>
              <button class="ad-btn warn sm" data-status="restricted">Restrict</button>
              <button class="ad-btn danger sm" data-status="suspended">Suspend</button>
            </div>
            <p class="ad-delta">Suspended accounts cannot sign in. Restricted accounts cannot place or accept jobs.</p>
          ` : '<p class="ad-delta">Read only.</p>'}
        </div>
      </div>
      <div class="ad-card" style="margin-top:14px"><h2>Orders</h2>${tableOrders(state.data.orders || [])}</div>`;
  }

  function shopsView() {
    const d = state.data || {};
    const rows = d.rows || [];
    const c = d.counts || {};
    const extra = allowed('shops') ? `<button class="ad-btn" data-open="shop">+ Add Shop</button>` : '';
    return listChrome('Shops Management', 'Manage all shops and their information', extra, `
      <div class="ad-tabs">${tabBtn('status','all','All Shops ('+(c.all||0)+')')}${tabBtn('status','active','Active ('+(c.active||0)+')')}${tabBtn('status','closed','Closed ('+(c.closed||0)+')')}</div>
      <div class="ad-filters"><input id="adQ" value="${esc(state.filters.q)}" placeholder="Search by shop name or owner…" /></div>
      ${rows.length ? `<div class="ad-card" style="padding:0 8px"><table class="ad-table">
        <thead><tr><th>Shop Name</th><th>Category</th><th>Owner</th><th>Rating</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((s) => `<tr>
          <td><div class="ad-person"><div class="ad-ava">${s.image ? `<img src="${esc(s.image)}" alt="">` : esc(initials(s.name))}</div><b>${esc(s.name)}</b></div></td>
          <td>${esc(s.category)}</td>
          <td>${esc(s.ownerName || '—')}</td>
          <td>${s.reviews ? ('★ ' + Number(s.rating).toFixed(1)) : 'New'}</td>
          <td>${badge(s.listStatus === 'closed' ? 'Closed' : 'Active')}</td>
          <td><a class="ad-btn ghost sm" href="#/shops/${esc(s.id)}">View</a></td>
        </tr>`).join('')}</tbody></table>${pager(d)}</div>` : '<div class="ad-empty">No shops yet. Live catalog is empty until partners register.</div>'}`);
  }

  function shopDetailView() {
    const s = state.data.shop;
    if (!s) return '<div class="ad-empty">Shop not found.</div>';
    const items = state.data.items || [];
    return `<div class="ad-head"><div><h1>${esc(s.name)}</h1><p>${esc(s.category)} · ${esc(s.address)}</p></div>
      <div>${allowed('shops') ? `<button class="ad-btn ghost" data-shop-open="${s.isOpen ? '0' : '1'}">${s.isOpen ? 'Deactivate' : 'Activate'}</button>` : ''}<a class="ad-btn ghost" href="#/shops">Back</a></div></div>
      <div class="ad-detail">
        <div class="ad-card">
          <h2>Menu</h2>
          ${items.length ? `<table class="ad-table"><thead><tr><th>Item</th><th>Price</th><th></th></tr></thead><tbody>${items.map((it) => `<tr>
            <td>${esc(it.name)}</td><td>${money(it.price)}</td>
            <td>${allowed('shops') ? `<button class="ad-btn sm ghost" data-item="${esc(it.id)}" data-av="${it.is_available===false?1:0}">${it.is_available===false?'Make available':'Unavailable'}</button>` : ''}</td>
          </tr>`).join('')}</tbody></table>` : '<div class="ad-empty">No items.</div>'}
        </div>
        <div class="ad-card">
          <h2>Owner</h2>
          <p>${esc((state.data.owner && state.data.owner.name) || '—')}</p>
          <p class="ad-delta">${esc(s.hours || '')}</p>
          ${s.lat != null ? `<p class="ad-delta">Pin ${esc(s.lat)}, ${esc(s.lng)}</p>` : '<p class="ad-delta">No map pin stored.</p>'}
        </div>
      </div>
      <div class="ad-card" style="margin-top:14px"><h2>Orders</h2>${tableOrders(state.data.orders || [])}</div>`;
  }

  function ridersView() {
    const d = state.data || {};
    const rows = d.rows || [];
    const c = d.counts || {};
    const extra = allowed('users') ? `<button class="ad-btn" data-open="rider">+ Add Rider</button>` : '';
    return listChrome('Riders Management', 'Manage delivery riders and their activities', extra, `
      <div class="ad-tabs">${tabBtn('status','all','All ('+(c.all||rows.length)+')')}${tabBtn('status','online','Online ('+(c.online||0)+')')}${tabBtn('status','offline','Offline ('+(c.offline||0)+')')}</div>
      <div class="ad-filters"><input id="adQ" value="${esc(state.filters.q)}" placeholder="Search by name or phone…" /></div>
      ${rows.length ? `<div class="ad-card" style="padding:0 8px"><table class="ad-table">
        <thead><tr><th>Name</th><th>Vehicle</th><th>Status</th><th>Rating</th><th>KYC</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td><div class="ad-person"><div class="ad-ava">${r.rider && r.rider.avatar ? `<img src="${esc(r.rider.avatar)}" alt="">` : esc(initials(r.name))}</div><div><b>${esc(r.name)}</b><small>${esc(r.phoneMasked)}</small></div></div></td>
          <td>${esc(r.vehicleType || r.vehicle || '—')}</td>
          <td>${badge(r.online ? 'Online' : 'Offline')}</td>
          <td>${r.rating != null ? Number(r.rating).toFixed(1) : '—'}</td>
          <td>${badge(r.verified ? 'Approved' : 'Pending')}</td>
          <td><a class="ad-btn ghost sm" href="#/riders/${esc(r.id)}">View</a></td>
        </tr>`).join('')}</tbody></table>${pager(d)}</div>` : '<div class="ad-empty">No riders yet.</div>'}`);
  }

  function riderDetailView() {
    const r = state.data.rider;
    if (!r) return '<div class="ad-empty">Rider not found.</div>';
    const d = r.rider || {};
    return `<div class="ad-head"><div><h1>${esc(r.name)}</h1><p>${esc(r.phoneMasked)}</p></div><a class="ad-btn ghost" href="#/riders">Back</a></div>
      <div class="ad-detail">
        <div class="ad-card">
          <h2>Verification (Didit)</h2>
          <p>NIC / licence photos are not stored. Flags only.</p>
          <dl class="ad-kv">
            <dt>NIC</dt><dd>${badge(d.nicKyc || 'pending')}</dd>
            <dt>Licence</dt><dd>${badge(d.licenseKyc || 'pending')}</dd>
            <dt>Liveness</dt><dd>${badge(d.livenessKyc || 'pending')}</dd>
            <dt>Plate</dt><dd>${esc(d.plate || '—')}</dd>
            <dt>Registered</dt><dd>${d.registered ? 'Yes' : 'No'}</dd>
          </dl>
        </div>
        <div class="ad-card">
          <h2>Account</h2>
          ${badge(r.status)}
          <p class="ad-delta">Online is inferred from a live job with coordinates — never invented.</p>
        </div>
      </div>
      <div class="ad-card" style="margin-top:14px"><h2>Deliveries</h2>${tableOrders(state.data.orders || [])}</div>`;
  }

  function ordersView() {
    const d = state.data || {};
    const c = d.counts || {};
    return listChrome('Orders Management', 'Track and manage all orders', '', `
      <div class="ad-tabs">
        ${tabBtn('status','all','All ('+(c.all||0)+')')}
        ${tabBtn('status','pending','Pending ('+(c.pending||0)+')')}
        ${tabBtn('status','preparing','Preparing ('+(c.preparing||0)+')')}
        ${tabBtn('status','on_the_way','On the Way ('+(c.on_the_way||0)+')')}
        ${tabBtn('status','delivered','Delivered ('+(c.delivered||0)+')')}
      </div>
      <div class="ad-filters">
        <input id="adQ" value="${esc(state.filters.q)}" placeholder="Search by order ID, customer or shop…" />
        <select id="adPay"><option value="all">Payment: All</option><option value="card" ${state.filters.pay==='card'?'selected':''}>Card</option><option value="cod" ${state.filters.pay==='cod'?'selected':''}>COD</option></select>
      </div>
      <div class="ad-card" style="padding:0 8px">${tableOrders(d.rows || [])}${pager(d)}</div>`);
  }

  function orderDetailView() {
    const o = state.data.order;
    if (!o) return '<div class="ad-empty">Order not found.</div>';
    return `<div class="ad-head"><div><h1>${esc(o.id)}</h1><p>${esc(labelStatus(o.status))} · ${esc(o.shopName)}</p></div>
      <a class="ad-btn ghost" href="#/orders">Back</a></div>
      <div class="ad-detail">
        <div class="ad-card">
          <h2>Items</h2>
          <table class="ad-table"><tbody>${(o.items||[]).map((it)=>`<tr><td>${esc(it.name)}</td><td>×${esc(it.qty)}</td><td>${money(it.price)}</td></tr>`).join('')||'<tr><td>No lines</td></tr>'}</tbody></table>
          <p>Food ${money(o.subtotal)} · Fee ${money(o.deliveryFee)} · Total ${money(o.totalAmount)}</p>
          <p>Payment ${esc(o.paymentMethod)} ${badge(o.paymentStatus || (o.paid ? 'paid' : 'unpaid'))}</p>
          ${o.refundNote ? `<div class="ad-warn">${esc(o.refundNote)}</div>` : ''}
        </div>
        <div class="ad-card">
          <h2>Delivery</h2>
          <p>${esc(o.address)}</p>
          <p>Customer ${esc(o.customerName)} · ${esc(o.customerPhoneMasked)}</p>
          <p>Rider ${esc(o.riderName || 'Unassigned')}</p>
          ${state.data.canCancel && allowed('orders') ? `
            <label class="ad-lab">Cancel reason</label>
            <textarea class="ad-area" id="cancelReason"></textarea>
            <button class="ad-btn danger sm" id="cancelOrder">Cancel order</button>
            <p class="ad-delta">Delivered orders cannot be cancelled. Card refunds are recorded on the order only — Payments.lk is not auto-refunded.</p>
          ` : ''}
        </div>
      </div>`;
  }

  function withdrawalsView() {
    const d = state.data || {};
    const c = d.counts || {};
    return listChrome('Withdrawals', 'Manage shop and rider withdrawal requests', '', `
      ${d.warning ? `<div class="ad-warn">${esc(d.warning)}</div>` : ''}
      <div class="ad-tabs">
        ${tabBtn('status','all','All ('+(c.all||0)+')')}
        ${tabBtn('status','pending','Pending ('+(c.pending||0)+')')}
        ${tabBtn('status','approved','Approved ('+(c.approved||0)+')')}
        ${tabBtn('status','rejected','Rejected ('+(c.rejected||0)+')')}
      </div>
      <div class="ad-filters">
        <input id="adQ" value="${esc(state.filters.q)}" placeholder="Search by name or role…" />
        <select id="adRole"><option value="all">Role: All</option><option value="shop" ${state.filters.role==='shop'?'selected':''}>Shop</option><option value="rider" ${state.filters.role==='rider'?'selected':''}>Rider</option></select>
      </div>
      ${(d.rows||[]).length ? `<div class="ad-card" style="padding:0 8px"><table class="ad-table">
        <thead><tr><th>Name</th><th>Role</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th><th></th></tr></thead>
        <tbody>${d.rows.map((w)=>`<tr>
          <td><div class="ad-person"><div class="ad-ava">${esc(initials(w.name))}</div><b>${esc(w.name)}</b></div></td>
          <td>${esc(w.role)}</td><td>${money(w.amount)}</td><td>${esc(w.method)}</td>
          <td>${badge(w.status)}</td><td>${esc(when(w.ts))}</td>
          <td><button class="ad-btn ghost sm" data-wd="${esc(w.walletId)}" data-req="${esc(w.requestId)}">Details</button></td>
        </tr>`).join('')}</tbody></table>${pager(d)}</div>` : '<div class="ad-empty">No withdrawal requests.</div>'}`);
  }

  function supportView() {
    const d = state.data || {};
    const c = d.counts || {};
    const st = state.filters.status;
    const empty = st === 'resolved' ? 'No closed sessions yet.'
      : st === 'new' ? 'No new agent chats.'
      : st === 'waiting' ? 'No customers waiting in queue.'
      : st === 'in_progress' ? 'No in-progress agent chats.'
      : 'No customers in New, Waiting, In Progress, or Closed yet. They appear here live.';
    return listChrome('Questions & Support', 'Open chats sit under New until the agent sends a first message, then they move to In Progress.',
      '<span class="ad-live"><i></i>Live</span>', `
      <div class="ad-tabs">
        ${tabBtn('status','all','All ('+(c.all||0)+')')}
        ${tabBtn('status','new','New ('+(c.new||0)+')')}
        ${tabBtn('status','waiting','Waiting ('+(c.waiting||0)+')')}
        ${tabBtn('status','in_progress','In Progress ('+(c.in_progress||0)+')')}
        ${tabBtn('status','resolved','Closed ('+(c.resolved||0)+')')}
      </div>
      <div class="ad-filters"><input id="adQ" value="${esc(state.filters.q)}" placeholder="Search by name or subject…" /></div>
      ${(d.rows||[]).length ? `<div class="ad-card" style="padding:0 8px"><table class="ad-table">
        <thead><tr><th>User</th><th>Type</th><th>Subject</th><th>Status</th><th>Date</th><th>Rating</th></tr></thead>
        <tbody>${d.rows.map((t)=>`<tr data-href="#/support/${esc(t.id)}">
          <td><div class="ad-person"><div class="ad-ava">${esc(initials(t.userName))}</div><b>${esc(t.userName)}</b></div></td>
          <td>${esc(t.role)}</td>
          <td>${esc(t.subject)}</td>
          <td>${badge(t.status)}</td>
          <td>${esc(when((t.messages[t.messages.length-1]&&t.messages[t.messages.length-1].ts)||t.escalatedAt||t.agentClosedAt))}</td>
          <td>${rateMarks(t.rating)}</td>
        </tr>`).join('')}</tbody></table>${pager(d)}</div>` : `<div class="ad-empty">${empty}</div>`}`);
  }

  function supportWaitLabel(t) {
    if (!t || t.mode !== 'agent' || t.status === 'closed' || t.status === 'resolved') return '';
    const msgs = (t.messages || []).filter((m) => m && !m.internal);
    const hasAgent = msgs.some((m) => m.role === 'agent');
    const last = msgs[msgs.length - 1];
    if (!hasAgent) return 'Waiting';
    if (last && last.role === 'agent') return 'Waiting';
    return '';
  }

  function supportChatView() {
    const t = state.data.ticket;
    if (!t) return '<div class="ad-empty">Ticket not found.</div>';
    const live = t.mode === 'agent' && t.status !== 'closed' && t.status !== 'resolved';
    const msgs = (t.messages || []).filter((m) => !m.internal);
    const wait = supportWaitLabel(t);
    return `<div class="ad-head"><div><h1>Support Chat</h1><p>${esc(t.userName)} · ${esc(t.ticket || t.id)} · ${badge(t.status || (live ? 'agent' : 'closed'))}${wait ? ' · ' + badge(wait) : ''}${t.rating ? ' · ★ ' + esc(t.rating) : ''}${t.awaitingRating ? ' · waiting for rating' : ''} · <span class="ad-live"><i></i>Live</span></p></div>
      <div>${live ? '<button class="ad-btn ghost" type="button" id="adCloseAgent">Close agent</button>' : ''}<a class="ad-btn ghost" href="#/support">Back</a></div></div>
      <div class="ad-card ad-chat">
        <div class="ad-bubbles" id="adBubbles">${msgs.map((m)=>`<div class="ad-bubble ${m.role==='user'?'them':(m.role==='system'?'sys':'me')}">${esc(m.text)}</div>`).join('') || '<div class="ad-empty">No messages.</div>'}</div>
        ${live ? `<form id="adReply" class="ad-filters" style="margin:0">
          <input name="text" class="ad-input" placeholder="Type a message…" required />
          <button class="ad-btn" type="submit">Send</button>
          <button class="ad-btn ghost" type="submit" name="internal" value="1">Internal note</button>
        </form>
        <div class="ad-filters">
          <select id="tStatus">
            ${['open','in_progress','waiting','closed'].map((s)=>`<option ${t.status===s?'selected':''} value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <p class="ad-delta">Close agent marks this session closed, returns the user to AI Help, and asks them to rate. Idle 3 minutes with no user reply does the same. Internal notes are not sent to the customer. New customer messages appear here live.</p>` : `<p class="ad-delta">Session closed. This user is back in AI Help and stays on the Closed tab.</p>`}
      </div>`;
  }

  function analyticsView(isReport) {
    const m = (state.data && state.data.metrics) || { totals: {}, categories: {}, topShops: [], byDay: {} };
    const t = m.totals || {};
    return listChrome(isReport ? 'Reports' : 'Analytics & Reports', 'Live totals from orders in this range — not sample figures.',
      `<div>${isReport ? `<button class="ad-btn ghost" id="adCsv">Export CSV</button>` : ''}<select class="ad-input" id="adDays" style="width:auto">
        <option value="7" ${state.days===7?'selected':''}>Last 7 days</option>
        <option value="30" ${state.days===30?'selected':''}>Last 30 days</option>
      </select></div>`, `
      <div class="ad-grid ad-kpis">
        <div class="ad-card"><label>Total Orders</label><b>${esc(t.orders||0)}</b></div>
        <div class="ad-card"><label>GMV</label><b>${money(t.gmv)}</b></div>
        <div class="ad-card"><label>Commission (config)</label><b>${money(t.commission)}</b></div>
        <div class="ad-card"><label>Refunds recorded</label><b>${money(t.refunds)}</b></div>
        <div class="ad-card"><label>Active shops in catalog</label><b>${esc(t.shops||0)}</b></div>
      </div>
      <div class="ad-warn">${esc(m.commissionNote || '')}</div>
      <div class="ad-warn">${esc(m.payoutNote || '')}</div>
      <div class="ad-grid ad-split" style="margin-top:14px">
        <div class="ad-card"><h2>Revenue Trend</h2><canvas id="chartRev" class="ad-chart" width="640" height="220"></canvas></div>
        <div class="ad-card"><h2>Orders by Category (shops)</h2><canvas id="chartCat" class="ad-chart" width="420" height="220"></canvas></div>
      </div>
      <div class="ad-card" style="margin-top:14px"><h2>Top Shops</h2>
        ${(m.topShops||[]).length ? `<table class="ad-table"><tbody>${m.topShops.map((s)=>`<tr><td>${esc(s.name)}</td><td>${esc(s.orders)} orders</td></tr>`).join('')}</tbody></table>` : '<div class="ad-empty">No orders in range.</div>'}
      </div>`);
  }

  function notificationsView() {
    const rows = (state.data && state.data.rows) || [];
    const integ = state.data && state.data.integrations;
    return listChrome('Notifications', 'In-panel alerts from live events.', '', `
      ${integ && !integ.push ? `<div class="ad-warn">${esc(integ.note)}</div>` : ''}
      ${rows.length ? `<div class="ad-card" style="padding:0 8px"><table class="ad-table"><tbody>${rows.map((n)=>`<tr>
        <td>${n.read ? '' : '● '} <a href="${esc(n.href)}">${esc(n.title)}</a><div class="ad-delta">${esc(n.body)}</div></td>
        <td>${esc(when(n.ts))}</td>
        <td>${n.read ? '' : `<button class="ad-btn ghost sm" data-read="${esc(n.id)}">Mark read</button>`}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="ad-empty">No alerts.</div>'}`);
  }

  function settingsView() {
    const c = (state.data && state.data.config) || {};
    const people = (state.data && state.data.people) || [];
    const boot = state.data && state.data.bootstrap;
    const tab = state.filters.tab || 'general';
    return listChrome('Settings', 'System design & configuration', '', `
      <div class="ad-tabs">
        ${['general','payment','notifications','security'].map((t)=>`<button type="button" class="${tab===t?'on':''}" data-filter="tab" data-val="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}
      </div>
      ${tab==='general' ? `<div class="ad-card"><form id="cfgForm">
        <label class="ad-lab">Brand name</label>
        <input class="ad-input" name="brandName" value="${esc((c.brand&&c.brand.name)||'QuickBite')}" />
        <label class="ad-lab"><input type="checkbox" name="maintenance" ${c.maintenance?'checked':''}/> Maintenance flag (stored; apps are not auto-gated)</label>
        <label class="ad-lab">Featured shop IDs (comma)</label>
        <input class="ad-input" name="featured" value="${esc((c.featuredShopIds||[]).join(','))}" />
        <label class="ad-lab">Default delivery fee (LKR) — does not reprice existing orders</label>
        <input class="ad-input" name="fee" type="number" min="0" value="${esc(c.deliveryFeeDefault||200)}" />
        <div style="height:12px"></div>
        <button class="ad-btn" type="submit">Save</button>
      </form></div>` : ''}
      ${tab==='payment' ? `<div class="ad-card">
        <div class="ad-warn">Commission is an estimate for reports. It is not deducted from shop or rider wallets. Approve on Withdrawals does not pay a bank.</div>
        <form id="cfgForm">
          <label class="ad-lab">Platform commission %</label>
          <input class="ad-input" name="commissionPct" type="number" min="0" max="40" step="0.1" value="${esc(c.commissionPct||0)}" />
          <h2 style="margin-top:16px">Coupons (stored; checkout does not auto-apply yet)</h2>
          <textarea class="ad-area" name="coupons" placeholder='[{"code":"SAVE10","pct":10,"active":true}]'>${esc(JSON.stringify(c.coupons||[], null, 2))}</textarea>
          <div style="height:12px"></div>
          <button class="ad-btn" type="submit">Save</button>
        </form>
      </div>` : ''}
      ${tab==='notifications' ? `<div class="ad-card">
        <div class="ad-warn">No email, SMS, or push provider is wired for admin fan-out. Templates are stored only.</div>
        <form id="cfgForm">
          <label class="ad-lab">Verify template</label>
          <textarea class="ad-area" name="tplVerify">${esc((c.templates&&c.templates.verify)||'')}</textarea>
          <label class="ad-lab">Withdraw template</label>
          <textarea class="ad-area" name="tplWd">${esc((c.templates&&c.templates.withdraw)||'')}</textarea>
          <button class="ad-btn" type="submit">Save</button>
        </form>
      </div>` : ''}
      ${tab==='security' && allowed('staff') ? `<div class="ad-card">
        <p>Bootstrap super admin: ${boot ? esc(boot.email) : 'not set (ADMIN_EMAIL env)'} — password stays in Cloudflare, never here.</p>
        <table class="ad-table"><thead><tr><th>Email</th><th>Role</th><th>Active</th></tr></thead>
        <tbody>${people.map((p)=>`<tr><td>${esc(p.email)}</td><td>${esc(p.role)}</td><td>${p.active!==false?'yes':'no'}</td></tr>`).join('') || '<tr><td colspan="3">No extra staff</td></tr>'}</tbody></table>
        <form id="staffForm">
          <label class="ad-lab">Add / update staff email</label>
          <input class="ad-input" name="email" type="email" required />
          <label class="ad-lab">Name</label>
          <input class="ad-input" name="name" />
          <label class="ad-lab">Role</label>
          <select class="ad-input" name="role"><option>operations</option><option>support</option><option>finance</option><option>super</option></select>
          <label class="ad-lab">Password (min 8)</label>
          <input class="ad-input" name="password" type="password" minlength="8" />
          <div style="height:12px"></div>
          <button class="ad-btn" type="submit">Save staff</button>
        </form>
      </div>` : tab==='security' ? '<div class="ad-card">Only super admin manages staff.</div>' : ''}
    `);
  }

  function unauthorizedView() {
    return `<div class="ad-card"><h1>Not allowed</h1><p>Your role cannot open this screen.</p><a class="ad-btn" href="#/dashboard">Dashboard</a></div>`;
  }
  function notFoundView() {
    return `<div class="ad-card"><h1>Not found</h1><p>That admin page does not exist.</p><a class="ad-btn" href="#/dashboard">Dashboard</a></div>`;
  }

  function modalHtml() {
    const m = state.modalKind;
    if (m === 'user' || m === 'rider') {
      const role = m === 'rider' ? 'rider' : 'customer';
      return `<div class="ad-modal-bg" data-close-modal><div class="ad-modal" role="dialog">
        <h3>Add ${m === 'rider' ? 'Rider' : 'User'}</h3>
        <form id="addPerson">
          <input type="hidden" name="role" value="${role}" />
          <label class="ad-lab">Name</label><input class="ad-input" name="name" required />
          <label class="ad-lab">WhatsApp</label><input class="ad-input" name="phone" required />
          <label class="ad-lab">Email</label><input class="ad-input" name="email" type="email" />
          <p class="ad-delta">They must still verify WhatsApp in the app. PIN 1234 is not a skip.</p>
          <div class="ad-modal-actions"><button class="ad-btn ghost" type="button" data-close-modal>Cancel</button><button class="ad-btn" type="submit">Create</button></div>
        </form>
      </div></div>`;
    }
    if (m === 'shop') {
      return `<div class="ad-modal-bg" data-close-modal><div class="ad-modal" role="dialog">
        <h3>Add New Shop</h3>
        <form id="addShop">
          <label class="ad-lab">Shop name</label><input class="ad-input" name="name" required />
          <label class="ad-lab">Category</label>
          <select class="ad-input" name="category"><option>Grocery</option><option>Bakery</option><option>Fast food</option><option>Fruit</option><option>Vegetables</option><option>Beverages</option><option>Chilled</option><option>Meat</option><option>Frozen</option><option>Household</option></select>
          <label class="ad-lab">Owner name</label><input class="ad-input" name="ownerName" />
          <label class="ad-lab">Phone</label><input class="ad-input" name="phone" required />
          <label class="ad-lab">Address</label><input class="ad-input" name="address" />
          <div class="ad-modal-actions"><button class="ad-btn ghost" type="button" data-close-modal>Cancel</button><button class="ad-btn" type="submit">Create Shop</button></div>
        </form>
      </div></div>`;
    }
    if (m === 'wd' && state.modalData) {
      const w = state.modalData;
      return `<div class="ad-modal-bg" data-close-modal><div class="ad-modal" role="dialog">
        <h3>Withdraw Details</h3>
        <dl class="ad-kv">
          <dt>Name</dt><dd>${esc(w.name)} · ${esc(w.role)}</dd>
          <dt>Amount</dt><dd>${money(w.amount)}</dd>
          <dt>Method</dt><dd>${esc(w.method)}</dd>
          <dt>Account</dt><dd>${esc(w.bank && w.bank.accountNoMasked)} · ${esc(w.bank && w.bank.bankName)}</dd>
          <dt>Branch</dt><dd>${esc(w.bank && w.bank.branch)}</dd>
          <dt>Status</dt><dd>${badge(w.status)}</dd>
        </dl>
        <div class="ad-warn">Approve marks the in-app wallet transferred. It does not send money to a bank.</div>
        ${w.rawStatus === 'pending' ? `<form id="wdDecide">
          <input type="hidden" name="walletId" value="${esc(w.walletId)}" />
          <input type="hidden" name="requestId" value="${esc(w.requestId)}" />
          <label class="ad-lab">Payment reference (if you already paid outside)</label>
          <input class="ad-input" name="paymentRef" />
          <label class="ad-lab">Reason</label>
          <textarea class="ad-area" name="reason" required></textarea>
          <div class="ad-modal-actions">
            <button class="ad-btn danger" name="decision" value="reject">Reject</button>
            <button class="ad-btn" name="decision" value="approve">Approve</button>
          </div>
        </form>` : `<p class="ad-delta">${esc(w.note || '')}</p>`}
      </div></div>`;
    }
    return '';
  }

  function drawLine(canvas, series, labels) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const pad = 28;
    const keys = Object.keys(series[0] && labels ? labels : {});
    const labs = labels || [];
    const max = Math.max(1, ...series.flatMap((s) => s.data));
    ctx.strokeStyle = 'rgba(148,163,184,.15)';
    ctx.beginPath(); ctx.moveTo(pad, h - pad); ctx.lineTo(w - 8, h - pad); ctx.stroke();
    series.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      s.data.forEach((v, i) => {
        const x = pad + (labs.length < 2 ? 0 : i * (w - pad - 8) / (labs.length - 1));
        const y = h - pad - (v / max) * (h - pad - 16);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    ctx.fillStyle = '#8b9bb4'; ctx.font = '11px Plus Jakarta Sans, sans-serif';
    labs.forEach((lab, i) => {
      if (i % Math.ceil(labs.length / 7) !== 0) return;
      const x = pad + (labs.length < 2 ? 0 : i * (w - pad - 8) / (labs.length - 1));
      ctx.fillText(String(lab).slice(5), x, h - 8);
    });
  }

  function drawDonut(canvas, slices) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const total = slices.reduce((n, s) => n + s.value, 0) || 1;
    let a = -Math.PI / 2;
    const cx = w * 0.35, cy = h / 2, r = Math.min(cx, cy) - 16;
    slices.forEach((s) => {
      const da = (s.value / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a, a + da); ctx.closePath();
      ctx.fillStyle = s.color; ctx.fill();
      a += da;
    });
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#8b9bb4'; ctx.font = '12px Plus Jakarta Sans, sans-serif';
    slices.forEach((s, i) => { ctx.fillStyle = s.color; ctx.fillText(s.label + ' · ' + s.value, w * 0.62, 28 + i * 18); });
  }

  function paintCharts() {
    const by = (state.data.metrics && state.data.metrics.byDay) || {};
    const labels = Object.keys(by).sort();
    const c1 = document.getElementById('chartOrders');
    if (c1) {
      drawLine(c1, [
        { color: '#22c55e', data: labels.map((k) => by[k].completed || 0) },
        { color: '#f59e0b', data: labels.map((k) => by[k].pending || 0) },
        { color: '#a78bfa', data: labels.map((k) => by[k].cancelled || 0) },
      ], labels);
    }
    const c2 = document.getElementById('chartRev');
    if (c2) {
      drawLine(c2, [{ color: '#22c55e', data: labels.map((k) => by[k].gmv || 0) }], labels);
    }
    const c3 = document.getElementById('chartCat');
    if (c3) {
      const cat = (state.data.metrics && state.data.metrics.categories) || {};
      const colors = ['#22c55e', '#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e', '#94a3b8'];
      const slices = Object.keys(cat).map((k, i) => ({ label: k, value: cat[k], color: colors[i % colors.length] }));
      drawDonut(c3, slices.length ? slices : [{ label: 'None', value: 1, color: '#334155' }]);
    }
  }

  function paintMap() {
    const el = document.getElementById('adMap');
    if (!el || typeof L === 'undefined') return;
    if (el._adMap) { try { el._adMap.remove(); } catch (_) {} el._adMap = null; }
    const pts = state.data.live || [];
    const map = L.map(el, { zoomControl: false, attributionControl: false });
    el._adMap = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    const layer = [];
    pts.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const color = p.kind === 'shop' ? '#f43f5e' : p.kind === 'rider' ? '#22c55e' : '#38bdf8';
      const m = L.circleMarker([Number(p.lat), Number(p.lng)], { radius: 7, color: color, fillColor: color, fillOpacity: 0.9 }).addTo(map);
      m.bindTooltip(p.kind + ': ' + p.name);
      layer.push(m);
    });
    if (layer.length) {
      const g = L.featureGroup(layer);
      map.fitBounds(g.getBounds().pad(0.3));
    } else {
      map.setView([7.8731, 80.7718], 7);
      el.insertAdjacentHTML('beforeend', '');
    }
  }

  function view() {
    if (!state.actor) return loginView();
    if (state.loading && !state.data) return shell('<div class="ad-load">Loading…</div>');
    if (state.route === 'unauthorized') return shell(unauthorizedView());
    let inner = '';
    switch (state.route) {
      case 'dashboard': inner = dashboardView(); break;
      case 'users': inner = state.id ? userDetailView() : usersView(); break;
      case 'shops': inner = state.id ? shopDetailView() : shopsView(); break;
      case 'riders': inner = state.id ? riderDetailView() : ridersView(); break;
      case 'orders': inner = state.id ? orderDetailView() : ordersView(); break;
      case 'withdrawals': inner = withdrawalsView(); break;
      case 'support': inner = state.id ? supportChatView() : supportView(); break;
      case 'notifications': inner = notificationsView(); break;
      case 'reports': inner = analyticsView(true); break;
      case 'analytics': inner = analyticsView(false); break;
      case 'settings': inner = settingsView(); break;
      default: inner = notFoundView();
    }
    if (state.loading) inner = '<div class="ad-load">Loading…</div>' + inner;
    if (state.error && state.actor) inner = `<div class="ad-error">${esc(state.error)}</div>` + inner;
    state.modal = modalHtml();
    return shell(inner);
  }

  function bind() {
    const login = document.getElementById('adLogin');
    if (login) {
      login.onsubmit = async (e) => {
        e.preventDefault();
        state.error = '';
        try {
          const fd = new FormData(login);
          const out = await api('session.login', { email: String(fd.get('email') || '').trim(), password: String(fd.get('password') || '').trim() });
          if (out.token) tokenSet(out.token);
          state.actor = out.actor;
          state.error = '';
          go('dashboard');
          await load();
        } catch (err) { state.error = err.message; render(); }
      };
      return;
    }
    const lo = document.getElementById('adLogout');
    if (lo) lo.onclick = async () => { stopSupportPoll(); try { await api('session.logout'); } catch (_) {} tokenSet(''); state.actor = null; render(); };
    $$('[data-nav]').forEach((b) => b.onclick = () => document.getElementById('adApp').classList.toggle('nav-open'));
    $$('[data-go]').forEach((b) => b.onclick = () => {
      if (b.getAttribute('data-open')) state.modalKind = b.getAttribute('data-open');
      go(b.getAttribute('data-go'));
    });
    $$('[data-open]').forEach((b) => b.onclick = () => { state.modalKind = b.getAttribute('data-open'); render(); });
    $$('[data-close-modal]').forEach((b) => b.onclick = (e) => { if (e.target === b) { state.modalKind = null; render(); } });
    $$('[data-filter]').forEach((b) => b.onclick = () => {
      state.filters[b.getAttribute('data-filter')] = b.getAttribute('data-val');
      state.page = 1;
      load();
    });
    $$('[data-page]').forEach((b) => b.onclick = () => { state.page = Number(b.getAttribute('data-page')); load(); });
    const q = document.getElementById('adQ');
    if (q) q.onchange = () => { state.filters.q = q.value; state.page = 1; load(); };
    const st = document.getElementById('adStatus');
    if (st) st.onchange = () => { state.filters.status = st.value; load(); };
    const pay = document.getElementById('adPay');
    if (pay) pay.onchange = () => { state.filters.pay = pay.value; load(); };
    const role = document.getElementById('adRole');
    if (role) role.onchange = () => { state.filters.role = role.value; load(); };
    const days = document.getElementById('adDays');
    if (days) days.onchange = () => { state.days = Number(days.value) || 7; load(); };
    $$('[data-status]').forEach((b) => b.onclick = async () => {
      const reason = (document.getElementById('stReason') || {}).value || '';
      try {
        await api('accounts.patch', { id: state.id, status: b.getAttribute('data-status'), reason: reason });
        toast('Account updated');
        load();
      } catch (e) { toast(e.message); }
    });
    $$('[data-shop-open]').forEach((b) => b.onclick = async () => {
      try {
        await api('shops.patch', { id: state.id, is_open: b.getAttribute('data-shop-open') === '1' });
        toast('Shop updated'); load();
      } catch (e) { toast(e.message); }
    });
    $$('[data-item]').forEach((b) => b.onclick = async () => {
      try {
        await api('shops.menuPatch', { itemId: b.getAttribute('data-item'), is_available: b.getAttribute('data-av') === '1' });
        load();
      } catch (e) { toast(e.message); }
    });
    const cancel = document.getElementById('cancelOrder');
    if (cancel) cancel.onclick = async () => {
      try {
        await api('orders.cancel', { id: state.id, reason: (document.getElementById('cancelReason') || {}).value });
        toast('Order cancelled'); load();
      } catch (e) { toast(e.message); }
    };
    $$('[data-wd]').forEach((b) => b.onclick = () => {
      const id = b.getAttribute('data-req');
      const w = (state.data.rows || []).find((x) => x.requestId === id);
      state.modalKind = 'wd';
      state.modalData = w;
      render();
    });
    const wd = document.getElementById('wdDecide');
    if (wd) {
      wd.onsubmit = async (e) => {
        e.preventDefault();
      };
      $$('button[name="decision"]', wd).forEach((btn) => btn.onclick = async (e) => {
        e.preventDefault();
        const fd = new FormData(wd);
        try {
          const out = await api('withdrawals.decide', {
            walletId: fd.get('walletId'),
            requestId: fd.get('requestId'),
            decision: btn.value,
            reason: fd.get('reason'),
            paymentRef: fd.get('paymentRef'),
            idempotencyKey: 'wd-' + fd.get('requestId') + '-' + btn.value,
          });
          toast(out.note || 'Updated');
          state.modalKind = null;
          load();
        } catch (err) { toast(err.message); }
      });
    }
    const addP = document.getElementById('addPerson');
    if (addP) addP.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(addP);
      try {
        const out = await api('accounts.create', { role: fd.get('role'), name: fd.get('name'), phone: fd.get('phone'), email: fd.get('email') });
        toast(out.note || 'Created');
        state.modalKind = null;
        load();
      } catch (err) { toast(err.message); }
    };
    const addS = document.getElementById('addShop');
    if (addS) addS.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(addS);
      try {
        const out = await api('shops.create', Object.fromEntries(fd.entries()));
        toast(out.note || 'Shop created');
        state.modalKind = null;
        load();
      } catch (err) { toast(err.message); }
    };
    const reply = document.getElementById('adReply');
    if (reply) reply.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(reply);
      const internal = !!(e.submitter && e.submitter.name === 'internal');
      try {
        await api('support.reply', { id: state.id, text: fd.get('text'), internal: internal });
        load();
      } catch (err) { toast(err.message); }
    };
    const tStatus = document.getElementById('tStatus');
    if (tStatus) tStatus.onchange = async () => {
      try { await api('support.patch', { id: state.id, status: tStatus.value }); load(); } catch (e) { toast(e.message); }
    };
    const closeAg = document.getElementById('adCloseAgent');
    if (closeAg) closeAg.onclick = async () => {
      try {
        await api('support.close', { id: state.id });
        toast('Session closed. User is back on AI Help and left the live list.');
        load();
      } catch (e) { toast(e.message); }
    };
    $$('[data-read]').forEach((b) => b.onclick = async () => {
      try { await api('notifications.read', { id: b.getAttribute('data-read') }); load(); } catch (e) { toast(e.message); }
    });
    const csv = document.getElementById('adCsv');
    if (csv) csv.onclick = async () => {
      try {
        const out = await api('export.csv', { days: state.days });
        const blob = new Blob([out.csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = out.filename || 'orders.csv';
        a.click();
      } catch (e) { toast(e.message); }
    };
    const cfg = document.getElementById('cfgForm');
    if (cfg) cfg.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(cfg);
      const cur = state.data.config || {};
      let coupons = cur.coupons;
      if (fd.get('coupons')) {
        try { coupons = JSON.parse(fd.get('coupons')); } catch (_) { toast('Coupons JSON is invalid'); return; }
      }
      try {
        const out = await api('config.set', {
          config: {
            commissionPct: fd.get('commissionPct') != null ? fd.get('commissionPct') : cur.commissionPct,
            deliveryFeeDefault: fd.get('fee') != null ? fd.get('fee') : cur.deliveryFeeDefault,
            maintenance: fd.get('maintenance') === 'on' || fd.has('maintenance'),
            featuredShopIds: String(fd.get('featured') || '').split(',').map((s) => s.trim()).filter(Boolean),
            coupons: coupons,
            brand: { name: fd.get('brandName') || 'QuickBite' },
            templates: {
              verify: fd.get('tplVerify') || (cur.templates && cur.templates.verify),
              withdraw: fd.get('tplWd') || (cur.templates && cur.templates.withdraw),
            },
          },
        });
        toast(out.note || 'Saved');
        load();
      } catch (err) { toast(err.message); }
    };
    const staff = document.getElementById('staffForm');
    if (staff) staff.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(staff);
      try {
        await api('staff.upsert', { email: fd.get('email'), name: fd.get('name'), role: fd.get('role'), password: fd.get('password') });
        toast('Staff saved'); load();
      } catch (err) { toast(err.message); }
    };
    const search = document.getElementById('adSearch');
    const hits = document.getElementById('adHits');
    if (search && hits) {
      let t;
      search.oninput = () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const qv = search.value.trim();
          if (qv.length < 2) { hits.classList.remove('on'); return; }
          try {
            const out = await api('search', { q: qv });
            hits.innerHTML = (out.hits || []).map((h) => `<a href="${esc(h.href)}">${esc(h.title)} <small>${esc(h.sub)}</small></a>`).join('') || '<div class="ad-empty">No matches</div>';
            hits.classList.add('on');
          } catch (_) {}
        }, 220);
      };
    }
    $$('[data-href]').forEach((tr) => tr.onclick = () => { location.hash = tr.getAttribute('data-href'); });
  }

  let supportPollTimer = 0;
  let supportPollBusy = false;
  const SUPPORT_POLL_MS = 3000;

  function supportPayloadSnap(data) {
    try { return JSON.stringify(data || {}); } catch (_) { return ''; }
  }
  function snapshotSupportUi() {
    const el = document.activeElement;
    const reply = document.querySelector('#adReply [name="text"]');
    const q = document.getElementById('adQ');
    const bubbles = document.getElementById('adBubbles');
    return {
      id: el && el.id,
      name: el && el.getAttribute && el.getAttribute('name'),
      start: el && el.selectionStart,
      end: el && el.selectionEnd,
      q: q ? q.value : '',
      draft: reply ? reply.value : '',
      y: window.scrollY,
      bubblesY: bubbles ? bubbles.scrollTop : 0,
      bubblesBottom: bubbles ? (bubbles.scrollHeight - bubbles.scrollTop - bubbles.clientHeight < 56) : false,
    };
  }
  function restoreSupportUi(snap) {
    if (!snap) return;
    const q = document.getElementById('adQ');
    if (q && snap.q != null) {
      q.value = snap.q;
      state.filters.q = snap.q;
    }
    const reply = document.querySelector('#adReply [name="text"]');
    if (reply && snap.draft != null) reply.value = snap.draft;
    const bubbles = document.getElementById('adBubbles');
    if (bubbles) bubbles.scrollTop = snap.bubblesBottom ? bubbles.scrollHeight : snap.bubblesY;
    window.scrollTo(0, snap.y);
    let el = snap.id ? document.getElementById(snap.id) : null;
    if (!el && snap.name === 'text') el = document.querySelector('#adReply [name="text"]');
    if (!el && snap.id === 'adQ') el = document.getElementById('adQ');
    if (el && typeof el.focus === 'function') {
      el.focus();
      try { if (typeof snap.start === 'number') el.setSelectionRange(snap.start, snap.end); } catch (_) {}
    }
  }
  function stopSupportPoll() {
    if (supportPollTimer) {
      clearInterval(supportPollTimer);
      supportPollTimer = 0;
    }
  }
  function startSupportPoll() {
    stopSupportPoll();
    if (!state.actor || state.route !== 'support') return;
    supportPollTimer = setInterval(function () { pollSupport(); }, SUPPORT_POLL_MS);
  }
  async function fetchSupportData() {
    const f = state.filters;
    if (state.id) return api('support.get', { id: state.id });
    return api('support.list', { q: f.q, status: f.status, role: f.role, page: state.page, size: 100 });
  }
  async function pollSupport() {
    if (supportPollBusy || state.loading || state.modalKind) return;
    if (!state.actor || state.route !== 'support') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    supportPollBusy = true;
    try {
      const next = await fetchSupportData();
      if (state.route !== 'support') return;
      if (supportPayloadSnap(next) === supportPayloadSnap(state.data)) return;
      const snap = snapshotSupportUi();
      state.data = next;
      render();
      restoreSupportUi(snap);
    } catch (_) {}
    finally {
      supportPollBusy = false;
    }
  }

  async function load() {
    if (!state.actor) { stopSupportPoll(); render(); return; }
    state.loading = true;
    state.error = '';
    render();
    try {
      const f = state.filters;
      if (state.route === 'dashboard') {
        state.data = await api('dashboard', { days: state.days });
        state.clock = state.data.clock && state.data.clock.label;
        state.perms = state.data.permissions || [];
      } else if (state.route === 'users' && state.id) {
        state.data = await api('accounts.get', { id: state.id });
      } else if (state.route === 'users') {
        state.data = await api('accounts.list', { q: f.q, role: f.role, status: f.status, page: state.page });
      } else if (state.route === 'shops' && state.id) {
        state.data = await api('shops.get', { id: state.id });
      } else if (state.route === 'shops') {
        state.data = await api('shops.list', { q: f.q, status: f.status, category: f.category, page: state.page });
      } else if (state.route === 'riders' && state.id) {
        state.data = await api('riders.get', { id: state.id });
      } else if (state.route === 'riders') {
        state.data = await api('riders.list', { q: f.q, status: f.status, page: state.page });
      } else if (state.route === 'orders' && state.id) {
        state.data = await api('orders.get', { id: state.id });
      } else if (state.route === 'orders') {
        state.data = await api('orders.list', { q: f.q, status: f.status, pay: f.pay, page: state.page });
      } else if (state.route === 'withdrawals') {
        state.data = await api('withdrawals.list', { q: f.q, status: f.status, role: f.role, page: state.page });
      } else if (state.route === 'support' && state.id) {
        state.data = await fetchSupportData();
      } else if (state.route === 'support') {
        state.data = await fetchSupportData();
      } else if (state.route === 'notifications') {
        state.data = await api('notifications.list');
      } else if (state.route === 'analytics' || state.route === 'reports') {
        state.data = await api('analytics', { days: state.days });
      } else if (state.route === 'settings') {
        const cfg = allowed('config') ? await api('config.get') : { config: {} };
        const staff = allowed('staff') ? await api('staff.list') : { people: [] };
        state.data = Object.assign({}, cfg, staff);
      } else {
        state.data = {};
      }
    } catch (e) {
      if (e.auth) {
        tokenSet('');
        state.actor = null;
        state.error = e.message || 'Sign in.';
      } else state.error = e.message;
    }
    state.loading = false;
    render();
    paintCharts();
    paintMap();
    if (state.route === 'support') startSupportPoll();
    else stopSupportPoll();
  }

  function render() {
    document.getElementById('root').innerHTML = view();
    bind();
  }

  async function boot() {
    parseHash();
    const tok = tokenGet();
    try {
      const res = await fetch('/api/admin', {
        credentials: 'include',
        headers: tok ? { Authorization: 'Bearer ' + tok } : {},
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = {}; }
      if (!res.ok || !data || data.ok == null && /<!doctype|<html/i.test(text)) {
        state.apiOk = false;
        state.configured = false;
        state.hint = 'no_api';
      } else {
        state.apiOk = true;
        state.configured = data.configured !== false;
        state.hint = data.hint || (state.configured ? 'ok' : '');
        if (data.signedIn && data.actor) state.actor = data.actor;
      }
    } catch (_) {
      state.apiOk = false;
      state.configured = false;
      state.hint = 'no_api';
    }
    if (state.actor) await load();
    else render();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.route === 'support') pollSupport();
  });

  window.addEventListener('hashchange', () => {
    const prev = state.route + '/' + state.id;
    parseHash();
    if (state.route + '/' + state.id === prev) return;
    state.page = 1;
    state.modalKind = null;
    if (!['users','shops','riders','orders','withdrawals','support'].includes(state.route)) {
      state.filters = Object.assign({}, state.filters, { q: '', status: 'all' });
    }
    load();
  });

  boot();
})();
