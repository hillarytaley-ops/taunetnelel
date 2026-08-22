(function () {
  'use strict';

  const auth = window.taunetMembersAuth;
  const loginCard = document.getElementById('board-login');
  const deskCard = document.getElementById('board-desk');
  const statusEl = document.getElementById('board-status');

  let cycle = null;
  let positions = [];
  const boardState = { analytics: null, positions: [] };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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

  async function boardApi(options = {}) {
    const token = await accessToken();
    if (!token) throw new Error('Sign in required.');
    const res = await fetch('/api/elections-board', {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not reach the election board (${res.status})`);
    return data;
  }

  function setStepper(phase) {
    const order = ['eoi', 'nomination', 'voting', 'closed'];
    const current = order.includes(phase) ? phase : 'eoi';
    const currentIdx = Math.min(order.indexOf(current), 2);
    document.querySelectorAll('#board-steps [data-step]').forEach((el) => {
      const idx = order.indexOf(el.dataset.step);
      el.classList.toggle(
        'is-current',
        el.dataset.step === current || (current === 'closed' && el.dataset.step === 'voting')
      );
      el.classList.toggle('is-done', idx < currentIdx || current === 'closed');
    });
  }

  function render(data) {
    cycle = data.cycle || null;
    positions = data.positions || [];
    const phase = cycle?.phase || (cycle?.is_open ? 'eoi' : 'closed');
    const phaseLabel = { eoi: 'EOI', nomination: 'Nomination', voting: 'Voting', closed: 'Closed' }[phase] || phase;
    setStepper(phase);
    document.getElementById('board-officer').textContent =
      `${data.officer?.full_name || data.officer?.email || 'Election board'} · ${data.officer?.email || ''}`;
    document.getElementById('board-cycle').textContent = cycle
      ? `${cycle.title} — stage: ${phaseLabel}. Member portal ${cycle.is_open && phase !== 'closed' ? 'OPEN' : 'PAUSED'}.`
      : 'No election cycle found.';
    document.querySelectorAll('[data-board-phase]').forEach((btn) => {
      btn.classList.toggle('btn--primary', btn.dataset.boardPhase === phase);
      btn.classList.toggle('btn--ghost', btn.dataset.boardPhase !== phase);
    });
    const pause = document.getElementById('board-pause');
    if (pause) pause.textContent = cycle?.is_open && phase !== 'closed' ? 'Pause elections' : 'Resume elections';
    const titles = Object.fromEntries(
      positions.map((p) => [p.id, `${p.board === 'welfare' ? 'Welfare' : 'Association'} · ${p.title}`])
    );
    const rows = data.rows || [];
    const analytics = data.analytics || null;
    window.taunetElectionAnalytics?.render(document.getElementById('board-analytics'), analytics);
    const onBallot = rows.filter((row) => row.nominated).length;
    document.getElementById('board-count').textContent =
      `${rows.length} expression(s) of interest · ${onBallot} on the ballot`;
    const body = document.getElementById('board-body');
    boardState.analytics = analytics;
    boardState.positions = positions;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8">No expressions of interest yet.</td></tr>';
      return;
    }
    const showVotes = phase === 'voting' || phase === 'closed';
    body.innerHTML = rows
      .map((row) => {
        const when = row.created_at
          ? new Date(row.created_at).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })
          : '—';
        const ballotLabel = row.nominated ? 'Remove from ballot' : 'Place on ballot';
        return `<tr>
          <td>${escapeHtml(when)}</td>
          <td>${escapeHtml(row.full_name || '—')}<div class="elections-muted">${escapeHtml(row.email || '')}${row.phone ? ` · ${escapeHtml(row.phone)}` : ''}</div></td>
          <td>${escapeHtml(titles[row.position_id] || row.position_id)}</td>
          <td>${escapeHtml(row.statement || '')}</td>
          <td>${Number(row.nomination_count || 0)}</td>
          <td>${showVotes ? Number(row.vote_count || 0) : '—'}</td>
          <td>${row.nominated ? 'On ballot' : '—'}<div class="elections-muted">${escapeHtml(row.status || '')}</div></td>
          <td>
            <button type="button" class="btn btn--sm btn--ghost" data-board-ballot="${escapeHtml(row.id)}" data-nominated="${row.nominated ? '0' : '1'}">${ballotLabel}</button>
            <button type="button" class="btn btn--sm btn--ghost" data-board-status="${escapeHtml(row.id)}" data-next="noted">Mark noted</button>
            <button type="button" class="btn btn--sm btn--ghost" data-board-status="${escapeHtml(row.id)}" data-next="withdrawn">Withdraw</button>
          </td>
        </tr>`;
      })
      .join('');
    body.querySelectorAll('[data-board-ballot]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        showStatus('');
        try {
          await boardApi({
            method: 'POST',
            body: { action: 'ballot', id: btn.dataset.boardBallot, nominated: btn.dataset.nominated === '1' },
          });
          await loadDesk();
        } catch (err) {
          showStatus(err.message, 'error');
        }
      });
    });
    body.querySelectorAll('[data-board-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        showStatus('');
        try {
          await boardApi({
            method: 'POST',
            body: { action: 'status', id: btn.dataset.boardStatus, status: btn.dataset.next },
          });
          await loadDesk();
        } catch (err) {
          showStatus(err.message, 'error');
        }
      });
    });
  }

  function showLogin() {
    deskCard.hidden = true;
    loginCard.hidden = false;
  }

  async function loadDesk() {
    const data = await boardApi();
    loginCard.hidden = true;
    deskCard.hidden = false;
    render(data);
  }

  async function signOut() {
    try {
      const client = await window.taunetSupabaseApi?.ensureClient();
      await client?.auth.signOut({ scope: 'local' });
    } catch (_) {
      /* ignore */
    }
    showLogin();
  }

  async function boot() {
    try {
      const token = await accessToken();
      if (!token) {
        showLogin();
        return;
      }
      await loadDesk();
    } catch (err) {
      try {
        const client = await window.taunetSupabaseApi?.ensureClient();
        await client?.auth.signOut({ scope: 'local' });
      } catch (_) {
        /* ignore */
      }
      showLogin();
      const msg = document.getElementById('board-login-msg');
      if (msg) {
        msg.hidden = false;
        msg.textContent = err.message || 'Could not open the election board.';
      }
    }
  }

  document.getElementById('board-login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = document.getElementById('board-login-msg');
    msg.hidden = true;
    try {
      await auth.signIn(
        document.getElementById('board-email').value,
        document.getElementById('board-password').value
      );
      await loadDesk();
    } catch (err) {
      msg.hidden = false;
      msg.textContent = err.message || 'Could not sign in.';
    }
  });

  document.querySelectorAll('[data-board-phase]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const phase = btn.dataset.boardPhase;
      const labels = { eoi: 'Expression of Interest', nomination: 'Nomination', voting: 'Voting', closed: 'Closed' };
      if (!window.confirm(`Switch the member portal to ${labels[phase] || phase}?`)) return;
      showStatus('');
      try {
        await boardApi({ method: 'POST', body: { action: 'phase', phase } });
        await loadDesk();
      } catch (err) {
        showStatus(err.message, 'error');
      }
    });
  });

  document.getElementById('board-pause')?.addEventListener('click', async () => {
    showStatus('');
    try {
      await boardApi({ method: 'POST', body: { action: 'pause', is_open: !(cycle?.is_open) } });
      await loadDesk();
    } catch (err) {
      showStatus(err.message, 'error');
    }
  });

  document.getElementById('board-refresh')?.addEventListener('click', () => {
    loadDesk().catch((err) => showStatus(err.message, 'error'));
  });

  document.getElementById('board-export')?.addEventListener('click', () => {
    showStatus('');
    try {
      window.taunetElectionAnalytics.downloadCsv(boardState.analytics, boardState.positions);
      showStatus('Analytics CSV downloaded.', 'ok');
    } catch (err) {
      showStatus(err.message, 'error');
    }
  });

  document.getElementById('board-signout')?.addEventListener('click', signOut);

  boot();
})();
