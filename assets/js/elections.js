(function () {
  'use strict';

  const auth = window.taunetMembersAuth;
  const loginCard = document.getElementById('elections-login');
  const formCard = document.getElementById('elections-form-card');
  const closedCard = document.getElementById('elections-closed');
  const statusEl = document.getElementById('elections-status');
  const assocHost = document.getElementById('elections-assoc');
  const welfareHost = document.getElementById('elections-welfare');

  let cycle = null;
  let positions = [];
  let member = null;

  function showStatus(text, kind) {
    if (!statusEl) return;
    statusEl.hidden = !text;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('is-error', kind === 'error');
    statusEl.classList.toggle('is-ok', kind === 'ok');
  }

  async function accessToken() {
    const api = window.taunetSupabaseApi;
    const client = await api?.ensureClient();
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || '';
  }

  async function electionsApi(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (options.auth) {
      const token = await accessToken();
      if (!token) throw new Error('Sign in required.');
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`/api/elections${path || ''}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not reach elections (${res.status})`);
    return data;
  }

  function canVie(position) {
    if (!member) return false;
    if (position.eligibility === 'welfare') return Boolean(member.welfareMember);
    return Boolean(member.associationMember);
  }

  function renderPositions() {
    const groups = { association: assocHost, welfare: welfareHost };
    Object.values(groups).forEach((el) => {
      if (el) el.innerHTML = '';
    });
    positions.forEach((pos) => {
      const host = groups[pos.board];
      if (!host) return;
      const allowed = canVie(pos);
      const id = `pos-${pos.id}`;
      const seats = pos.seats > 1 ? ` · ${pos.seats} seats` : '';
      const need =
        pos.eligibility === 'welfare' ? 'Welfare members' : 'Association members';
      host.insertAdjacentHTML(
        'beforeend',
        `<label class="elections-option${allowed ? '' : ' is-disabled'}">
          <input type="radio" name="position_id" value="${pos.id}" id="${id}" ${allowed ? '' : 'disabled'}>
          <span>
            <strong>${pos.title}</strong>
            <small>${need}${seats}${allowed ? '' : ' — you are not on this list'}</small>
          </span>
        </label>`
      );
    });
  }

  function renderMine(rows) {
    const box = document.getElementById('elections-mine');
    const list = document.getElementById('elections-mine-list');
    if (!box || !list) return;
    if (!rows.length) {
      box.hidden = true;
      return;
    }
    const titles = Object.fromEntries(positions.map((p) => [p.id, p.title]));
    box.hidden = false;
    list.innerHTML = rows
      .map(
        (row) =>
          `<li><strong>${titles[row.position_id] || row.position_id}</strong> — ${row.status}</li>`
      )
      .join('');
  }

  async function showForm() {
    loginCard.hidden = true;
    const data = await electionsApi('?mine=1', { auth: true });
    cycle = data.cycle;
    positions = data.positions || [];
    document.getElementById('elections-title').textContent = cycle.title || 'Elections';
    if (cycle.summary) document.getElementById('elections-lede').textContent = cycle.summary;
    if (!cycle.accepting) {
      formCard.hidden = true;
      closedCard.hidden = false;
      return;
    }
    closedCard.hidden = true;
    formCard.hidden = false;
    document.getElementById('elections-member').textContent =
      `${member.name} · ${member.planLabel || 'Member'}`;
    if (member.phone) document.getElementById('elections-phone').value = member.phone;
    renderPositions();
    renderMine(data.mine || []);
  }

  function showLogin() {
    formCard.hidden = true;
    closedCard.hidden = true;
    loginCard.hidden = false;
  }

  async function boot() {
    try {
      member = auth ? await auth.getSessionMember() : null;
    } catch (_) {
      member = null;
    }
    if (!member) {
      showLogin();
      try {
        const data = await electionsApi('');
        cycle = data.cycle;
        if (cycle?.title) document.getElementById('elections-title').textContent = cycle.title;
        if (cycle?.summary) document.getElementById('elections-lede').textContent = cycle.summary;
        if (cycle && !cycle.accepting) {
          loginCard.hidden = true;
          closedCard.hidden = false;
        }
      } catch (err) {
        showStatus(err.message, 'error');
      }
      return;
    }
    try {
      await showForm();
    } catch (err) {
      showLogin();
      showStatus(err.message, 'error');
    }
  }

  document.getElementById('elections-login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = document.getElementById('elections-login-msg');
    msg.hidden = true;
    try {
      member = await auth.signIn(
        document.getElementById('elections-email').value,
        document.getElementById('elections-password').value
      );
      await showForm();
    } catch (err) {
      msg.hidden = false;
      msg.textContent = err.message || 'Could not sign in.';
    }
  });

  document.getElementById('elections-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const position = document.querySelector('input[name="position_id"]:checked');
    showStatus('');
    try {
      const data = await electionsApi('', {
        method: 'POST',
        auth: true,
        body: {
          position_id: position?.value || '',
          phone: document.getElementById('elections-phone').value,
          statement: document.getElementById('elections-statement').value,
        },
      });
      showStatus(data.message || 'Interest recorded.', 'ok');
      document.getElementById('elections-statement').value = '';
      const refreshed = await electionsApi('?mine=1', { auth: true });
      renderMine(refreshed.mine || []);
    } catch (err) {
      showStatus(err.message, 'error');
    }
  });

  document.getElementById('elections-signout')?.addEventListener('click', async () => {
    try {
      const client = await window.taunetSupabaseApi?.ensureClient();
      await client?.auth.signOut({ scope: 'local' });
    } catch (_) {
      /* ignore */
    }
    member = null;
    showLogin();
  });

  boot();
})();
