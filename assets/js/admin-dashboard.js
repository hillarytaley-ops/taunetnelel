/**
 * Taunet Nelel — site-wide committee admin dashboard.
 * Access: Supabase Auth + site_admins → /api/admin/data
 */
(function () {
  'use strict';

  const PANELS = [
    'overview',
    'enquiries',
    'ithelp',
    'members',
    'imports',
    'business',
    'events',
    'invoices',
    'sponsors',
    'gallery',
    'newsletter',
    'announcements',
    'pages'
  ];

  const BOOTSTRAP_PIN_KEY = 'taunet_admin_bootstrap_pin';

  const state = {
    client: null,
    user: null,
    isAdmin: false,
    accessToken: '',
    bootstrapPin: '',
    enquiries: [],
    enquiryFilter: 'all',
    enquirySearch: '',
    itHelpThreads: [],
    itHelpFilter: 'open',
    itHelpSelectedId: '',
    itHelpThread: null,
    itHelpMessages: [],
    itHelpPoll: null,
    importFilter: 'all',
    importSearch: '',
    importRows: [],
    businessEditor: null
  };

  const els = {
    shell: document.getElementById('admin-shell'),
    userLabel: document.getElementById('admin-user-label'),
    logoutBtn: document.getElementById('admin-logout'),
    nav: document.querySelectorAll('[data-admin-nav]'),
    panels: document.querySelectorAll('[data-admin-panel]')
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showShell(show) {
    if (els.shell) els.shell.hidden = !show;
  }

  function authEntryUrl() {
    return '../members/auth.html?tab=admin&next=' + encodeURIComponent('../admin/');
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function setAdminNavOpen(open) {
    const shell = document.getElementById('admin-shell');
    const toggle = document.getElementById('admin-menu-toggle');
    const backdrop = document.getElementById('admin-nav-backdrop');
    const isOpen = Boolean(open);
    shell?.classList.toggle('is-nav-open', isOpen);
    document.body.classList.toggle('is-admin-nav-open', isOpen);
    if (toggle) {
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    }
    if (backdrop) backdrop.hidden = !isOpen;
  }

  function panelExists(id) {
    return Boolean(document.querySelector(`[data-admin-panel="${id}"]`));
  }

  function setPanel(id) {
    // Prefer DOM panels over the static list so new sections (e.g. invoices) always open
    const next = panelExists(id) ? id : panelExists('overview') ? 'overview' : (PANELS.includes(id) ? id : 'overview');
    document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.adminNav === next);
    });
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.adminPanel === next);
    });
    const title = document.getElementById('admin-panel-title');
    const blurb = document.getElementById('admin-panel-blurb');
    const titles = {
      overview: 'Overview',
      enquiries: 'Enquiries',
      ithelp: 'IT Help chat',
      members: 'Member profiles',
      imports: 'Association & Welfare',
      business: 'Business Hub',
      events: 'Events',
      invoices: 'Invoices',
      sponsors: 'Sponsors',
      gallery: 'Gallery',
      newsletter: 'Newsletter',
      announcements: 'Announcements',
      pages: 'Pages & tools'
    };
    const blurbs = {
      overview: 'Your committee home — counts, alerts, and shortcuts.',
      enquiries: 'Contact, membership, and other form submissions.',
      ithelp: 'Live portal IT chat. Reply here — members see it in the website chat.',
      members: 'People who have registered or signed in online.',
      imports: 'Association and Welfare membership lists.',
      business: 'Edit business cards, news, and blog posts.',
      events: 'Published events for the public site and members.',
      invoices: 'PayID / bank invoices — mark paid when the deposit lands.',
      sponsors: 'Sponsor listings for the public sponsorship page.',
      gallery: 'Bulk upload photos, create albums, and publish them on the public gallery.',
      newsletter: 'Event update subscribers from the Contact page.',
      announcements: 'Messages shown on the members dashboard.',
      pages: 'Shortcuts to public pages and committee tools.'
    };
    if (title) title.textContent = titles[next] || 'Admin';
    if (blurb) blurb.textContent = blurbs[next] || '';
    history.replaceState(null, '', `#${next}`);
    if (next !== 'ithelp') stopItHelpPoll();
    if (next === 'enquiries') renderEnquiries();
    if (next === 'ithelp') renderItHelp();
    setAdminNavOpen(false);
  }

  function jumpToPanel(id) {
    setPanel(id);
    refreshPanel(id);
  }

  async function getClient() {
    if (state.client) return state.client;
    const api = window.taunetSupabaseApi;
    if (!api?.isConfigured()) throw new Error('Supabase is not configured.');
    state.client = await api.ensureClient();
    if (!state.client) throw new Error('Could not load Supabase client.');
    return state.client;
  }

  function clearBootstrapPin() {
    sessionStorage.removeItem(BOOTSTRAP_PIN_KEY);
    sessionStorage.removeItem('taunet_site_admin_pin');
    sessionStorage.removeItem('taunet_site_admin_pin_value');
    state.bootstrapPin = '';
  }

  function getBootstrapPin() {
    if (state.bootstrapPin) return state.bootstrapPin;
    state.bootstrapPin = sessionStorage.getItem(BOOTSTRAP_PIN_KEY) || '';
    return state.bootstrapPin;
  }

  async function getAccessToken() {
    if (state.accessToken) return state.accessToken;
    if (!window.taunetSupabaseApi?.isConfigured()) return '';
    const client = await getClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token || '';
    if (!token) return '';
    state.accessToken = token;
    state.user = data.session.user || null;
    return token;
  }

  async function adminApi(resource, options = {}) {
    const token = await getAccessToken();
    const pin = getBootstrapPin();
    if (!token && !pin) throw new Error('Admin session missing. Sign in again.');
    const params = new URLSearchParams({ resource });
    if (options.filter) params.set('filter', options.filter);
    if (options.status) params.set('status', options.status);
    if (options.threadId) params.set('thread_id', options.threadId);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (pin) headers['x-admin-bootstrap-pin'] = pin;
    const res = await fetch(`/api/admin/data?${params.toString()}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (res.status === 401 || res.status === 403) {
      clearBootstrapPin();
      state.accessToken = '';
      state.isAdmin = false;
      throw new Error(data.error || 'Not authorized for committee admin');
    }
    if (!res.ok) {
      throw new Error(data.error || `Admin API error (${res.status})`);
    }
    return data;
  }

  function enterAdminPortal(label) {
    state.isAdmin = true;
    if (els.userLabel) els.userLabel.textContent = label || 'Committee admin';
    showShell(true);
    const hash = (location.hash || '#overview').replace('#', '');
    setPanel(hash);
    ensureBusinessEditor();
    refreshPanel(hash);
  }

  async function loadOverview() {
    const errorEl = document.getElementById('admin-overview-error');
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    try {
      const [data, enquiriesData] = await Promise.all([
        adminApi('overview'),
        adminApi('enquiries').catch(() => ({ rows: [] }))
      ]);

      const map = {
        'stat-enquiries': data.enquiries,
        'stat-new': data.newEnquiries,
        'stat-ithelp': data.itHelpOpen,
        'stat-profiles': data.profiles,
        'stat-imports': data.imports,
        'stat-newsletter': data.newsletter
      };
      Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value ?? '—';
      });

      const newCount = Number(data.newEnquiries) || 0;
      const attention = document.getElementById('admin-overview-attention');
      const attentionCount = document.getElementById('admin-attention-count');
      if (attentionCount) attentionCount.textContent = String(newCount);
      if (attention) attention.hidden = newCount < 1;

      const itHelpOpen = Number(data.itHelpOpen) || 0;
      const itHelpBanner = document.getElementById('admin-overview-ithelp');
      const itHelpCount = document.getElementById('admin-ithelp-count');
      if (itHelpCount) itHelpCount.textContent = String(itHelpOpen);
      if (itHelpBanner) itHelpBanner.hidden = itHelpOpen < 1;

      const rows = enquiriesData.rows || [];
      state.enquiries = rows;
      renderOverviewRecent(rows.slice(0, 6));
    } catch (err) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent =
          'Could not load live counts. Try Refresh data, or sign out and enter your admin PIN again.';
      }
      renderOverviewRecent([]);
      throw err;
    }
  }

  function renderOverviewRecent(rows) {
    const list = document.getElementById('admin-overview-recent');
    if (!list) return;

    if (!rows.length) {
      list.innerHTML = '<li class="admin-muted">No enquiries yet. New form messages will appear here.</li>';
      return;
    }

    list.innerHTML = rows
      .map((row) => {
        const status = row.status || 'new';
        const preview = String(row.message || '').trim() || 'No message text';
        const short = preview.length > 110 ? `${preview.slice(0, 110)}…` : preview;
        return `<li>
          <button type="button" class="admin-recent-item" data-admin-jump="enquiries">
            <span class="admin-recent-item__top">
              <span class="admin-chip admin-chip--${escapeHtml(status)}">${escapeHtml(status)}</span>
              <span class="admin-chip">${escapeHtml(row.form_type || 'form')}</span>
              <time>${escapeHtml(formatDate(row.created_at))}</time>
            </span>
            <strong>${escapeHtml(row.name || row.email || 'Unknown')}</strong>
            <span class="admin-detail">${escapeHtml(short)}</span>
          </button>
        </li>`;
      })
      .join('');
  }

  async function loadEnquiries() {
    const data = await adminApi('enquiries');
    state.enquiries = data.rows || [];
    renderEnquiries();
  }

  function renderEnquiries() {
    const body = document.getElementById('admin-enquiries-body');
    if (!body) return;

    let rows = state.enquiries;
    if (state.enquiryFilter !== 'all') {
      rows = rows.filter((r) => r.form_type === state.enquiryFilter);
    }
    const q = state.enquirySearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.name, r.email, r.message, r.form_type, JSON.stringify(r.metadata || {})]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="admin-empty">No enquiries match.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map((row) => {
        const meta = row.metadata && Object.keys(row.metadata).length
          ? escapeHtml(JSON.stringify(row.metadata, null, 0))
          : '';
        const status = row.status || 'new';
        return `<tr data-id="${escapeHtml(row.id)}">
          <td><span class="admin-chip admin-chip--${escapeHtml(status)}">${escapeHtml(status)}</span><div class="admin-detail">${escapeHtml(formatDate(row.created_at))}</div></td>
          <td><span class="admin-chip">${escapeHtml(row.form_type)}</span></td>
          <td>${escapeHtml(row.name || '—')}<div class="admin-detail">${escapeHtml(row.email || '')}${row.phone ? `<br>${escapeHtml(row.phone)}` : ''}</div></td>
          <td>${escapeHtml(row.message || '—')}${meta ? `<div class="admin-detail">${meta}</div>` : ''}</td>
          <td>
            <div class="admin-actions">
              <select data-status-for="${escapeHtml(row.id)}" aria-label="Update enquiry status">
                <option value="new"${status === 'new' ? ' selected' : ''}>new</option>
                <option value="reviewed"${status === 'reviewed' ? ' selected' : ''}>reviewed</option>
                <option value="actioned"${status === 'actioned' ? ' selected' : ''}>actioned</option>
                <option value="archived"${status === 'archived' ? ' selected' : ''}>archived</option>
              </select>
              <button type="button" class="admin-btn-danger" data-enquiry-remove="${escapeHtml(row.id)}">Remove</button>
            </div>
          </td>
          <td class="admin-detail">${escapeHtml(row.admin_notes || '')}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-status-for]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          await adminApi('enquiry-status', {
            method: 'PATCH',
            body: { id: select.dataset.statusFor, status: select.value }
          });
          const item = state.enquiries.find((r) => r.id === select.dataset.statusFor);
          if (item) item.status = select.value;
          renderEnquiries();
          loadOverview();
        } catch (err) {
          alert(err.message || 'Could not update status.');
        }
      });
    });

    body.querySelectorAll('[data-enquiry-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.enquiryRemove;
        if (!confirm('Remove this enquiry permanently?')) return;
        try {
          await adminApi('enquiry-delete', { method: 'DELETE', body: { id } });
          state.enquiries = state.enquiries.filter((r) => r.id !== id);
          renderEnquiries();
          loadOverview();
        } catch (err) {
          alert(err.message || 'Could not remove enquiry.');
        }
      });
    });
  }

  function stopItHelpPoll() {
    if (state.itHelpPoll) {
      clearInterval(state.itHelpPoll);
      state.itHelpPoll = null;
    }
  }

  function startItHelpPoll() {
    stopItHelpPoll();
    state.itHelpPoll = setInterval(() => {
      const active = document.querySelector('[data-admin-panel="ithelp"].is-active');
      if (!active || !state.isAdmin) {
        stopItHelpPoll();
        return;
      }
      loadItHelp({ silent: true }).catch(() => {});
    }, 8000);
  }

  async function loadItHelp(options = {}) {
    const status = options.status || state.itHelpFilter || 'open';
    state.itHelpFilter = status;
    const data = await adminApi('it-help-threads', { status });
    state.itHelpThreads = data.rows || [];
    if (
      state.itHelpSelectedId &&
      !state.itHelpThreads.some((row) => row.id === state.itHelpSelectedId)
    ) {
      state.itHelpSelectedId = state.itHelpThreads[0]?.id || '';
      state.itHelpThread = null;
      state.itHelpMessages = [];
    }
    if (state.itHelpSelectedId) {
      await loadItHelpMessages(state.itHelpSelectedId);
    }
    renderItHelp();
  }

  async function loadItHelpMessages(threadId) {
    const data = await adminApi('it-help-messages', { threadId });
    state.itHelpThread = data.thread || null;
    state.itHelpMessages = data.messages || [];
  }

  function renderItHelp() {
    const list = document.getElementById('ithelp-threads');
    const head = document.getElementById('ithelp-head');
    const messagesEl = document.getElementById('ithelp-messages');
    const form = document.getElementById('ithelp-reply-form');
    const toggle = document.getElementById('ithelp-toggle-status');
    if (!list) return;

    if (!state.itHelpThreads.length) {
      list.innerHTML = '<p class="admin-muted">No chats in this filter.</p>';
    } else {
      list.innerHTML = state.itHelpThreads
        .map((row) => {
          const active = row.id === state.itHelpSelectedId ? ' is-active' : '';
          return `<button type="button" class="ithelp-thread${active}" data-ithelp-id="${escapeHtml(row.id)}">
            <span class="admin-chip admin-chip--${escapeHtml(row.status || 'open')}">${escapeHtml(row.status || 'open')}</span>
            <strong>${escapeHtml(row.full_name || row.email || 'Unknown')}</strong>
            <div class="admin-detail">${escapeHtml(row.email || '')}<br>${escapeHtml(formatDate(row.last_message_at || row.created_at))}</div>
          </button>`;
        })
        .join('');
      list.querySelectorAll('[data-ithelp-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          state.itHelpSelectedId = btn.dataset.ithelpId;
          try {
            await loadItHelpMessages(state.itHelpSelectedId);
            renderItHelp();
          } catch (err) {
            alert(err.message || 'Could not load conversation.');
          }
        });
      });
    }

    const thread = state.itHelpThread;
    if (!thread) {
      if (head) head.innerHTML = '<p class="admin-muted">Select a conversation.</p>';
      if (messagesEl) messagesEl.innerHTML = '';
      if (form) form.hidden = true;
      return;
    }

    if (head) {
      head.innerHTML = `<div>
        <span class="admin-chip admin-chip--${escapeHtml(thread.status)}">${escapeHtml(thread.status)}</span>
        <strong>${escapeHtml(thread.full_name || thread.email || 'Unknown')}</strong>
        <div class="admin-detail">${escapeHtml(thread.email || '')}</div>
      </div>`;
    }

    if (messagesEl) {
      const atBottom =
        messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 64;
      if (!state.itHelpMessages.length) {
        messagesEl.innerHTML = '<p class="admin-muted">No messages yet.</p>';
      } else {
        messagesEl.innerHTML = state.itHelpMessages
          .map((m) => {
            const who = m.sender === 'it' ? 'it' : 'member';
            const label = who === 'it' ? 'IT' : 'Member';
            return `<div class="ithelp-bubble ithelp-bubble--${who}">
              <strong>${label}</strong>
              <div>${escapeHtml(m.body)}</div>
              <time>${escapeHtml(formatDate(m.created_at))}</time>
            </div>`;
          })
          .join('');
        if (atBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    if (form) form.hidden = false;
    if (toggle) toggle.textContent = thread.status === 'closed' ? 'Reopen chat' : 'Close chat';
  }

  async function loadMembers() {
    const data = await adminApi('members');
    const rows = data.rows || [];
    const body = document.getElementById('admin-members-body');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No profiles yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((row) => {
        const plan = row.plan || 'basic';
        const chipClass = plan === 'both' ? 'both' : plan === 'welfare' ? 'welfare' : '';
        return `<tr>
          <td>${escapeHtml(row.full_name || '—')}<div class="admin-detail">${escapeHtml(row.email || '')}</div></td>
          <td><span class="admin-chip admin-chip--${chipClass}">${escapeHtml(plan)}</span></td>
          <td>${row.association_member ? 'Yes' : 'No'}</td>
          <td>
            ${row.welfare_member ? 'Yes' : 'No'}
            ${!row.welfare_member ? `<div class="admin-actions" style="margin-top:0.35rem"><button type="button" data-approve-welfare="${escapeHtml(row.id)}">Approve welfare</button></div>` : ''}
          </td>
          <td class="admin-detail">${escapeHtml(formatDate(row.created_at))}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-approve-welfare]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Mark this member as welfare-enrolled (Association + Welfare)?')) return;
        try {
          await adminApi('approve-welfare', {
            method: 'PATCH',
            body: { id: btn.dataset.approveWelfare }
          });
          await loadMembers();
        } catch (err) {
          alert(err.message || 'Could not approve welfare.');
        }
      });
    });
  }

  async function loadImports() {
    const data = await adminApi('imports', { filter: state.importFilter || 'all' });
    const stats = data.stats;
    let statsHtml = '';
    if (stats) {
      const cards = [
        { key: 'all', value: stats.total, label: 'Total imported' },
        { key: 'both', value: stats.association_and_welfare, label: 'Association + Welfare' },
        { key: 'association', value: stats.association_only, label: 'Association only' },
        { key: 'welfare', value: stats.welfare_only, label: 'Welfare only' },
        { key: 'pending', value: stats.pending_invite, label: 'Pending invite' }
      ];
      statsHtml = `<div class="admin-stats">${cards
        .map(
          (c) => `<button type="button" class="admin-stat admin-stat--btn${
            state.importFilter === c.key ? ' is-active' : ''
          }" data-import-filter="${c.key}" aria-pressed="${state.importFilter === c.key}">
          <strong>${c.value ?? '—'}</strong>
          <span>${c.label}</span>
          <em class="admin-stat__hint">Click to show list</em>
        </button>`
        )
        .join('')}</div>`;
    }
    const statsHost = document.getElementById('admin-imports-stats');
    if (statsHost) {
      statsHost.innerHTML = statsHtml;
      statsHost.querySelectorAll('[data-import-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.importFilter = btn.dataset.importFilter;
          const select = document.getElementById('imports-filter');
          if (select) select.value = state.importFilter;
          loadImports().then(() => {
            document.getElementById('admin-imports-body')?.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          });
        });
      });
    }

    state.importRows = data.rows || [];
    renderImports();
  }

  function renderImports() {
    const body = document.getElementById('admin-imports-body');
    const countEl = document.getElementById('admin-imports-count');
    if (!body) return;

    let rows = state.importRows || [];
    const q = (state.importSearch || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [r.full_name, r.email, r.member_number, r.membership_label]
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }

    if (countEl) {
      countEl.hidden = false;
      const labels = {
        all: 'Total imported',
        association: 'Association only',
        welfare: 'Welfare only',
        both: 'Association + Welfare',
        association_any: 'All with association',
        welfare_any: 'All with welfare',
        pending: 'Pending invite'
      };
      countEl.textContent = `Showing ${rows.length} — ${labels[state.importFilter] || state.importFilter}`;
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">No members match this filter.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map((row) => {
        const label = row.membership_label || row.plan || '';
        const chip =
          row.association_member && row.welfare_member
            ? 'both'
            : row.welfare_member
              ? 'welfare'
              : '';
        return `<tr>
          <td>${escapeHtml(row.member_number || '—')}</td>
          <td>${escapeHtml(row.full_name || '—')}<div class="admin-detail">${escapeHtml(row.email || '')}</div></td>
          <td><span class="admin-chip admin-chip--${chip}">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(row.status || '—')}</td>
          <td>${row.association_member ? 'Yes' : '—'}</td>
          <td>${row.welfare_member ? 'Yes' : '—'}</td>
          <td><div class="admin-actions"><button type="button" data-import-delete="${escapeHtml(row.id || '')}" data-import-name="${escapeHtml(row.full_name || row.email || 'this member')}">Delete</button></div></td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-import-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-import-delete') || '';
        const name = btn.getAttribute('data-import-name') || 'this member';
        if (!id) {
          alert('Missing member id.');
          return;
        }
        if (
          !confirm(
            `Remove ${name} from the Association & Welfare list?\n\nThis deletes the import record only — not their login/account if they already signed up.`
          )
        ) {
          return;
        }
        const labelText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        try {
          await adminApi('import-delete', {
            method: 'POST',
            body: { id }
          });
          await loadImports();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = labelText;
          alert(err.message || 'Could not delete member.');
        }
      });
    });
  }

  function toDatetimeLocalValue(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromDatetimeLocalValue(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toISOString();
  }

  function inferBoardPhase(row) {
    const override = String(row.phase_override || '').trim();
    if (override && override !== 'auto') return override;
    if (window.TaunetEventsPhases?.getEventPhase) {
      return window.TaunetEventsPhases.getEventPhase({
        start: row.start_at,
        end: row.end_at || row.start_at,
        phaseOverride: row.phase_override
      });
    }
    return 'auto';
  }

  function ticketsFromAdminRow(row) {
    if (Array.isArray(row?.ticket_prices) && row.ticket_prices.length) return row.ticket_prices;
    if (typeof row?.ticket_prices === 'string') {
      try {
        const parsed = JSON.parse(row.ticket_prices);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch (_) {
        /* ignore */
      }
    }
    try {
      const url = new URL(String(row?.booking_url || ''), window.location.origin);
      const raw = url.searchParams.get('t') || '';
      const tickets = [];
      raw.split(',').forEach((part) => {
        const [idRaw, centsRaw] = part.split(':');
        const id = String(idRaw || '').trim().toLowerCase();
        const amount = Math.round(Number(centsRaw));
        if (!id || !Number.isFinite(amount) || amount <= 0) return;
        tickets.push({
          id,
          label: id === 'couple' ? 'Two people' : id === 'single' ? 'Single' : id,
          amount_cents: amount
        });
      });
      if (tickets.length) return tickets;
    } catch (_) {
      /* ignore */
    }
    if (Number(row?.fee_cents) > 0) {
      return [{ id: 'single', label: 'Single', amount_cents: Math.round(Number(row.fee_cents)) }];
    }
    return [];
  }

  async function loadEvents() {
    const data = await adminApi('events');
    const body = document.getElementById('admin-events-body');
    if (!body) return;
    const rows = data.rows || [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No events yet. Add one above, or seed from the site list.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((row) => {
        const board = inferBoardPhase(row);
        const phaseValue = row.phase_override || 'auto';
        return `<tr data-event-id="${escapeHtml(row.id)}">
          <td>
            <strong>${escapeHtml(row.title || '—')}</strong>
            <div class="admin-detail">${escapeHtml(row.location || '')}${row.gallery_url ? `<br><a href="../${escapeHtml(row.gallery_url)}">Gallery link</a>` : ''}</div>
          </td>
          <td class="admin-detail">${escapeHtml(formatDate(row.start_at))}${row.end_at ? `<br>→ ${escapeHtml(formatDate(row.end_at))}` : ''}</td>
          <td>
            <select data-event-phase="${escapeHtml(row.id)}" aria-label="Board placement for ${escapeHtml(row.title || 'event')}">
              <option value="auto"${phaseValue === 'auto' || !row.phase_override ? ' selected' : ''}>Auto (${escapeHtml(board)})</option>
              <option value="upcoming"${phaseValue === 'upcoming' ? ' selected' : ''}>Upcoming</option>
              <option value="present"${phaseValue === 'present' ? ' selected' : ''}>Present</option>
              <option value="most-recent"${phaseValue === 'most-recent' ? ' selected' : ''}>Most Recent</option>
              <option value="past"${phaseValue === 'past' ? ' selected' : ''}>Past</option>
            </select>
            <div class="admin-actions" style="margin-top:0.4rem">
              <button type="button" data-event-publish="${escapeHtml(row.id)}" data-published="${row.is_published ? '1' : '0'}">
                ${row.is_published ? 'Unpublish' : 'Publish'}
              </button>
            </div>
            <div class="admin-detail" style="margin-top:0.45rem" data-event-pricing="${escapeHtml(row.id)}">
              <div style="display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center;margin-bottom:0.3rem">
                <label>Single $
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style="width:5.2rem"
                    value="${(() => {
                      const tickets = ticketsFromAdminRow(row);
                      const single = tickets.find((t) => t.id === 'single') || tickets[0];
                      return single?.amount_cents != null ? (Number(single.amount_cents) / 100).toFixed(2) : '';
                    })()}"
                    data-event-fee-single="${escapeHtml(row.id)}"
                    aria-label="Single ticket AUD"
                    placeholder="100"
                  >
                </label>
                <label>Two $
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style="width:5.2rem"
                    value="${(() => {
                      const tickets = ticketsFromAdminRow(row);
                      const couple = tickets.find((t) => t.id === 'couple');
                      return couple?.amount_cents != null ? (Number(couple.amount_cents) / 100).toFixed(2) : '';
                    })()}"
                    data-event-fee-couple="${escapeHtml(row.id)}"
                    aria-label="Two people ticket AUD"
                    placeholder="150"
                  >
                </label>
              </div>
              <label style="display:flex;gap:0.35rem;align-items:center;margin-bottom:0.3rem">
                <input type="checkbox" data-event-payid="${escapeHtml(row.id)}"${
                  String(row.booking_url || '').includes('pay/event.html') ? ' checked' : ''
                }>
                Book &amp; PayID
              </label>
              <button type="button" class="btn btn--ghost btn--sm" data-event-save-prices="${escapeHtml(row.id)}">Save prices</button>
              <div class="admin-detail" data-event-price-status="${escapeHtml(row.id)}" style="margin-top:0.25rem"></div>
            </div>
          </td>
          <td>${row.is_published ? 'Yes' : 'No'}</td>
          <td>
            <label class="admin-upload-btn">
              Upload photos
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-event-photos="${escapeHtml(row.id)}">
            </label>
            <div class="admin-detail" data-event-photo-status="${escapeHtml(row.id)}">Select many at once</div>
          </td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-event-phase]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          await adminApi('event-update', {
            method: 'PATCH',
            body: { id: select.dataset.eventPhase, phase_override: select.value }
          });
          await loadEvents();
        } catch (err) {
          alert(err.message || 'Could not move event. Run migration 017 if phase_override is missing.');
          await loadEvents();
        }
      });
    });

    body.querySelectorAll('[data-event-publish]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await adminApi('event-update', {
            method: 'PATCH',
            body: {
              id: btn.dataset.eventPublish,
              is_published: btn.dataset.published !== '1'
            }
          });
          await loadEvents();
        } catch (err) {
          alert(err.message || 'Could not update publish state.');
        }
      });
    });

    body.querySelectorAll('[data-event-save-prices]').forEach((btn) => {
      btn.addEventListener('click', async (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        const id = btn.dataset.eventSavePrices;
        const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
        const singleInput = body.querySelector(`[data-event-fee-single="${esc}"]`);
        const coupleInput = body.querySelector(`[data-event-fee-couple="${esc}"]`);
        const payidInput = body.querySelector(`[data-event-payid="${esc}"]`);
        const statusEl = body.querySelector(`[data-event-price-status="${esc}"]`);
        const singleRaw = String(singleInput?.value || '').trim();
        const coupleRaw = String(coupleInput?.value || '').trim();
        if (singleRaw !== '' && (!Number.isFinite(Number(singleRaw)) || Number(singleRaw) < 0)) {
          alert('Enter a valid Single price in AUD (e.g. 100).');
          return;
        }
        if (coupleRaw !== '' && (!Number.isFinite(Number(coupleRaw)) || Number(coupleRaw) < 0)) {
          alert('Enter a valid Two people price in AUD (e.g. 150).');
          return;
        }

        const ticket_prices = [];
        if (singleRaw !== '') {
          ticket_prices.push({
            id: 'single',
            label: 'Single',
            amount_cents: Math.round(Number(singleRaw) * 100)
          });
        }
        if (coupleRaw !== '') {
          ticket_prices.push({
            id: 'couple',
            label: 'Two people',
            amount_cents: Math.round(Number(coupleRaw) * 100)
          });
        }

        btn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';
        try {
          const result = await adminApi('event-update', {
            method: 'PATCH',
            body: {
              id,
              ticket_prices: ticket_prices.length ? ticket_prices : null,
              fee_cents: ticket_prices.length ? ticket_prices[0].amount_cents : null,
              enable_payid_booking: Boolean(payidInput?.checked)
            }
          });
          if (statusEl) {
            statusEl.textContent = result?.warning
              ? `Saved. ${result.warning}`
              : 'Prices saved.';
          }
          await loadEvents();
        } catch (err) {
          const message =
            err.message ||
            'Could not update prices. Run migration 022 in Supabase for ticket_prices.';
          if (statusEl) statusEl.textContent = message;
          alert(message);
        } finally {
          btn.disabled = false;
        }
      });
    });

    body.querySelectorAll('[data-event-photos]').forEach((input) => {
      input.addEventListener('change', async () => {
        const eventId = input.dataset.eventPhotos;
        const status = document.querySelector(`[data-event-photo-status="${eventId}"]`);
        const files = input.files;
        if (!files || !files.length) return;
        try {
          const result = await uploadPhotosBulk({
            files,
            eventId,
            moveToRecent: true,
            statusEl: status
          });
          if (status && result.ok) {
            status.textContent = `Uploaded ${result.ok} photo(s). Event moved to Most Recent.`;
          }
          await loadEvents();
          await loadGallery().catch(() => {});
        } catch (err) {
          if (status) status.textContent = err.message || 'Upload failed.';
          else alert(err.message || 'Upload failed.');
        } finally {
          input.value = '';
        }
      });
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read image file'));
      reader.readAsDataURL(file);
    });
  }

  function compressImageFile(file, maxEdge = 1600, quality = 0.82) {
    if (!file.type || !file.type.startsWith('image/') || file.type === 'image/gif') {
      return readFileAsDataUrl(file);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          readFileAsDataUrl(file).then(resolve, reject);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        readFileAsDataUrl(file).then(resolve, reject);
      };
      img.src = objectUrl;
    });
  }

  async function uploadPhotosBulk(options) {
    const files = Array.from(options.files || []).filter((file) =>
      String(file.type || '').startsWith('image/')
    );
    const statusEl = options.statusEl;
    if (!files.length) throw new Error('Choose one or more photos.');
    if (files.length > 80) throw new Error('Select up to 80 photos at a time.');
    let ok = 0;
    const errors = [];
    for (let i = 0; i < files.length; i += 1) {
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.classList?.remove?.('is-error');
        statusEl.textContent = `Uploading ${i + 1} of ${files.length}…`;
      }
      try {
        const dataUrl = await compressImageFile(files[i]);
        await adminApi('gallery-upload', {
          method: 'POST',
          body: {
            event_id: options.eventId || undefined,
            album_id: options.albumId || undefined,
            title: options.title || undefined,
            event_date: options.eventDate || undefined,
            group_id: options.groupId || undefined,
            move_to_recent: options.moveToRecent !== false,
            photo: { name: files[i].name, dataUrl, alt: files[i].name }
          }
        });
        ok += 1;
      } catch (err) {
        errors.push(`${files[i].name}: ${err.message || 'failed'}`);
      }
    }
    if (!ok) {
      throw new Error(errors[0] || 'Upload failed.');
    }
    if (statusEl) {
      statusEl.textContent = errors.length
        ? `Uploaded ${ok} of ${files.length}. ${errors.length} failed.`
        : `Uploaded ${ok} photo(s).`;
    }
    return { ok, failed: errors.length, errors };
  }

  async function createEventFromForm(event) {
    event.preventDefault();
    const form = event.target;
    const status = document.getElementById('admin-events-seed-status');
    const fd = new FormData(form);
    const startAt = fromDatetimeLocalValue(fd.get('start_at'));
    const endRaw = fd.get('end_at');
    const flyerInput = form.querySelector('[name="flyer"]');
    const flyerFile = flyerInput?.files?.[0] || null;
    const singleRaw = String(fd.get('fee_single_aud') || '').trim();
    const coupleRaw = String(fd.get('fee_couple_aud') || '').trim();
    const payload = {
      title: String(fd.get('title') || '').trim(),
      location: String(fd.get('location') || '').trim(),
      start_at: startAt,
      end_at: endRaw ? fromDatetimeLocalValue(endRaw) : startAt,
      summary: String(fd.get('summary') || '').trim(),
      meta: String(fd.get('meta') || '').trim(),
      badge: String(fd.get('badge') || '').trim(),
      phase_override: String(fd.get('phase_override') || 'auto'),
      fee_single_aud: singleRaw === '' ? '' : Number(singleRaw),
      fee_couple_aud: coupleRaw === '' ? '' : Number(coupleRaw),
      enable_payid_booking: Boolean(form.querySelector('[name="enable_payid_booking"]')?.checked),
      is_published: form.querySelector('[name="is_published"]')?.checked !== false,
      registration_open: Boolean(form.querySelector('[name="registration_open"]')?.checked),
      featured: Boolean(form.querySelector('[name="featured"]')?.checked)
    };
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = flyerFile ? 'Uploading flyer and saving event…' : 'Saving event…';
    }
    try {
      if (flyerFile) {
        payload.flyer_data_url = await readFileAsDataUrl(flyerFile);
        payload.flyer_name = flyerFile.name;
      }
      const result = await adminApi('event-create', { method: 'POST', body: payload });
      form.reset();
      form.querySelector('[name="is_published"]').checked = true;
      const preview = document.getElementById('admin-event-flyer-preview');
      if (preview) preview.hidden = true;
      if (status) {
        status.textContent = result.warning
          ? `Event saved. ${result.warning}`
          : 'Event saved.';
      }
      await loadEvents();
    } catch (err) {
      if (status) {
        status.classList.add('is-error');
        status.textContent = err.message || 'Could not save event.';
      }
    }
  }

  function bindEventFlyerPreview() {
    const input = document.querySelector('#admin-event-form [name="flyer"]');
    const preview = document.getElementById('admin-event-flyer-preview');
    const img = document.getElementById('admin-event-flyer-preview-img');
    if (!input || !preview || !img) return;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        preview.hidden = true;
        img.removeAttribute('src');
        return;
      }
      const url = URL.createObjectURL(file);
      img.onload = () => URL.revokeObjectURL(url);
      img.src = url;
      preview.hidden = false;
    });
  }

  async function seedEventsFromSite() {
    const status = document.getElementById('admin-events-seed-status');
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Seeding events…';
    }
    try {
      const result = await adminApi('seed-events', { method: 'POST', body: {} });
      if (status) {
        status.textContent = `Seeded ${result.count || 10} events from the site list.`;
      }
      await loadEvents();
    } catch (err) {
      if (status) {
        status.classList.add('is-error');
        status.textContent = err.message || 'Could not seed events.';
      }
    }
  }

  async function loadSponsors() {
    const data = await adminApi('sponsors');
    const body = document.getElementById('admin-sponsors-body');
    if (!body) return;
    const rows = data.rows || [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No sponsors in the database yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.name || '—')}</td>
          <td>${escapeHtml(row.tier || '—')}</td>
          <td>${escapeHtml(row.website || '—')}</td>
          <td>${row.is_published ? 'Yes' : 'No'}</td>
          <td>${escapeHtml(String(row.sort_order ?? ''))}</td>
        </tr>`
      )
      .join('');
  }

  async function loadGallery() {
    const body = document.getElementById('admin-gallery-body');
    if (!body) return;

    let dbRows = [];
    try {
      const data = await adminApi('gallery');
      dbRows = data.rows || [];
    } catch (_) {
      dbRows = [];
    }

    const dbById = new Map(dbRows.map((row) => [row.id, row]));
    const staticAlbums = Array.isArray(window.TAUNET_GALLERY) ? window.TAUNET_GALLERY : [];
    const merged = [];
    const seen = new Set();

    staticAlbums.forEach((album) => {
      if (!album?.id) return;
      seen.add(album.id);
      const db = dbById.get(album.id);
      merged.push({
        id: album.id,
        title: album.title || album.nav || album.id,
        event_date: album.sortDate || album.date || '',
        group_id: album.group || 'past',
        photo_count: Array.isArray(album.photos) ? album.photos.length : 0,
        is_published: db ? Boolean(db.is_published) : true,
        source: db ? 'Site + DB' : 'Site list',
        in_db: Boolean(db)
      });
    });

    dbRows.forEach((row) => {
      if (seen.has(row.id)) return;
      merged.push({
        id: row.id,
        title: row.title || row.id,
        event_date: row.event_date || row.sort_date || '',
        group_id: row.group_id || 'past',
        photo_count: row.photo_count,
        is_published: Boolean(row.is_published),
        source: 'Database',
        in_db: true
      });
    });

    merged.sort((a, b) => String(b.event_date || '').localeCompare(String(a.event_date || '')));

    if (!merged.length) {
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">No gallery albums found yet.</td></tr>`;
      return;
    }

    body.innerHTML = merged
      .map((row) => {
        const photoLabel =
          row.photo_count == null || row.photo_count === ''
            ? '—'
            : String(row.photo_count);
        const publishCell = row.in_db
          ? `<label class="admin-actions">
              <input type="checkbox" data-album-pub="${escapeHtml(row.id)}" ${row.is_published ? 'checked' : ''}>
              ${row.is_published ? 'Yes' : 'No'}
            </label>`
          : `<span class="admin-detail">On site list<br><em>Sync to manage</em></span>`;
        return `<tr>
          <td>
            <strong>${escapeHtml(row.title || '—')}</strong>
            <div class="admin-detail">
              <a href="../gallery.html#${escapeHtml(row.id)}" target="_blank" rel="noopener">View album</a>
            </div>
          </td>
          <td>${escapeHtml(row.event_date || '—')}</td>
          <td>${escapeHtml(row.group_id || '—')}</td>
          <td>${escapeHtml(photoLabel)}</td>
          <td>
            <label class="admin-upload-btn">
              Add photos
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-album-photos="${escapeHtml(row.id)}" data-album-title="${escapeHtml(row.title || '')}" data-album-date="${escapeHtml(row.event_date || '')}" data-album-group="${escapeHtml(row.group_id || 'past')}">
            </label>
            <div class="admin-detail" data-album-photo-status="${escapeHtml(row.id)}"></div>
          </td>
          <td>${escapeHtml(row.source)}</td>
          <td>${publishCell}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-album-pub]').forEach((input) => {
      input.addEventListener('change', async () => {
        try {
          await adminApi('gallery-publish', {
            method: 'PATCH',
            body: { id: input.dataset.albumPub, is_published: input.checked }
          });
          await loadGallery();
        } catch (err) {
          alert(err.message || 'Could not update album.');
          input.checked = !input.checked;
        }
      });
    });

    body.querySelectorAll('[data-album-photos]').forEach((input) => {
      input.addEventListener('change', async () => {
        const albumId = input.dataset.albumPhotos;
        const status = document.querySelector(`[data-album-photo-status="${albumId}"]`);
        if (!input.files || !input.files.length) return;
        try {
          await uploadPhotosBulk({
            files: input.files,
            albumId,
            title: input.dataset.albumTitle,
            eventDate: input.dataset.albumDate,
            groupId: input.dataset.albumGroup || 'past',
            moveToRecent: false,
            statusEl: status
          });
          await loadGallery();
        } catch (err) {
          if (status) status.textContent = err.message || 'Upload failed.';
          else alert(err.message || 'Upload failed.');
        } finally {
          input.value = '';
        }
      });
    });
  }

  async function seedGalleryFromSite() {
    const status = document.getElementById('admin-gallery-status');
    const albums = (window.TAUNET_GALLERY || []).map((album) => ({
      id: album.id,
      title: album.title || album.nav || album.id,
      description: album.description || '',
      event_date: album.sortDate || null,
      sort_date: album.sortDate || null,
      group_id: album.group || 'past',
      preview_limit: album.previewLimit || 12,
      is_published: true,
      photos: (album.photos || []).map((photo, index) => ({
        storage_path: photo.src,
        alt_text: photo.alt || '',
        download_name: photo.downloadName || '',
        sort_order: index
      }))
    }));

    if (!albums.length) {
      alert('No site gallery albums found to sync.');
      return;
    }

    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Syncing site albums into the database…';
    }

    try {
      const result = await adminApi('seed-gallery', { method: 'POST', body: { albums } });
      if (status) {
        status.textContent = `Synced ${result.albums || albums.length} albums and ${result.photos || 0} photos.`;
      }
      await loadGallery();
    } catch (err) {
      if (status) {
        status.classList.add('is-error');
        status.textContent = err.message || 'Could not sync gallery albums.';
      }
    }
  }

  async function loadNewsletter() {
    const data = await adminApi('newsletter');
    const body = document.getElementById('admin-newsletter-body');
    if (!body) return;
    const rows = data.rows || [];
    state.newsletterRows = rows;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="3" class="admin-empty">No newsletter subscribers yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.email || '—')}</td>
          <td>${escapeHtml(row.list_key || '—')}</td>
          <td>${escapeHtml(formatDate(row.subscribed_at))}</td>
        </tr>`
      )
      .join('');
  }

  function exportNewsletterCsv() {
    const rows = state.newsletterRows || [];
    if (!rows.length) {
      alert('No subscribers to export yet.');
      return;
    }
    const lines = ['email,list_key,subscribed_at'];
    rows.forEach((row) => {
      const email = String(row.email || '').replace(/"/g, '""');
      const list = String(row.list_key || '').replace(/"/g, '""');
      const when = String(row.subscribed_at || '').replace(/"/g, '""');
      lines.push(`"${email}","${list}","${when}"`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taunet-newsletter-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadAnnouncementsAdmin() {
    const body = document.getElementById('admin-announcements-body');
    if (!body) return;
    try {
      const data = await adminApi('announcements');
      const rows = data.rows || [];
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="4" class="admin-empty">No announcements yet. Publish one below (requires migration 015).</td></tr>`;
        return;
      }
      body.innerHTML = rows
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row.title || '—')}</td>
            <td>${escapeHtml(row.audience || 'all')}</td>
            <td>${row.is_published ? 'Yes' : 'No'}</td>
            <td>${escapeHtml(formatDate(row.published_at))}</td>
          </tr>`
        )
        .join('');
    } catch (err) {
      body.innerHTML = `<tr><td colspan="4" class="admin-empty">${escapeHtml(err.message || 'Could not load announcements. Run migration 015.')}</td></tr>`;
    }
  }

  async function createAnnouncement(event) {
    event.preventDefault();
    const form = event.target;
    const status = document.getElementById('admin-announcement-status');
    const title = form.querySelector('[name="title"]')?.value?.trim();
    const bodyText = form.querySelector('[name="body"]')?.value?.trim();
    const audience = form.querySelector('[name="audience"]')?.value || 'all';
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Publishing…';
    }
    try {
      await adminApi('announcement-create', {
        method: 'POST',
        body: { title, body: bodyText, audience, is_published: true }
      });
      form.reset();
      if (status) status.textContent = 'Announcement published.';
      await loadAnnouncementsAdmin();
    } catch (err) {
      if (status) {
        status.classList.add('is-error');
        status.textContent = err.message || 'Could not publish. Run migration 015 first.';
      }
    }
  }

  function ensureBusinessEditor() {
    const root = document.getElementById('admin-business-root');
    if (!root || !window.TaunetBusinessAdmin) return;
    if (state.businessEditor) {
      state.businessEditor.reload?.();
      return;
    }
    state.businessEditor = window.TaunetBusinessAdmin.mount(root, {
      basePath: '../',
      loadRemote: async () => adminApi('business-content'),
      saveRemote: async (content) =>
        adminApi('business-content-save', { method: 'POST', body: content })
    });
  }

  async function loadInvoices() {
    const body = document.getElementById('admin-invoices-body');
    if (!body) return;
    const statusFilter = document.getElementById('admin-invoice-filter')?.value || 'all';
    body.innerHTML = `<tr><td colspan="7" class="admin-empty">Loading…</td></tr>`;
    const data = await adminApi('invoices', { status: statusFilter });
    const rows = data.rows || [];
    if (data.warning && !rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">${escapeHtml(data.warning)}</td></tr>`;
      return;
    }
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">No invoices for “${escapeHtml(statusFilter)}”. Check Supabase → invoices, or choose All invoices.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((row) => {
        const amount = `$${(Number(row.amount_cents || 0) / 100).toFixed(2)}`;
        const status = String(row.status || 'pending');
        const actions =
          status === 'pending'
            ? `<button type="button" data-invoice-status="${escapeHtml(row.id)}" data-next="paid">Mark paid</button>
               <button type="button" data-invoice-status="${escapeHtml(row.id)}" data-next="void">Void</button>
               <button type="button" data-invoice-delete="${escapeHtml(row.id)}">Delete</button>`
            : status === 'paid'
              ? `<button type="button" data-invoice-receipt="${escapeHtml(row.id)}">Email paid PDF</button>
                 <button type="button" data-invoice-status="${escapeHtml(row.id)}" data-next="pending">Reopen</button>
                 <button type="button" data-invoice-delete="${escapeHtml(row.id)}">Delete</button>`
              : `<button type="button" data-invoice-status="${escapeHtml(row.id)}" data-next="pending">Reopen</button>
                 <button type="button" data-invoice-delete="${escapeHtml(row.id)}">Delete</button>`;
        return `<tr>
          <td>
            <strong>${escapeHtml(row.invoice_number || '—')}</strong>
            <div class="admin-detail">${escapeHtml(row.pay_reference || '')}</div>
          </td>
          <td>
            ${escapeHtml(row.full_name || '—')}
            <div class="admin-detail">${escapeHtml(row.email || '')}</div>
          </td>
          <td>${escapeHtml(
            row.kind === 'donation'
              ? 'Donation'
              : row.kind === 'association'
                ? 'Association'
                : row.kind === 'welfare'
                  ? 'Welfare'
                  : row.kind === 'event'
                    ? 'Event'
                    : row.kind || '—'
          )}</td>
          <td>${escapeHtml(amount)}</td>
          <td><span class="admin-chip admin-chip--${status === 'paid' ? 'reviewed' : status === 'pending' ? 'new' : ''}">${escapeHtml(status)}</span></td>
          <td class="admin-detail">${escapeHtml(formatDate(row.due_at))}</td>
          <td><div class="admin-actions">${actions}</div></td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-invoice-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = btn.dataset.next;
        const label =
          next === 'paid' ? 'Mark this invoice as paid?' : next === 'void' ? 'Void this invoice?' : 'Reopen this invoice?';
        if (!confirm(label)) return;
        try {
          await adminApi('invoice-status', {
            method: 'PATCH',
            body: { id: btn.dataset.invoiceStatus, status: next }
          }).then((result) => {
            if (next === 'paid') {
              if (result?.receipt_emailed) {
                alert('Marked paid. Paid invoice PDF emailed to the member.');
              } else if (result?.receipt_error) {
                alert(
                  'Marked paid, but the receipt email failed: ' + result.receipt_error
                );
              }
            }
          });
          await loadInvoices();
        } catch (err) {
          alert(err.message || 'Could not update invoice.');
        }
      });
    });

    body.querySelectorAll('[data-invoice-receipt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Email the paid invoice PDF to this member now?')) return;
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sending…';
        try {
          const result = await adminApi('invoice-receipt', {
            method: 'POST',
            body: { id: btn.dataset.invoiceReceipt }
          });
          alert(result.message || 'Paid invoice emailed.');
        } catch (err) {
          alert(err.message || 'Could not email paid invoice.');
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    });

    body.querySelectorAll('[data-invoice-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-invoice-delete') || btn.dataset.invoiceDelete || '';
        if (!id) {
          alert('Missing invoice id.');
          return;
        }
        if (
          !confirm(
            'Permanently delete this invoice? This cannot be undone. Prefer Void if you only want to cancel it.'
          )
        ) {
          return;
        }
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Deleting…';
        try {
          await adminApi('invoice-delete', {
            method: 'POST',
            body: { id }
          });
          await loadInvoices();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = label;
          alert(err.message || 'Could not delete invoice.');
        }
      });
    });
  }

  async function refreshPanel(id) {
    if (id === 'business' || id === 'pages') {
      if (id === 'business') ensureBusinessEditor();
      return;
    }

    if (!state.isAdmin) {
      return;
    }

    if (id !== 'ithelp') stopItHelpPoll();

    if (id === 'overview') {
      try {
        await loadOverview();
      } catch (_) { /* ignore */ }
      return;
    }

    const status = document.getElementById('admin-panel-status');
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Loading…';
    }
    try {
      if (id === 'enquiries') await loadEnquiries();
      if (id === 'ithelp') {
        await loadItHelp();
        startItHelpPoll();
      }
      if (id === 'members') await loadMembers();
      if (id === 'imports') await loadImports();
      if (id === 'events') await loadEvents();
      if (id === 'invoices') await loadInvoices();
      if (id === 'sponsors') await loadSponsors();
      if (id === 'gallery') await loadGallery();
      if (id === 'newsletter') await loadNewsletter();
      if (id === 'announcements') await loadAnnouncementsAdmin();
      if (status) status.hidden = true;
    } catch (err) {
      console.error(err);
      if (status) {
        status.hidden = false;
        status.classList.add('is-error');
        status.textContent =
          err.message ||
          'Could not load data. Confirm migration 011 is applied and your committee email is in site_admins.';
      }
    }
  }

  function bindNav() {
    const toggle = document.getElementById('admin-menu-toggle');
    const backdrop = document.getElementById('admin-nav-backdrop');

    toggle?.addEventListener('click', () => {
      const shell = document.getElementById('admin-shell');
      setAdminNavOpen(!shell?.classList.contains('is-nav-open'));
    });
    backdrop?.addEventListener('click', () => setAdminNavOpen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setAdminNavOpen(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 860) setAdminNavOpen(false);
    });

    els.nav.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = btn.dataset.adminNav || btn.getAttribute('data-admin-nav');
        if (!id) return;
        if (btn.tagName === 'A') e.preventDefault();
        jumpToPanel(id);
      });
    });

    document.getElementById('admin-refresh')?.addEventListener('click', () => {
      const active = document.querySelector('[data-admin-nav].is-active');
      refreshPanel(active?.dataset.adminNav || active?.getAttribute('data-admin-nav') || 'overview');
      setAdminNavOpen(false);
    });

    document.addEventListener('click', (e) => {
      const jump = e.target.closest('[data-admin-jump]');
      if (!jump || !document.getElementById('admin-shell')?.contains(jump)) return;
      e.preventDefault();
      const id = jump.dataset.adminJump || jump.getAttribute('data-admin-jump');
      if (id) jumpToPanel(id);
    });

    window.addEventListener('hashchange', () => {
      if (!state.isAdmin) return;
      const id = (location.hash || '#overview').replace(/^#/, '');
      if (panelExists(id)) jumpToPanel(id);
    });

    document.getElementById('enquiry-filter')?.addEventListener('change', (e) => {
      state.enquiryFilter = e.target.value;
      renderEnquiries();
    });

    document.getElementById('enquiry-search')?.addEventListener('input', (e) => {
      state.enquirySearch = e.target.value;
      renderEnquiries();
    });

    document.getElementById('ithelp-filter')?.addEventListener('change', (e) => {
      state.itHelpFilter = e.target.value;
      state.itHelpSelectedId = '';
      state.itHelpThread = null;
      state.itHelpMessages = [];
      if (state.isAdmin) {
        loadItHelp().catch((err) => alert(err.message || 'Could not load IT Help.'));
      }
    });

    document.getElementById('ithelp-reply-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const threadId = state.itHelpSelectedId;
      const textarea = document.getElementById('ithelp-reply-body');
      const text = String(textarea?.value || '').trim();
      if (!threadId) return;
      if (!text) {
        alert('Enter a reply.');
        return;
      }
      try {
        await adminApi('it-help-reply', { method: 'POST', body: { thread_id: threadId, body: text } });
        if (textarea) textarea.value = '';
        await loadItHelpMessages(threadId);
        await loadItHelp({ silent: true });
      } catch (err) {
        alert(err.message || 'Could not send reply.');
      }
    });

    document.getElementById('ithelp-toggle-status')?.addEventListener('click', async () => {
      const thread = state.itHelpThread;
      if (!thread) return;
      const nextStatus = thread.status === 'closed' ? 'open' : 'closed';
      try {
        await adminApi('it-help-close', {
          method: 'POST',
          body: { thread_id: thread.id, status: nextStatus }
        });
        await loadItHelp();
      } catch (err) {
        alert(err.message || 'Could not update chat status.');
      }
    });

    document.getElementById('imports-filter')?.addEventListener('change', (e) => {
      state.importFilter = e.target.value;
      loadImports();
    });

    document.getElementById('imports-search')?.addEventListener('input', (e) => {
      state.importSearch = e.target.value;
      renderImports();
    });

    document.getElementById('admin-seed-events')?.addEventListener('click', () => {
      seedEventsFromSite();
    });

    document.getElementById('admin-seed-gallery')?.addEventListener('click', () => {
      seedGalleryFromSite();
    });

    document.getElementById('admin-event-form')?.addEventListener('submit', createEventFromForm);
    bindEventFlyerPreview();

    document.getElementById('admin-invoice-filter')?.addEventListener('change', () => {
      if (state.isAdmin) loadInvoices().catch((err) => alert(err.message || 'Could not load invoices.'));
    });
    document.getElementById('admin-invoices-refresh')?.addEventListener('click', () => {
      if (state.isAdmin) loadInvoices().catch((err) => alert(err.message || 'Could not load invoices.'));
    });

    document.getElementById('admin-newsletter-export')?.addEventListener('click', () => {
      exportNewsletterCsv();
    });

    document.getElementById('admin-announcement-form')?.addEventListener('submit', createAnnouncement);

    document.getElementById('admin-gallery-upload-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const status = document.getElementById('admin-gallery-upload-status');
      const fd = new FormData(form);
      const title = String(fd.get('title') || '').trim();
      const eventDate = String(fd.get('event_date') || '').trim();
      const groupId = String(fd.get('group_id') || 'recent');
      const fileInput = form.querySelector('[name="photos"]');
      if (!title) {
        alert('Enter an album title.');
        return;
      }
      if (!fileInput?.files?.length) {
        alert('Choose one or more photos.');
        return;
      }
      if (status) {
        status.hidden = false;
        status.classList.remove('is-error');
      }
      try {
        const result = await uploadPhotosBulk({
          files: fileInput.files,
          title,
          eventDate,
          groupId,
          moveToRecent: groupId === 'recent',
          statusEl: status
        });
        form.reset();
        form.querySelector('[name="group_id"]').value = 'recent';
        if (status) {
          status.textContent = `Uploaded ${result.ok} photo(s) to the gallery.`;
        }
        await loadGallery();
      } catch (err) {
        if (status) {
          status.hidden = false;
          status.classList.add('is-error');
          status.textContent = err.message || 'Upload failed.';
        } else {
          alert(err.message || 'Upload failed.');
        }
      }
    });
  }

  async function init() {
    bindNav();

    els.logoutBtn?.addEventListener('click', async () => {
      stopItHelpPoll();
      clearBootstrapPin();
      state.isAdmin = false;
      state.user = null;
      state.accessToken = '';
      try {
        if (window.taunetSupabaseApi?.isConfigured()) {
          const client = await getClient();
          await client.auth.signOut({ scope: 'local' });
        }
      } catch (_) { /* ignore */ }
      window.location.href = authEntryUrl();
    });

    try {
      if (getBootstrapPin()) {
        const sessionInfo = await adminApi('session');
        enterAdminPortal(
          sessionInfo.mode === 'bootstrap'
            ? 'Bootstrap PIN session'
            : sessionInfo.email || 'Committee admin'
        );
        return;
      }

      if (!window.taunetSupabaseApi?.isConfigured()) {
        window.location.replace(authEntryUrl());
        return;
      }
      const client = await getClient();
      const { data: sessionData } = await client.auth.getSession();
      if (!sessionData?.session?.access_token) {
        window.location.replace(authEntryUrl());
        return;
      }
      state.accessToken = sessionData.session.access_token;
      state.user = sessionData.session.user;
      const sessionInfo = await adminApi('session');
      enterAdminPortal(sessionInfo.email || state.user?.email || 'Committee admin');
    } catch (_) {
      clearBootstrapPin();
      try {
        if (window.taunetSupabaseApi?.isConfigured()) {
          const client = await getClient();
          await client.auth.signOut({ scope: 'local' });
        }
      } catch (__) { /* ignore */ }
      window.location.replace(authEntryUrl());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
