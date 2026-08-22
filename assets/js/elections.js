(function () {
  'use strict';

  const auth = window.taunetMembersAuth;
  const loginCard = document.getElementById('elections-login');
  const formCard = document.getElementById('elections-form-card');
  const nominateCard = document.getElementById('elections-nominate-card');
  const voteCard = document.getElementById('elections-vote-card');
  const closedCard = document.getElementById('elections-closed');
  const statusEl = document.getElementById('elections-status');
  const nominateStatusEl = document.getElementById('elections-nominate-status');
  const voteStatusEl = document.getElementById('elections-vote-status');
  const assocHost = document.getElementById('elections-assoc');
  const welfareHost = document.getElementById('elections-welfare');

  let cycle = null;
  let positions = [];
  let member = null;
  let payload = { expressions: [], myNominations: [], myVotes: [], results: null, mine: [] };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showBanner(el, text, kind) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('is-error', kind === 'error');
    el.classList.toggle('is-ok', kind === 'ok');
  }

  function showStatus(text, kind) {
    showBanner(statusEl, text, kind);
  }

  function hideAllCards() {
    [loginCard, formCard, nominateCard, voteCard, closedCard].forEach((el) => {
      if (el) el.hidden = true;
    });
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
    if (position.eligibility === 'association') return Boolean(member.associationMember);
    return Boolean(member.associationMember || member.welfareMember);
  }

  function setStepper(phase) {
    const order = ['eoi', 'nomination', 'voting', 'closed'];
    const current = order.includes(phase) ? phase : 'eoi';
    const currentIdx = Math.min(order.indexOf(current), 2);
    document.querySelectorAll('#elections-steps [data-step]').forEach((el) => {
      const idx = order.indexOf(el.dataset.step);
      el.classList.toggle('is-current', el.dataset.step === current || (current === 'closed' && el.dataset.step === 'voting'));
      el.classList.toggle('is-done', idx < currentIdx || current === 'closed');
    });
  }

  function applyCycleCopy(nextCycle) {
    cycle = nextCycle || cycle;
    if (!cycle) return;
    const title = document.getElementById('elections-title');
    const lede = document.getElementById('elections-lede');
    if (title) title.textContent = cycle.title || 'Elections';
    if (lede && cycle.summary) lede.textContent = cycle.summary;
    setStepper(cycle.phase || 'eoi');
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
          <input type="radio" name="position_id" value="${escapeHtml(pos.id)}" id="${id}" ${allowed ? '' : 'disabled'}>
          <span>
            <strong>${escapeHtml(pos.title)}</strong>
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
          `<li><strong>${escapeHtml(titles[row.position_id] || row.position_id)}</strong> — ${escapeHtml(row.status)}${row.nominated ? ' · on the ballot' : ''}</li>`
      )
      .join('');
  }

  function peopleFor(positionId) {
    return (payload.expressions || []).filter((row) => row.position_id === positionId);
  }

  function pickedNomination(positionId) {
    return (payload.myNominations || []).find((row) => row.position_id === positionId)?.expression_id || '';
  }

  function pickedVotes(positionId) {
    return new Set(
      (payload.myVotes || [])
        .filter((row) => row.position_id === positionId)
        .map((row) => row.expression_id)
    );
  }

  function renderNomination() {
    const host = document.getElementById('elections-nominate-boards');
    if (!host) return;
    const boards = [
      { id: 'association', title: 'Association' },
      { id: 'welfare', title: 'Social Welfare' },
    ];
    host.innerHTML = boards
      .map((board) => {
        const posts = positions.filter((pos) => pos.board === board.id);
        const body = posts
          .map((pos) => {
            const allowed = canVie(pos);
            const people = peopleFor(pos.id);
            const picked = pickedNomination(pos.id);
            const list = people.length
              ? people
                  .map((person) => {
                    const selected = person.id === picked;
                    return `<article class="elections-person${selected ? ' is-picked' : ''}">
                      <strong>${escapeHtml(person.full_name)}</strong>
                      <p>${escapeHtml(person.statement || '')}</p>
                      <button type="button" class="btn btn--sm ${selected ? 'btn--primary' : 'btn--ghost'}" data-nominate="${escapeHtml(person.id)}" ${allowed ? '' : 'disabled'}>
                        ${selected ? 'Your nomination' : 'Nominate'}
                      </button>
                    </article>`;
                  })
                  .join('')
              : '<p class="elections-muted">No expressions of interest for this office yet.</p>';
            return `<div class="elections-post">
              <h4>${escapeHtml(pos.title)}</h4>
              ${allowed ? '' : '<p class="elections-muted">You are not on the list for this office.</p>'}
              ${list}
            </div>`;
          })
          .join('');
        return `<div><h3>${board.title}</h3>${body}</div>`;
      })
      .join('');

    host.querySelectorAll('[data-nominate]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        showBanner(nominateStatusEl, '');
        try {
          const data = await electionsApi('', {
            method: 'POST',
            auth: true,
            body: { action: 'nominate', expression_id: btn.dataset.nominate },
          });
          showBanner(nominateStatusEl, data.message || 'Nomination recorded.', 'ok');
          await refreshMemberView();
        } catch (err) {
          showBanner(nominateStatusEl, err.message, 'error');
        }
      });
    });
  }

  function renderBallot() {
    const host = document.getElementById('elections-vote-boards');
    if (!host) return;
    const boards = [
      { id: 'association', title: 'Association' },
      { id: 'welfare', title: 'Social Welfare' },
    ];
    host.innerHTML = boards
      .map((board) => {
        const posts = positions.filter((pos) => pos.board === board.id);
        const body = posts
          .map((pos) => {
            const allowed = canVie(pos);
            const people = peopleFor(pos.id);
            const picked = pickedVotes(pos.id);
            const multi = Number(pos.seats) > 1;
            const inputType = multi ? 'checkbox' : 'radio';
            const hint = multi
              ? `Choose up to ${pos.seats} candidate(s).`
              : 'Choose one candidate.';
            const list = people.length
              ? people
                  .map((person) => {
                    const checked = picked.has(person.id) ? 'checked' : '';
                    return `<label class="elections-option${allowed ? '' : ' is-disabled'}">
                      <input type="${inputType}" name="vote-${escapeHtml(pos.id)}" value="${escapeHtml(person.id)}" ${checked} ${allowed ? '' : 'disabled'}>
                      <span>
                        <strong>${escapeHtml(person.full_name)}</strong>
                        <small>${escapeHtml(person.statement || '')}</small>
                      </span>
                    </label>`;
                  })
                  .join('')
              : '<p class="elections-muted">No nominated candidates for this office yet.</p>';
            return `<form class="elections-post" data-vote-form="${escapeHtml(pos.id)}" data-seats="${Number(pos.seats) || 1}">
              <h4>${escapeHtml(pos.title)}</h4>
              <p class="elections-muted">${hint}${allowed ? '' : ' You are not on the list for this office.'}</p>
              ${list}
              ${allowed && people.length ? '<button type="submit" class="btn btn--sm btn--primary">Save vote</button>' : ''}
            </form>`;
          })
          .join('');
        return `<div><h3>${board.title}</h3>${body}</div>`;
      })
      .join('');

    host.querySelectorAll('[data-vote-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const positionId = form.dataset.voteForm;
        const seats = Math.max(1, Number(form.dataset.seats) || 1);
        const chosen = [...form.querySelectorAll('input:checked')].map((el) => el.value);
        showBanner(voteStatusEl, '');
        if (chosen.length > seats) {
          showBanner(voteStatusEl, `You may choose up to ${seats} candidate(s).`, 'error');
          return;
        }
        if (!chosen.length) {
          showBanner(voteStatusEl, 'Choose a candidate first.', 'error');
          return;
        }
        try {
          const data = await electionsApi('', {
            method: 'POST',
            auth: true,
            body: { action: 'vote', position_id: positionId, expression_ids: chosen },
          });
          showBanner(voteStatusEl, data.message || 'Vote recorded.', 'ok');
          await refreshMemberView();
        } catch (err) {
          showBanner(voteStatusEl, err.message, 'error');
        }
      });
    });
  }

  function renderResults() {
    const box = document.getElementById('elections-results');
    if (!box) return;
    const results = payload.results || {};
    const people = payload.expressions || [];
    if (!people.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = `<h3>Results</h3>${positions
      .map((pos) => {
        const rows = people
          .filter((person) => person.position_id === pos.id)
          .map((person) => ({
            name: person.full_name,
            votes: Number(results[`${pos.id}:${person.id}`] || 0),
          }))
          .sort((a, b) => b.votes - a.votes);
        if (!rows.length) return '';
        return `<div class="elections-post">
          <h4>${escapeHtml(pos.title)}</h4>
          <ul>${rows.map((row) => `<li><strong>${escapeHtml(row.name)}</strong> — ${row.votes} vote(s)</li>`).join('')}</ul>
        </div>`;
      })
      .join('')}`;
  }

  function memberLine() {
    return `${member.name} · ${member.planLabel || 'Member'}`;
  }

  async function refreshMemberView() {
    const data = await electionsApi('?mine=1', { auth: true });
    cycle = data.cycle;
    positions = data.positions || [];
    payload = data;
    applyCycleCopy(cycle);
    await showMemberStage();
  }

  async function showMemberStage() {
    hideAllCards();
    const phase = cycle?.phase || 'eoi';
    const paused = cycle?.is_open === false && phase !== 'closed';

    if (paused) {
      closedCard.hidden = false;
      document.getElementById('elections-closed-title').textContent = 'Elections are paused';
      document.getElementById('elections-closed-text').textContent =
        'The committee has paused this cycle. Sign in later to continue.';
      return;
    }

    if (phase === 'closed') {
      closedCard.hidden = false;
      document.getElementById('elections-closed-title').textContent = 'Elections are closed';
      document.getElementById('elections-closed-text').textContent =
        'The committee has closed this cycle. Results are below if voting has finished.';
      renderResults();
      return;
    }

    if (phase === 'nomination') {
      nominateCard.hidden = false;
      document.getElementById('elections-nominate-member').textContent = memberLine();
      renderNomination();
      return;
    }

    if (phase === 'voting') {
      voteCard.hidden = false;
      document.getElementById('elections-vote-member').textContent = memberLine();
      renderBallot();
      return;
    }

    formCard.hidden = false;
    document.getElementById('elections-member').textContent = memberLine();
    if (member.phone) document.getElementById('elections-phone').value = member.phone;
    renderPositions();
    renderMine(payload.mine || []);
  }

  function showLogin() {
    hideAllCards();
    loginCard.hidden = false;
  }

  async function signOut() {
    try {
      const client = await window.taunetSupabaseApi?.ensureClient();
      await client?.auth.signOut({ scope: 'local' });
    } catch (_) {
      /* ignore */
    }
    member = null;
    showLogin();
  }

  async function boot() {
    try {
      const publicData = await electionsApi('');
      applyCycleCopy(publicData.cycle);
    } catch (err) {
      showStatus(err.message, 'error');
    }

    try {
      member = auth ? await auth.getSessionMember() : null;
    } catch (_) {
      member = null;
    }
    if (!member) {
      showLogin();
      return;
    }
    try {
      await refreshMemberView();
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
      await refreshMemberView();
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
          action: 'eoi',
          position_id: position?.value || '',
          phone: document.getElementById('elections-phone').value,
          statement: document.getElementById('elections-statement').value,
        },
      });
      showStatus(data.message || 'Interest recorded.', 'ok');
      document.getElementById('elections-statement').value = '';
      const refreshed = await electionsApi('?mine=1', { auth: true });
      payload = refreshed;
      renderMine(refreshed.mine || []);
    } catch (err) {
      showStatus(err.message, 'error');
    }
  });

  document.getElementById('elections-signout')?.addEventListener('click', signOut);
  document.getElementById('elections-nominate-signout')?.addEventListener('click', signOut);
  document.getElementById('elections-vote-signout')?.addEventListener('click', signOut);

  boot();
})();
