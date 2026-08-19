/**
 * Taunet Nelel — site-wide committee admin dashboard.
 * Access: Supabase Auth + site_admins → /api/admin/data
 */
(function () {
  'use strict';

  const LEGACY_NAV = {
    members: 'association-members',
    imports: 'association-list',
    invoices: 'association-invoices'
  };

  const NAV_MAP = {
    overview: { panel: 'overview', group: 'general' },
    enquiries: { panel: 'enquiries', group: 'general' },
    ithelp: { panel: 'ithelp', group: 'general' },
    business: { panel: 'business', group: 'general' },
    gallery: { panel: 'gallery', group: 'general' },
    admins: { panel: 'admins', group: 'general' },
    newsletter: { panel: 'newsletter', group: 'general' },
    announcements: { panel: 'announcements', group: 'general' },
    pages: { panel: 'pages', group: 'general' },
    'welfare-members': { panel: 'members', group: 'welfare', scope: 'welfare' },
    'welfare-list': { panel: 'imports', group: 'welfare', scope: 'welfare' },
    crm: { panel: 'crm', group: 'welfare' },
    followup: { panel: 'followup', group: 'welfare' },
    inbox: { panel: 'inbox', group: 'welfare' },
    claims: { panel: 'claims', group: 'welfare' },
    'welfare-invoices': { panel: 'invoices', group: 'welfare', scope: 'welfare' },
    'association-members': { panel: 'members', group: 'association', scope: 'association' },
    'association-list': { panel: 'imports', group: 'association', scope: 'association' },
    events: { panel: 'events', group: 'association' },
    'association-invoices': { panel: 'invoices', group: 'association', scope: 'association' },
    sponsors: { panel: 'sponsors', group: 'association' }
  };

  const NAV_TITLES = {
    overview: 'Overview',
    enquiries: 'Enquiries',
    ithelp: 'IT Help chat',
    business: 'Business Hub',
    gallery: 'Gallery',
    admins: 'Onboard admins',
    newsletter: 'Newsletter',
    announcements: 'Announcements',
    pages: 'Pages & tools',
    'welfare-members': 'Welfare members',
    'welfare-list': 'Welfare list',
    crm: 'CRM records',
    followup: 'Follow-up',
    inbox: 'Team inbox',
    claims: 'Welfare claims',
    'welfare-invoices': 'Welfare invoices',
    'association-members': 'Association members',
    'association-list': 'Association list',
    events: 'Events',
    'association-invoices': 'Association invoices',
    sponsors: 'Sponsors'
  };

  const NAV_BLURBS = {
    overview: 'Your committee home — counts, alerts, and shortcuts.',
    enquiries: 'Contact, membership, and other form submissions.',
    ithelp: 'Live portal IT chat. Reply here — members see it in the website chat.',
    business: 'Edit business cards, news, and blog posts.',
    gallery: 'Bulk upload photos, create albums, and publish them on the public gallery.',
    admins: 'Invite committee members by email so they can create a password and sign in to this dashboard.',
    newsletter: 'Event update subscribers from the Contact page.',
    announcements: 'Messages shown on the members dashboard.',
    pages: 'Shortcuts to public pages and committee tools.',
    'welfare-members': 'Signed-in Social Welfare members, including people on Association + Welfare.',
    'welfare-list': 'Imported Social Welfare membership list.',
    crm: 'Welfare register. Sensitive bank, income, and ID fields stay Admin-only.',
    followup: 'Email campaigns, SMS, welfare pipeline, calendar, and the join-welfare funnel.',
    inbox: 'Private committee chat and member Team inbox. Choose a conversation below.',
    claims: 'Bereavement and hardship claims lodged on the Welfare tab, including supporting files.',
    'welfare-invoices': '$300 Association + Welfare invoices — mark paid when the deposit lands.',
    'association-members': 'Signed-in Association members who are not on Social Welfare.',
    'association-list': 'Mambo Mob general / Association membership list, including people who are also on Welfare.',
    events: 'Published events for the public site and members.',
    'association-invoices': '$50 Association invoices and event fees — mark paid when the deposit lands.',
    sponsors: 'Sponsor listings for the public sponsorship page.'
  };

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
    inboxThreads: [],
    inboxFilter: 'open',
    inboxSelectedId: '',
    inboxThread: null,
    inboxMessages: [],
    inboxPoll: null,
    adminEmail: '',
    inboxDirectory: { welfare: [], admins: [] },
    inboxPeopleQuery: '',
    importFilter: 'all',
    importSearch: '',
    importRows: [],
    crmTab: 'records',
    crmProfileId: '',
    crmMembers: [],
    crmFields: [],
    crmBound: false,
    followupBound: false,
    followupTab: 'email',
    pipelineData: null,
    businessEditor: null,
    navId: 'overview',
    listScope: ''
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

  const MELBOURNE_TZ = 'Australia/Melbourne';

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('en-AU', {
      timeZone: MELBOURNE_TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateOnly(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-AU', {
      timeZone: MELBOURNE_TZ,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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

  function resolveNav(id) {
    const raw = String(id || 'overview').replace(/^#/, '');
    const mapped = LEGACY_NAV[raw] || raw;
    if (NAV_MAP[mapped]) {
      return { navId: mapped, scope: '', ...NAV_MAP[mapped] };
    }
    if (panelExists(mapped)) {
      return { navId: mapped, panel: mapped, group: 'general', scope: '' };
    }
    return { navId: 'overview', panel: 'overview', group: 'general', scope: '' };
  }

  function setPanel(id) {
    const nav = resolveNav(id);
    state.navId = nav.navId;
    state.listScope = nav.scope || '';
    if (nav.panel === 'imports') {
      state.importFilter = nav.scope === 'welfare' ? 'welfare_any' : nav.scope === 'association' ? 'association_any' : 'all';
    }

    document.querySelectorAll('[data-admin-nav]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.adminNav === nav.navId);
    });
    document.querySelectorAll('[data-admin-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.adminPanel === nav.panel);
    });
    document.querySelectorAll('details[data-admin-group]').forEach((el) => {
      el.open = el.dataset.adminGroup === nav.group;
    });

    const title = document.getElementById('admin-panel-title');
    const blurb = document.getElementById('admin-panel-blurb');
    if (title) title.textContent = NAV_TITLES[nav.navId] || 'Admin';
    if (blurb) blurb.textContent = NAV_BLURBS[nav.navId] || '';

    const membersIntro = document.getElementById('admin-members-intro');
    if (membersIntro && nav.panel === 'members') {
      membersIntro.innerHTML =
        nav.scope === 'welfare'
          ? 'Signed-in Social Welfare members (including Association + Welfare). Open <strong>CRM record</strong> for next of kin and committee-only fields.'
          : 'Signed-in Association members who are not on Social Welfare. Use <strong>Approve welfare</strong> after reviewing a welfare registration. Open <strong>CRM record</strong> for the register.';
    }
    const invoicesIntro = document.getElementById('admin-invoices-intro');
    if (invoicesIntro && nav.panel === 'invoices') {
      invoicesIntro.textContent =
        nav.scope === 'welfare'
          ? '$300 Association + Welfare invoices. Mark paid when the bank deposit lands.'
          : '$50 Association invoices and event fees. Mark paid when the bank deposit lands.';
    }

    history.replaceState(null, '', `#${nav.navId}`);
    if (nav.panel !== 'ithelp') stopItHelpPoll();
    if (nav.panel !== 'inbox') stopInboxPoll();
    if (nav.panel === 'enquiries') renderEnquiries();
    if (nav.panel === 'ithelp') renderItHelp();
    if (nav.panel === 'inbox') renderInbox();
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
    if (options.profileId) params.set('profile_id', options.profileId);
    if (options.id) params.set('id', options.id);
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

  function initialsFromName(value) {
    const parts = String(value || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return 'TN';
    return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase();
  }

  function currentAdminEmail() {
    return String(state.adminEmail || state.user?.email || '')
      .toLowerCase()
      .trim();
  }

  function isCommitteeThread(thread) {
    return String(thread?.thread_kind || '') === 'committee';
  }

  function isAdminDmThread(thread) {
    return String(thread?.thread_kind || '') === 'admin_dm';
  }

  function isPrivateAdminChat(thread) {
    return isCommitteeThread(thread) || isAdminDmThread(thread);
  }

  function enterAdminPortal(label, email) {
    state.isAdmin = true;
    if (email) state.adminEmail = String(email).toLowerCase().trim();
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

      const inboxUnread = Number(data.welfareInboxUnread) || 0;
      const inboxBanner = document.getElementById('admin-overview-inbox');
      const inboxCount = document.getElementById('admin-inbox-count');
      if (inboxCount) inboxCount.textContent = String(inboxUnread);
      if (inboxBanner) inboxBanner.hidden = inboxUnread < 1;

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

  function stopInboxPoll() {
    if (state.inboxPoll) {
      clearInterval(state.inboxPoll);
      state.inboxPoll = null;
    }
  }

  function startInboxPoll() {
    stopInboxPoll();
    state.inboxPoll = setInterval(() => {
      const active = document.querySelector('[data-admin-panel="inbox"].is-active');
      if (!active || !state.isAdmin) {
        stopInboxPoll();
        return;
      }
      loadInbox({ silent: true }).catch(() => {});
    }, 8000);
  }

  async function loadInbox(options = {}) {
    const status = options.status || state.inboxFilter || 'open';
    state.inboxFilter = status;
    const data = await adminApi('welfare-inbox-threads', { status });
    state.inboxThreads = data.rows || [];
    state.inboxWarning = data.warning || '';
    await fillInboxMemberSelect();
    if (
      state.inboxSelectedId &&
      !state.inboxThreads.some((row) => row.id === state.inboxSelectedId)
    ) {
      state.inboxSelectedId = state.inboxThreads[0]?.id || '';
      state.inboxThread = null;
      state.inboxMessages = [];
    }
    if (!state.inboxSelectedId && state.inboxThreads.length) {
      const committee = state.inboxThreads.find((row) => isCommitteeThread(row));
      state.inboxSelectedId = committee?.id || state.inboxThreads[0].id;
    }
    if (state.inboxSelectedId) {
      await loadInboxMessages(state.inboxSelectedId);
    }
    renderInbox();
  }

  async function fillInboxMemberSelect() {
    const select = document.getElementById('inbox-new-member');
    if (!select) return;
    try {
      const data = await adminApi('inbox-directory');
      state.inboxDirectory = {
        welfare: data.welfare || [],
        admins: data.admins || []
      };
    } catch (_) {
      try {
        const data = await adminApi('members');
        state.inboxDirectory = {
          welfare: (data.rows || [])
            .filter((row) => row.welfare_member)
            .map((row) => ({
              id: row.id,
              full_name: row.full_name || 'Member',
              email: row.email || '',
              signed_in: true
            })),
          admins: []
        };
      } catch (__) {
        /* keep last directory */
      }
    }
    renderInboxPeopleSelect();
  }

  function renderInboxPeopleSelect() {
    const select = document.getElementById('inbox-new-member');
    if (!select) return;
    const current = select.value;
    const q = String(state.inboxPeopleQuery || '')
      .toLowerCase()
      .trim();
    const matches = (name, email) => {
      if (!q) return true;
      return `${name || ''} ${email || ''}`.toLowerCase().includes(q);
    };
    const me = currentAdminEmail();
    const welfare = (state.inboxDirectory.welfare || []).filter((row) =>
      matches(row.full_name, row.email)
    );
    const admins = (state.inboxDirectory.admins || []).filter((row) =>
      matches(row.full_name, row.email)
    );
    const welfareOpts = welfare
      .map((row) => {
        const label = `${row.full_name || 'Member'}${row.email ? ` (${row.email})` : ''}${
          row.signed_in ? '' : ' — not signed in'
        }`;
        if (!row.id || !row.signed_in) {
          return `<option value="" disabled>${escapeHtml(label)}</option>`;
        }
        return `<option value="member:${escapeHtml(row.id)}">${escapeHtml(label)}</option>`;
      })
      .join('');
    const adminOpts = admins
      .map((row) => {
        const mine = String(row.email || '').toLowerCase() === me;
        const label = `${row.full_name || 'Committee'}${row.email ? ` (${row.email})` : ''}${
          mine ? ' — you' : ''
        }`;
        if (mine) return `<option value="" disabled>${escapeHtml(label)}</option>`;
        return `<option value="admin:${escapeHtml(row.email)}">${escapeHtml(label)}</option>`;
      })
      .join('');
    select.innerHTML =
      `<option value="">Choose a welfare member or committee admin…</option>` +
      `<optgroup label="Social Welfare members (${welfare.length})">${
        welfareOpts || '<option value="" disabled>No welfare members match</option>'
      }</optgroup>` +
      `<optgroup label="Committee admins (${admins.length})">${
        adminOpts || '<option value="" disabled>No committee admins match</option>'
      }</optgroup>`;
    if (current && [...select.options].some((opt) => opt.value === current && !opt.disabled)) {
      select.value = current;
    }
  }

  async function loadInboxMessages(threadId) {
    const data = await adminApi('welfare-inbox-messages', { threadId });
    state.inboxThread = data.thread || null;
    state.inboxMessages = data.messages || [];
  }

  function renderInbox() {
    const list = document.getElementById('inbox-threads');
    const head = document.getElementById('inbox-head');
    const messagesEl = document.getElementById('inbox-messages');
    const form = document.getElementById('inbox-reply-form');
    const toggle = document.getElementById('inbox-toggle-status');
    const replyBox = document.getElementById('inbox-reply-body');
    if (!list) return;

    if (!state.inboxThreads.length) {
      list.innerHTML = `<p class="admin-muted">${escapeHtml(state.inboxWarning || 'No conversations in this filter.')}</p>`;
    } else {
      list.innerHTML = state.inboxThreads
        .map((row) => {
          const active = row.id === state.inboxSelectedId ? ' is-active' : '';
          const committee = isCommitteeThread(row);
          const adminDm = isAdminDmThread(row);
          const unread = row.unread_for_admin
            ? '<span class="admin-chip admin-chip--new">unread</span>'
            : '';
          const title = committee
            ? 'Committee room'
            : adminDm
              ? row.peer_name || row.member_name || row.peer_email || 'Committee admin'
              : row.member_name || row.member_email || 'Unknown';
          const sub = committee
            ? 'Private — committee only'
            : adminDm
              ? `${row.peer_email || ''} · Committee admin`
              : `${row.member_email || ''} · ${formatDate(row.last_message_at || row.created_at)}`;
          const face = committee ? '◎' : escapeHtml(initialsFromName(title));
          const kindClass = committee || adminDm ? ' admin-chat__thread--committee' : '';
          return `<button type="button" class="admin-chat__thread${kindClass}${active}" data-inbox-id="${escapeHtml(row.id)}">
            <span class="admin-chat__face" aria-hidden="true">${face}</span>
            <span class="admin-chat__thread-copy">
              <span class="admin-chat__chips">
                <span class="admin-chip admin-chip--${escapeHtml(row.status || 'open')}">${
                  committee ? 'committee' : adminDm ? 'admin' : escapeHtml(row.status || 'open')
                }</span>
                ${unread}
              </span>
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(sub)}</span>
            </span>
          </button>`;
        })
        .join('');
      list.querySelectorAll('[data-inbox-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          state.inboxSelectedId = btn.dataset.inboxId;
          try {
            await loadInboxMessages(state.inboxSelectedId);
            renderInbox();
          } catch (err) {
            alert(err.message || 'Could not load conversation.');
          }
        });
      });
    }

    const thread = state.inboxThread;
    if (!thread) {
      if (head) {
        head.innerHTML = `<span class="admin-chat__face" aria-hidden="true">♥</span>
          <div class="admin-chat__head-copy">
            <strong>Team inbox</strong>
            <span>Select a conversation, or open Committee room</span>
          </div>`;
      }
      if (messagesEl) {
        messagesEl.innerHTML = `<div class="admin-chat__empty">
          <strong>No chat selected</strong>
          Open Committee room to talk with other admins, or pick a member thread.
        </div>`;
      }
      if (form) form.hidden = true;
      return;
    }

    const committee = isCommitteeThread(thread);
    const adminDm = isAdminDmThread(thread);
    if (head) {
      const title = committee
        ? 'Committee room'
        : adminDm
          ? thread.peer_name || thread.member_name || thread.peer_email || 'Committee admin'
          : thread.member_name || thread.member_email || 'Unknown';
      const sub = committee
        ? 'Private committee chat — members cannot see this'
        : adminDm
          ? `${thread.peer_email || ''} · private admin chat`
          : thread.member_email || '';
      head.innerHTML = `<span class="admin-chat__face" aria-hidden="true">${committee ? '◎' : escapeHtml(initialsFromName(title))}</span>
        <div class="admin-chat__head-copy">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(sub)}</span>
        </div>
        <span class="admin-chat__live">${committee ? 'Committee' : adminDm ? 'Admin' : escapeHtml(thread.status || 'open')}</span>`;
    }

    if (messagesEl) {
      const atBottom =
        messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 64;
      if (!state.inboxMessages.length) {
        messagesEl.innerHTML = `<div class="admin-chat__empty">
          <strong>${committee ? 'Start the committee chat' : adminDm ? 'Start this admin chat' : 'No messages yet'}</strong>
          ${
            committee
              ? 'Write something the rest of the committee can see.'
              : adminDm
                ? 'This message is only between you and this committee admin.'
                : 'Send the first reply below.'
          }
        </div>`;
      } else {
        const me = currentAdminEmail();
        messagesEl.innerHTML = state.inboxMessages
          .map((m) => {
            const senderEmail = String(m.sender_email || '').toLowerCase().trim();
            const mine = isPrivateAdminChat(thread)
              ? Boolean(me && senderEmail && senderEmail === me)
              : m.sender === 'committee';
            const side = mine ? 'you' : 'them';
            const label = isPrivateAdminChat(thread)
              ? mine
                ? 'You'
                : m.sender_name || m.sender_email || 'Committee'
              : m.sender === 'committee'
                ? m.sender_name || 'Committee'
                : thread.member_name || 'Member';
            const face = escapeHtml(initialsFromName(label === 'You' ? (m.sender_name || 'You') : label));
            return `<div class="admin-chat__row admin-chat__row--${side}">
              <span class="admin-chat__face" aria-hidden="true">${face}</span>
              <div class="admin-chat__bubble">
                <strong>${escapeHtml(label)}</strong>
                <div>${escapeHtml(m.body)}</div>
                <time>${escapeHtml(formatDate(m.created_at))}</time>
              </div>
            </div>`;
          })
          .join('');
        if (atBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    if (form) form.hidden = false;
    if (replyBox) {
      replyBox.placeholder = committee
        ? 'Message the committee…'
        : adminDm
          ? 'Message this committee admin…'
          : 'Reply to this member…';
    }
    if (toggle) {
      toggle.hidden = committee;
      toggle.textContent = thread.status === 'closed' ? 'Reopen conversation' : 'Close conversation';
    }
  }

  async function loadMembers() {
    const data = await adminApi('members');
    const rows = data.rows || [];
    const body = document.getElementById('admin-members-body');
    if (!body) return;
    const scope = state.listScope;
    const filtered =
      scope === 'welfare'
        ? rows.filter((row) => row.welfare_member)
        : scope === 'association'
          ? rows.filter((row) => !row.welfare_member)
          : rows;
    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="6" class="admin-empty">${
        scope === 'welfare'
          ? 'No signed-in Social Welfare members yet.'
          : scope === 'association'
            ? 'No signed-in Association-only members yet.'
            : 'No profiles yet.'
      }</td></tr>`;
      return;
    }
    body.innerHTML = filtered
      .map((row) => {
        const plan = row.plan || 'basic';
        const chipClass = plan === 'both' ? 'both' : plan === 'welfare' ? 'welfare' : '';
        const showApprove = scope !== 'welfare' && !row.welfare_member;
        const showRevoke = scope === 'welfare' && row.welfare_member;
        return `<tr>
          <td>${escapeHtml(row.full_name || '—')}<div class="admin-detail">${escapeHtml(row.email || '')}</div></td>
          <td><span class="admin-chip admin-chip--${chipClass}">${escapeHtml(plan)}</span></td>
          <td>${row.association_member ? 'Yes' : 'No'}</td>
          <td>
            ${row.welfare_member ? 'Yes' : 'No'}
            ${showApprove ? `<div class="admin-actions" style="margin-top:0.35rem"><button type="button" data-approve-welfare="${escapeHtml(row.id)}">Approve welfare</button></div>` : ''}
            ${showRevoke ? `<div class="admin-actions" style="margin-top:0.35rem"><button type="button" data-revoke-welfare="${escapeHtml(row.id)}">Revoke welfare</button></div>` : ''}
          </td>
          <td class="admin-detail">${escapeHtml(formatDate(row.created_at))}</td>
          <td><div class="admin-actions"><button type="button" data-open-crm="${escapeHtml(row.id)}">CRM record</button></div></td>
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
    body.querySelectorAll('[data-revoke-welfare]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (
          !confirm(
            'Revoke Social Welfare access for this signed-in member? They will keep their login, but the Welfare tab will lock until you approve them again.'
          )
        ) {
          return;
        }
        try {
          await adminApi('revoke-welfare', {
            method: 'PATCH',
            body: { id: btn.dataset.revokeWelfare }
          });
          await loadMembers();
        } catch (err) {
          alert(err.message || 'Could not revoke welfare.');
        }
      });
    });
    body.querySelectorAll('[data-open-crm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.crmProfileId = btn.dataset.openCrm;
        state.crmTab = 'records';
        jumpToPanel('crm');
      });
    });
  }

  async function loadImports() {
    const filterSelect = document.getElementById('imports-filter');
    if (filterSelect) {
      const scope = state.listScope;
      Array.from(filterSelect.options).forEach((opt) => {
        const value = opt.value;
        if (scope === 'welfare') {
          opt.hidden = !['welfare', 'welfare_any', 'both', 'pending'].includes(value);
        } else if (scope === 'association') {
          opt.hidden = !['association', 'association_any', 'both', 'pending'].includes(value);
        } else {
          opt.hidden = false;
        }
      });
      if (![...filterSelect.options].some((opt) => opt.value === state.importFilter && !opt.hidden)) {
        state.importFilter = scope === 'welfare' ? 'welfare_any' : scope === 'association' ? 'association_any' : 'all';
      }
      filterSelect.value = state.importFilter;
    }
    const data = await adminApi('imports', { filter: state.importFilter || 'all' });
    const stats = data.stats;
    let statsHtml = '';
    if (stats) {
      const cards = [
        { key: 'all', value: stats.total, label: 'Total imported', groups: [''] },
        { key: 'both', value: stats.association_and_welfare, label: 'Association + Welfare', groups: ['', 'welfare'] },
        { key: 'association_any', value: stats.association_member_total, label: 'All Association (general)', groups: ['', 'association'] },
        { key: 'association', value: stats.association_only, label: 'Association only', groups: ['', 'association'] },
        { key: 'welfare', value: stats.welfare_only, label: 'Welfare only', groups: ['', 'welfare'] },
        { key: 'pending', value: stats.pending_invite, label: 'Pending invite', groups: ['', 'welfare', 'association'] }
      ].filter((c) => c.groups.includes(state.listScope || ''));
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
        association_any: 'All Association (general)',
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
      body.innerHTML = `<tr><td colspan="6" class="admin-empty">No members match this filter.</td></tr>`;
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
        const deleteId = escapeHtml(row.id || '');
        const deleteName = escapeHtml(row.full_name || row.email || 'this member');
        return `<tr>
          <td>${escapeHtml(row.member_number || '—')}</td>
          <td>
            ${escapeHtml(row.full_name || '—')}
            <div class="admin-detail">${escapeHtml(row.email || '')}</div>
            <div class="admin-actions" style="margin-top:0.45rem;">
              <button type="button" class="btn btn--sm btn--ghost" data-import-admin-email="${escapeHtml(row.email || '')}" data-import-admin-name="${escapeHtml(row.full_name || '')}">Make admin</button>
              <button type="button" class="admin-btn-danger" data-import-delete="${deleteId}" data-import-name="${deleteName}">Delete member</button>
            </div>
          </td>
          <td><span class="admin-chip admin-chip--${chip}">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(row.status || '—')}</td>
          <td>${row.association_member ? 'Yes' : '—'}</td>
          <td>${row.welfare_member ? 'Yes' : '—'}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-import-admin-email]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const email = String(btn.getAttribute('data-import-admin-email') || '').trim();
        const fullName = String(btn.getAttribute('data-import-admin-name') || '').trim() || email;
        if (!email) {
          alert('This member has no email, so they cannot be added as admin.');
          return;
        }
        if (
          !confirm(
            `Add ${fullName} (${email}) as a committee admin?\n\nThey will get an email from members@taunetnelel.org to create their own password, then sign in at Members → Admin.`
          )
        ) {
          return;
        }
        setButtonBusy(btn, true, { busy: 'Adding…' });
        try {
          const data = await inviteSiteAdmin({ fullName, email, refreshList: false });
          setButtonBusy(btn, false, { done: 'Admin added', stay: true });
          alert(data.message || `Invitation sent to ${email}.`);
        } catch (err) {
          setButtonBusy(btn, false, { fail: 'Not added' });
          alert(err.message || 'Could not add this member as admin.');
        }
      });
    });

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
            `Remove ${name} from this list and turn off their matching website access?\n\nTheir login stays, but Welfare/Association flags on that email are revoked so they cannot keep using the portal.`
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
        if (!id || !Number.isFinite(amount) || amount < 0) return;
        tickets.push({
          id,
          label:
            id === 'member'
              ? 'Member (80%)'
              : id === 'non_member'
                ? 'Non-member (100%)'
                : id === 'child_7_17'
                  ? 'Child 7–17 (45%)'
                  : id === 'child_0_6'
                    ? 'Child 0–6 (free)'
                    : id === 'couple'
                      ? 'Two people'
                      : id === 'single'
                        ? 'Single'
                        : id,
          amount_cents: amount
        });
      });
      if (tickets.length) return tickets;
    } catch (_) {
      /* ignore */
    }
    if (Number(row?.fee_cents) > 0) {
      const base = Math.round(Number(row.fee_cents));
      return [
        { id: 'member', label: 'Member (80%)', amount_cents: Math.round(base * 0.8) },
        { id: 'non_member', label: 'Non-member (100%)', amount_cents: base },
        { id: 'child_7_17', label: 'Child 7–17 (45%)', amount_cents: Math.round(base * 0.45) },
        { id: 'child_0_6', label: 'Child 0–6 (free)', amount_cents: 0 }
      ];
    }
    return [];
  }

  function baseAudFromAdminRow(row) {
    const tickets = ticketsFromAdminRow(row);
    const nonMember = tickets.find((t) => t.id === 'non_member');
    if (nonMember?.amount_cents != null) return (Number(nonMember.amount_cents) / 100).toFixed(2);
    const single = tickets.find((t) => t.id === 'single');
    if (single?.amount_cents != null) return (Number(single.amount_cents) / 100).toFixed(2);
    if (Number(row?.fee_cents) > 0) return (Number(row.fee_cents) / 100).toFixed(2);
    return '';
  }

  function buildTieredTicketsClient(baseAud) {
    const baseCents = Math.round(Number(baseAud) * 100);
    if (!Number.isFinite(baseCents) || baseCents < 0) return [];
    return [
      { id: 'member', label: 'Member (80%)', amount_cents: Math.round(baseCents * 0.8), pct: 80 },
      { id: 'non_member', label: 'Non-member (100%)', amount_cents: baseCents, pct: 100 },
      { id: 'child_7_17', label: 'Child 7–17 (45%)', amount_cents: Math.round(baseCents * 0.45), pct: 45 },
      { id: 'child_0_6', label: 'Child 0–6 (free)', amount_cents: 0, pct: 0 }
    ];
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
                <label>Full $
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    style="width:5.2rem"
                    value="${baseAudFromAdminRow(row)}"
                    data-event-fee-base="${escapeHtml(row.id)}"
                    aria-label="Full non-member price AUD"
                    placeholder="100"
                  >
                </label>
              </div>
              <div class="admin-detail" style="margin-bottom:0.35rem">
                Member 80% · Non-member 100% · Child 7–17 45% · 0–6 free
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
        const baseInput = body.querySelector(`[data-event-fee-base="${esc}"]`);
        const payidInput = body.querySelector(`[data-event-payid="${esc}"]`);
        const statusEl = body.querySelector(`[data-event-price-status="${esc}"]`);
        const baseRaw = String(baseInput?.value || '').trim();
        if (baseRaw !== '' && (!Number.isFinite(Number(baseRaw)) || Number(baseRaw) < 0)) {
          alert('Enter a valid full (non-member) price in AUD (e.g. 100).');
          return;
        }

        const ticket_prices = baseRaw === '' ? [] : buildTieredTicketsClient(baseRaw);

        btn.disabled = true;
        if (statusEl) statusEl.textContent = 'Saving…';
        try {
          const result = await adminApi('event-update', {
            method: 'PATCH',
            body: {
              id,
              ticket_prices: ticket_prices.length ? ticket_prices : null,
              fee_base_aud: baseRaw === '' ? '' : Number(baseRaw),
              fee_cents: ticket_prices.length
                ? ticket_prices.find((t) => t.id === 'non_member')?.amount_cents ||
                  ticket_prices[0].amount_cents
                : null,
              enable_payid_booking: Boolean(payidInput?.checked)
            }
          });
          if (statusEl) {
            statusEl.textContent = result?.warning
              ? `Saved. ${result.warning}`
              : 'Prices saved (member / non-member / child tiers).';
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
    const baseRaw = String(fd.get('fee_base_aud') || '').trim();
    const payload = {
      title: String(fd.get('title') || '').trim(),
      location: String(fd.get('location') || '').trim(),
      start_at: startAt,
      end_at: endRaw ? fromDatetimeLocalValue(endRaw) : startAt,
      summary: String(fd.get('summary') || '').trim(),
      meta: String(fd.get('meta') || '').trim(),
      badge: String(fd.get('badge') || '').trim(),
      phase_override: String(fd.get('phase_override') || 'auto'),
      fee_base_aud: baseRaw === '' ? '' : Number(baseRaw),
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

  const INVITE_SENT_KEY = 'taunet_admin_invite_sent';

  function inviteSentMap() {
    try {
      return JSON.parse(localStorage.getItem(INVITE_SENT_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function wasInviteSent(email) {
    return Boolean(inviteSentMap()[String(email || '').toLowerCase().trim()]);
  }

  function markInviteSent(email) {
    const key = String(email || '').toLowerCase().trim();
    if (!key) return;
    const map = inviteSentMap();
    map[key] = Date.now();
    try {
      localStorage.setItem(INVITE_SENT_KEY, JSON.stringify(map));
    } catch (_) { /* ignore quota */ }
  }

  async function loadSiteAdmins() {
    const body = document.getElementById('admin-admins-body');
    if (!body) return;
    try {
      const data = await adminApi('site-admins');
      const rows = data.rows || [];
      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="4" class="admin-empty">No committee admins on the list yet.</td></tr>`;
        return;
      }
      body.innerHTML = rows
        .map((row) => {
          const email = escapeHtml(row.email || '');
          const name = escapeHtml(row.full_name || '—');
          const sent = Boolean(row.invited_at) || wasInviteSent(row.email);
          const self = row.is_self
            ? '<span class="admin-muted">You</span>'
            : `<button type="button" class="btn btn--sm btn--ghost" data-admin-remove="${escapeHtml(row.email || '')}">Remove</button>`;
          return `<tr>
            <td>${name}</td>
            <td>${email}</td>
            <td>${escapeHtml(formatDate(row.created_at))}</td>
            <td class="admin-row-actions">
              <button type="button" class="btn btn--sm ${sent ? 'is-done' : 'btn--ghost'}" data-admin-resend="${escapeHtml(row.email || '')}" data-admin-resend-name="${escapeHtml(row.full_name || '')}" title="${sent ? 'Click to send the invite again' : 'Send invitation email'}">${sent ? 'Sent' : 'Resend invite'}</button>
              ${self}
            </td>
          </tr>`;
        })
        .join('');
    } catch (err) {
      body.innerHTML = `<tr><td colspan="4" class="admin-empty">${escapeHtml(err.message || 'Could not load committee admins.')}</td></tr>`;
    }
  }

  function setButtonBusy(btn, busy, opts) {
    if (window.TaunetUi?.setButtonBusy) {
      window.TaunetUi.setButtonBusy(btn, busy, opts);
      return;
    }
    if (!btn) return;
    btn.disabled = Boolean(busy);
  }

  function setInviteStatus(message, isError) {
    const status = document.getElementById('admin-invite-status');
    if (!status) return;
    status.hidden = !message;
    status.classList.toggle('is-error', Boolean(isError));
    status.textContent = message || '';
    if (message) status.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function inviteSiteAdmin({ fullName, email, refreshList }) {
    const data = await adminApi('invite-admin', {
      method: 'POST',
      body: { full_name: fullName, email }
    });
    markInviteSent(email);
    if (refreshList !== false) await loadSiteAdmins();
    return data;
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
    const submit = form.querySelector('button[type="submit"]');
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Publishing…';
    }
    setButtonBusy(submit, true, { busy: 'Publishing…' });
    try {
      await adminApi('announcement-create', {
        method: 'POST',
        body: { title, body: bodyText, audience, is_published: true }
      });
      form.reset();
      setButtonBusy(submit, false, { done: 'Published' });
      if (status) status.textContent = 'Announcement published.';
      await loadAnnouncementsAdmin();
    } catch (err) {
      setButtonBusy(submit, false, { fail: 'Not published' });
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
    let rows = data.rows || [];
    if (state.listScope === 'welfare') {
      rows = rows.filter((row) => row.kind === 'welfare');
    } else if (state.listScope === 'association') {
      rows = rows.filter((row) => row.kind === 'association' || row.kind === 'event' || row.kind === 'donation');
    }
    if (data.warning && !rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">${escapeHtml(data.warning)}</td></tr>`;
      return;
    }
    if (!rows.length) {
      const scopeLabel =
        state.listScope === 'welfare'
          ? 'welfare'
          : state.listScope === 'association'
            ? 'association / event'
            : statusFilter;
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">No invoices for “${escapeHtml(scopeLabel)}”. Check Supabase → invoices, or choose All invoices.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((row) => {
        const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
        const proofUrl = String(meta.proof_url || '').trim();
        const proofNote = proofUrl
          ? `<div class="admin-detail"><a href="${escapeHtml(proofUrl)}" target="_blank" rel="noopener">View payment screenshot</a></div>`
          : meta.proof_uploaded_at
            ? '<div class="admin-detail">Screenshot on file</div>'
            : '';
        const amount = `$${(Number(row.amount_cents || 0) / 100).toFixed(2)}`;
        const status = String(row.status || 'pending');
        const actions =
          status === 'pending'
            ? `<button type="button" data-invoice-status="${escapeHtml(row.id)}" data-kind="${escapeHtml(row.kind || '')}" data-next="paid">Mark paid</button>
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
            ${proofNote}
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
          <td class="admin-detail">${escapeHtml(formatDateOnly(row.due_at))}</td>
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
                alert(
                  btn.dataset.kind === 'event'
                    ? 'Marked paid. Confirmation, receipt, and ticket emailed to the buyer — in that order.'
                    : 'Marked paid. Paid invoice PDF emailed to the member.'
                );
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

  function claimTypeLabel(type) {
    const labels = {
      bereavement: 'Bereavement',
      hardship: 'Hardship',
      family_emergency: 'Family emergency',
      other: 'Other'
    };
    return labels[type] || type || '—';
  }

  async function loadClaims() {
    const body = document.getElementById('admin-claims-body');
    if (!body) return;
    const statusFilter = document.getElementById('admin-claim-filter')?.value || 'open';
    body.innerHTML = `<tr><td colspan="7" class="admin-empty">Loading…</td></tr>`;
    const data = await adminApi('welfare-claims', { status: statusFilter });
    const rows = data.rows || [];
    if (data.warning && !rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">${escapeHtml(data.warning)}</td></tr>`;
      return;
    }
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7" class="admin-empty">No claims for “${escapeHtml(statusFilter)}”.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((row) => {
        const amount = row.amount_cents == null ? '—' : `$${(Number(row.amount_cents) / 100).toFixed(2)}`;
        const status = String(row.status || 'submitted');
        const actions = [];
        if (status === 'submitted') {
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="in_review">In review</button>`);
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="approved">Approve</button>`);
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="declined">Decline</button>`);
        } else if (status === 'in_review') {
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="approved">Approve</button>`);
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="declined">Decline</button>`);
        } else if (status === 'approved') {
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="paid">Mark paid</button>`);
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="declined">Decline</button>`);
        } else if (status === 'declined') {
          actions.push(`<button type="button" data-claim-status="${escapeHtml(row.id)}" data-next="in_review">Reopen</button>`);
        }
        const details = String(row.details || '').slice(0, 180);
        const files = Array.isArray(row.files) ? row.files : [];
        const fileButtons = files
          .map(
            (file) =>
              `<button type="button" class="btn btn--sm btn--ghost" data-claim-file="${escapeHtml(file.id)}">${escapeHtml(file.file_name || 'Attachment')}</button>`
          )
          .join('');
        return `<tr>
          <td class="admin-detail">${escapeHtml(formatDate(row.created_at))}</td>
          <td>
            ${escapeHtml(row.member_name || '—')}
            <div class="admin-detail">${escapeHtml(row.member_email || '')}${row.member_number ? ' · #' + escapeHtml(row.member_number) : ''}</div>
            <div class="admin-detail">${escapeHtml(row.public_ref || '')}</div>
          </td>
          <td>${escapeHtml(claimTypeLabel(row.claim_type))}</td>
          <td>${escapeHtml(amount)}</td>
          <td><span class="admin-chip admin-chip--${status === 'approved' || status === 'paid' ? 'reviewed' : status === 'declined' ? '' : 'new'}">${escapeHtml(status.replace('_', ' '))}</span></td>
          <td class="admin-detail">${escapeHtml(details)}${fileButtons ? `<div class="admin-actions" style="margin-top:0.4rem;">${fileButtons}</div>` : ''}${row.admin_notes ? `<div><em>Note: ${escapeHtml(row.admin_notes)}</em></div>` : ''}</td>
          <td><div class="admin-actions">${actions.join('')}</div></td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-claim-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = btn.dataset.next;
        const payload = { id: btn.dataset.claimStatus, status: next };
        if (next === 'approved' || next === 'paid') {
          const dollars = window.prompt('Approved amount in AUD (e.g. 2500). Leave blank to keep the member amount.');
          if (dollars === null) return;
          if (String(dollars).trim()) payload.amount = Number(dollars);
        }
        if (next === 'declined') {
          const note = window.prompt('Optional note for the member (why declined):', '');
          if (note === null) return;
          payload.admin_notes = note;
        }
        const confirmLabel =
          next === 'approved'
            ? 'Approve this claim? An anonymised alert will appear on the Welfare tab.'
            : next === 'paid'
              ? 'Mark this reimbursement as paid?'
              : next === 'declined'
                ? 'Decline this claim?'
                : 'Update this claim?';
        if (!confirm(confirmLabel)) return;
        try {
          await adminApi('welfare-claim-update', { method: 'PATCH', body: payload });
          await loadClaims();
        } catch (err) {
          alert(err.message || 'Could not update claim.');
        }
      });
    });

    body.querySelectorAll('[data-claim-file]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const data = await adminApi('welfare-claim-file', { id: btn.dataset.claimFile });
          if (data.url) window.open(data.url, '_blank', 'noopener');
        } catch (err) {
          alert(err.message || 'Could not open the attachment.');
        }
      });
    });
  }

  function setCrmTab(tab) {
    state.crmTab = tab === 'fields' ? 'fields' : 'records';
    document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.crmTab === state.crmTab);
    });
    const records = document.getElementById('crm-records-view');
    const fields = document.getElementById('crm-fields-view');
    if (records) records.hidden = state.crmTab !== 'records';
    if (fields) fields.hidden = state.crmTab !== 'fields';
  }

  function fillCrmMemberSelect(rows, query) {
    const select = document.getElementById('crm-member-select');
    if (!select) return;
    const q = String(query || '').trim().toLowerCase();
    const current = state.crmProfileId;
    const filtered = (rows || []).filter((row) => {
      const hay = `${row.full_name || ''} ${row.email || ''}`.toLowerCase();
      if (q) return hay.includes(q);
      return row.welfare_member || row.id === current;
    });
    select.innerHTML =
      `<option value="">Select a member…</option>` +
      filtered
        .map((row) => {
          const selected = row.id === current ? ' selected' : '';
          return `<option value="${escapeHtml(row.id)}"${selected}>${escapeHtml(row.full_name || row.email || 'Member')} — ${escapeHtml(row.email || '')}</option>`;
        })
        .join('');
    if (current && !filtered.some((row) => row.id === current)) {
      select.value = '';
    }
  }

  async function loadCrmRecord(profileId) {
    const host = document.getElementById('crm-record-host');
    if (!host) return;
    if (!profileId) {
      host.innerHTML = '<p class="admin-muted">Select a signed-in member to view or edit their CRM record.</p>';
      return;
    }
    host.innerHTML = '<p class="admin-muted">Loading record…</p>';
    const data = await adminApi('crm-record', { profileId });
    const profile = data.profile || {};
    const fields = data.fields || [];
    const values = data.values || {};
    const renderer = window.taunetCrmFields;
    const formHtml = renderer
      ? renderer.renderForm(fields, values, { namePrefix: 'crm', admin: true })
      : '<p class="admin-muted">CRM form script missing.</p>';
    const plan = profile.plan || 'basic';
    host.innerHTML = `
      <div class="crm-record-head">
        <div>
          <h2>${escapeHtml(profile.full_name || 'Member')}</h2>
          <p class="admin-muted" style="margin:0">${escapeHtml(profile.email || '')} · ${escapeHtml(plan)}${profile.member_number ? ' · #' + escapeHtml(profile.member_number) : ''}</p>
        </div>
        <span class="admin-chip">${profile.welfare_member ? 'Welfare' : 'Association'}</span>
      </div>
      <form class="site-form" id="crm-record-form">${formHtml}
        <div class="site-form__actions">
          <button type="submit" class="btn btn--primary">Save CRM record</button>
          <p class="site-form__note">Sensitive fields stay in Admin only.</p>
        </div>
        <p class="inquiry-form__message" id="crm-record-message" hidden></p>
      </form>`;

    const form = document.getElementById('crm-record-form');
    renderer?.enhanceForm?.(form);
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('crm-record-message');
      const submit = form.querySelector('[type="submit"]');
      setButtonBusy(submit, true, { busy: 'Saving…' });
      try {
        const nextValues = renderer.readFormValues(form, fields, 'crm');
        await adminApi('crm-record-save', {
          method: 'POST',
          body: { profile_id: profileId, values: nextValues }
        });
        setButtonBusy(submit, false, { done: 'Saved' });
        if (message) {
          message.hidden = false;
          message.classList.remove('is-error');
          message.textContent = 'CRM record saved.';
        }
      } catch (err) {
        setButtonBusy(submit, false, { fail: 'Not saved' });
        if (message) {
          message.hidden = false;
          message.classList.add('is-error');
          message.textContent = err.message || 'Could not save CRM record. Run APPLY-CRM-CUSTOM-FIELDS.sql in Supabase.';
        }
      }
    });
  }

  function renderCrmFieldsTable(rows) {
    const body = document.getElementById('crm-fields-body');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="admin-empty">No custom fields yet. Add one above, or run APPLY-CRM-CUSTOM-FIELDS.sql.</td></tr>`;
      return;
    }
    const labels = window.taunetCrmFields?.GROUP_LABELS || {};
    body.innerHTML = rows
      .map((row) => {
        const vis = row.visibility === 'admin' ? 'Admin only' : 'Member + Admin';
        const sensitive = row.is_sensitive ? ' · sensitive' : '';
        return `<tr>
          <td><strong>${escapeHtml(row.label)}</strong><div class="admin-detail">${escapeHtml(row.field_key)}</div></td>
          <td>${escapeHtml(labels[row.field_group] || row.field_group)}</td>
          <td>${escapeHtml(row.field_type)}</td>
          <td>${escapeHtml(vis)}${escapeHtml(sensitive)}</td>
          <td>${row.is_active ? 'Yes' : 'Hidden'}</td>
          <td>
            <div class="admin-actions">
              <button type="button" data-crm-edit="${escapeHtml(row.id)}">Edit</button>
              <button type="button" data-crm-toggle="${escapeHtml(row.id)}" data-active="${row.is_active ? '1' : '0'}">${row.is_active ? 'Hide' : 'Show'}</button>
              ${row.is_system ? '' : `<button type="button" data-crm-delete="${escapeHtml(row.id)}">Delete</button>`}
            </div>
          </td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-crm-edit]').forEach((btn) => {
      btn.addEventListener('click', () => startCrmFieldEdit(btn.dataset.crmEdit));
    });
    body.querySelectorAll('[data-crm-toggle]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await adminApi('crm-field-update', {
            method: 'PATCH',
            body: { id: btn.dataset.crmToggle, is_active: btn.dataset.active !== '1' }
          });
          await loadCrm({ keepRecord: true });
        } catch (err) {
          alert(err.message || 'Could not update field.');
        }
      });
    });
    body.querySelectorAll('[data-crm-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this custom field and its saved values?')) return;
        try {
          await adminApi('crm-field-delete', { method: 'DELETE', body: { id: btn.dataset.crmDelete } });
          await loadCrm({ keepRecord: true });
        } catch (err) {
          alert(err.message || 'Could not delete field.');
        }
      });
    });
  }

  function resetCrmFieldForm() {
    const form = document.getElementById('crm-field-form');
    if (!form) return;
    form.reset();
    document.getElementById('crm-field-id').value = '';
    document.getElementById('crm-field-editable').checked = true;
    document.getElementById('crm-field-submit').textContent = 'Add field';
    document.getElementById('crm-field-cancel').hidden = true;
  }

  function startCrmFieldEdit(id) {
    const field = (state.crmFields || []).find((row) => row.id === id);
    if (!field) return;
    setCrmTab('fields');
    document.getElementById('crm-field-id').value = field.id;
    document.getElementById('crm-field-label').value = field.label || '';
    document.getElementById('crm-field-type').value = field.field_type || 'text';
    document.getElementById('crm-field-group').value = field.field_group || 'contact';
    document.getElementById('crm-field-visibility').value = field.visibility || 'member';
    const options = window.taunetCrmFields?.parseOptions(field) || [];
    document.getElementById('crm-field-options').value = options.join(', ');
    document.getElementById('crm-field-help').value = field.help_text || '';
    document.getElementById('crm-field-sensitive').checked = Boolean(field.is_sensitive);
    document.getElementById('crm-field-editable').checked = field.member_editable !== false && field.visibility !== 'admin';
    document.getElementById('crm-field-submit').textContent = 'Save field';
    document.getElementById('crm-field-cancel').hidden = false;
    document.getElementById('crm-field-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindCrmUi() {
    if (state.crmBound) return;
    state.crmBound = true;
    document.querySelectorAll('[data-crm-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setCrmTab(btn.dataset.crmTab));
    });
    document.getElementById('crm-member-search')?.addEventListener('input', (event) => {
      fillCrmMemberSelect(state.crmMembers, event.target.value);
    });
    document.getElementById('crm-member-select')?.addEventListener('change', async (event) => {
      state.crmProfileId = event.target.value || '';
      try {
        await loadCrmRecord(state.crmProfileId);
      } catch (err) {
        const host = document.getElementById('crm-record-host');
        if (host) {
          host.innerHTML = `<p class="admin-muted">${escapeHtml(err.message || 'Could not load CRM record. Run APPLY-CRM-CUSTOM-FIELDS.sql in Supabase.')}</p>`;
        }
      }
    });
    document.getElementById('crm-field-cancel')?.addEventListener('click', resetCrmFieldForm);
    document.getElementById('crm-field-sensitive')?.addEventListener('change', (event) => {
      if (event.target.checked) {
        document.getElementById('crm-field-visibility').value = 'admin';
        document.getElementById('crm-field-editable').checked = false;
      }
    });
    document.getElementById('crm-field-visibility')?.addEventListener('change', (event) => {
      if (event.target.value === 'admin') document.getElementById('crm-field-editable').checked = false;
    });
    document.getElementById('crm-field-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = document.getElementById('crm-field-id').value;
      const payload = {
        label: document.getElementById('crm-field-label').value,
        field_type: document.getElementById('crm-field-type').value,
        field_group: document.getElementById('crm-field-group').value,
        visibility: document.getElementById('crm-field-visibility').value,
        options: document.getElementById('crm-field-options').value,
        help_text: document.getElementById('crm-field-help').value,
        is_sensitive: document.getElementById('crm-field-sensitive').checked,
        member_editable: document.getElementById('crm-field-editable').checked
      };
      try {
        if (id) {
          payload.id = id;
          await adminApi('crm-field-update', { method: 'PATCH', body: payload });
        } else {
          await adminApi('crm-field-create', { method: 'POST', body: payload });
        }
        resetCrmFieldForm();
        await loadCrm({ keepRecord: true });
      } catch (err) {
        alert(err.message || 'Could not save field.');
      }
    });
  }

  async function loadCrm(options = {}) {
    bindCrmUi();
    setCrmTab(state.crmTab || 'records');
    const [members, fields] = await Promise.all([
      adminApi('members'),
      adminApi('crm-fields')
    ]);
    state.crmMembers = members.rows || [];
    state.crmFields = fields.rows || [];
    fillCrmMemberSelect(state.crmMembers, document.getElementById('crm-member-search')?.value || '');
    renderCrmFieldsTable(state.crmFields);
    if (!options.keepRecord) {
      await loadCrmRecord(state.crmProfileId);
    } else if (state.crmProfileId && state.crmTab === 'records') {
      await loadCrmRecord(state.crmProfileId);
    }
  }

  function setFollowupTab(tab) {
    const allowed = ['email', 'sms', 'pipeline', 'calendar', 'funnel'];
    state.followupTab = allowed.includes(tab) ? tab : 'email';
    document.querySelectorAll('[data-followup-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.followupTab === state.followupTab);
    });
    ['email', 'sms', 'pipeline', 'calendar', 'funnel'].forEach((id) => {
      const el = document.getElementById(`followup-${id}-view`);
      if (el) el.hidden = id !== state.followupTab;
    });
  }

  function renderCampaigns(rows) {
    const body = document.getElementById('crm-campaigns-body');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No campaigns sent yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (row) => `<tr>
          <td class="admin-detail">${escapeHtml(formatDate(row.sent_at || row.created_at))}</td>
          <td>${escapeHtml(row.channel)}</td>
          <td>${escapeHtml(row.audience)}</td>
          <td>${escapeHtml(row.subject || row.name || '—')}</td>
          <td>${escapeHtml(row.status)} · ${row.sent_count || 0} sent${row.failed_count ? ` · ${row.failed_count} failed` : ''}</td>
        </tr>`
      )
      .join('');
  }

  function fillPipelineSelects(data) {
    const pipeSelect = document.getElementById('crm-pipe-select');
    const stageSelect = document.getElementById('crm-pipe-stage');
    if (!pipeSelect || !stageSelect) return;
    const pipes = data.pipelines || [];
    if (!pipeSelect.dataset.filled) {
      pipeSelect.innerHTML = pipes
        .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
        .join('');
      pipeSelect.dataset.filled = '1';
    }
    const pipelineId = pipeSelect.value || pipes[0]?.id;
    const stages = (data.stages || []).filter((s) => s.pipeline_id === pipelineId);
    stageSelect.innerHTML = stages
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join('');
  }

  function renderPipelineBoard(data) {
    const host = document.getElementById('crm-pipeline-board');
    if (!host) return;
    const pipeSelect = document.getElementById('crm-pipe-select');
    const pipelineId = pipeSelect?.value || data.pipelines?.[0]?.id;
    const stages = (data.stages || []).filter((s) => s.pipeline_id === pipelineId);
    const cards = (data.cards || []).filter((c) => c.pipeline_id === pipelineId);
    if (!stages.length) {
      host.innerHTML = '<p class="admin-muted">Run APPLY-CRM-FOLLOWUP.sql to create the welfare pipeline.</p>';
      return;
    }
    host.innerHTML = stages
      .map((stage) => {
        const colCards = cards.filter((c) => c.stage_id === stage.id);
        return `<div class="crm-pipe-col">
          <h3>${escapeHtml(stage.name)} (${colCards.length})</h3>
          ${colCards
            .map(
              (card) => `<article class="crm-pipe-card">
                <strong>${escapeHtml(card.title)}</strong>
                ${card.notes ? `<p>${escapeHtml(card.notes)}</p>` : ''}
                <select data-move-card="${escapeHtml(card.id)}">
                  ${stages
                    .map(
                      (s) =>
                        `<option value="${escapeHtml(s.id)}"${s.id === card.stage_id ? ' selected' : ''}>${escapeHtml(s.name)}</option>`
                    )
                    .join('')}
                </select>
              </article>`
            )
            .join('')}
        </div>`;
      })
      .join('');
    host.querySelectorAll('[data-move-card]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          await adminApi('crm-pipeline-card', {
            method: 'PATCH',
            body: { id: select.dataset.moveCard, stage_id: select.value }
          });
          await loadFollowup({ keepTab: true });
        } catch (err) {
          alert(err.message || 'Could not move card.');
        }
      });
    });
  }

  function renderCalendar(rows) {
    const body = document.getElementById('crm-calendar-body');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No appointments yet.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map((row) => {
        const actions = ['requested', 'confirmed', 'cancelled', 'completed']
          .map(
            (st) =>
              `<button type="button" data-cal-status="${escapeHtml(row.id)}" data-status="${st}">${st}</button>`
          )
          .join('');
        return `<tr>
          <td class="admin-detail">${escapeHtml(formatDate(row.starts_at))}</td>
          <td>${escapeHtml(row.title)}${row.member_name ? `<div class="admin-detail">${escapeHtml(row.member_name)}</div>` : ''}</td>
          <td>${escapeHtml(row.event_type)}</td>
          <td>${escapeHtml(row.status)}</td>
          <td><div class="admin-actions">${actions}</div></td>
        </tr>`;
      })
      .join('');
    body.querySelectorAll('[data-cal-status]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await adminApi('crm-calendar-status', {
            method: 'PATCH',
            body: { id: btn.dataset.calStatus, status: btn.dataset.status }
          });
          await loadFollowup({ keepTab: true });
        } catch (err) {
          alert(err.message || 'Could not update appointment.');
        }
      });
    });
  }

  function renderFunnel(steps) {
    const host = document.getElementById('crm-funnel-stats');
    if (!host) return;
    host.innerHTML = (steps || [])
      .map(
        (step) => `<div class="admin-stat">
          <strong>${escapeHtml(step.count ?? 0)}</strong>
          <span>${escapeHtml(step.label)}</span>
        </div>`
      )
      .join('');
  }

  function bindFollowupUi() {
    if (state.followupBound) return;
    state.followupBound = true;
    document.querySelectorAll('[data-followup-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setFollowupTab(btn.dataset.followupTab));
    });
    document.getElementById('crm-pipe-select')?.addEventListener('change', () => {
      if (!state.pipelineData) return;
      fillPipelineSelects(state.pipelineData);
      renderPipelineBoard(state.pipelineData);
    });
    document.getElementById('crm-email-audience')?.addEventListener('change', () => {
      const wrap = document.getElementById('crm-email-to-wrap');
      const input = document.getElementById('crm-email-to');
      const individual = document.getElementById('crm-email-audience').value === 'individual';
      if (wrap) wrap.hidden = !individual;
      if (input) input.required = individual;
    });
    document.getElementById('crm-email-audience')?.dispatchEvent(new Event('change'));
    document.getElementById('crm-email-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('crm-email-message');
      const submit = event.target.querySelector('[type="submit"]');
      setButtonBusy(submit, true, { busy: 'Sending…' });
      try {
        const audience = document.getElementById('crm-email-audience').value;
        const result = await adminApi('crm-campaign-send', {
          method: 'POST',
          body: {
            channel: 'email',
            audience,
            to_email: document.getElementById('crm-email-to')?.value || '',
            subject: document.getElementById('crm-email-subject').value,
            name: document.getElementById('crm-email-subject').value,
            body_text: document.getElementById('crm-email-body').value
          }
        });
        if (message) {
          message.hidden = false;
          message.classList.remove('is-error');
          const extra = result.failed
            ? ` ${result.failed} failed.`
            : result.total && result.sent !== result.total
              ? ` ${result.total} in the list.`
              : '';
          message.textContent = `Sent ${result.sent || 0} email(s).${extra}`;
        }
        event.target.reset();
        document.getElementById('crm-email-audience')?.dispatchEvent(new Event('change'));
        setButtonBusy(submit, false, { done: 'Sent' });
        await loadFollowup({ keepTab: true });
      } catch (err) {
        setButtonBusy(submit, false, { fail: 'Not sent' });
        if (message) {
          message.hidden = false;
          message.classList.add('is-error');
          message.textContent = err.message || 'Could not send email campaign.';
        }
      }
    });
    document.getElementById('crm-sms-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('crm-sms-message');
      const submit = event.target.querySelector('[type="submit"]');
      setButtonBusy(submit, true, { busy: 'Sending…' });
      try {
        const result = await adminApi('crm-campaign-send', {
          method: 'POST',
          body: {
            channel: 'sms',
            audience: document.getElementById('crm-sms-audience').value,
            name: 'SMS campaign',
            body_text: document.getElementById('crm-sms-body').value
          }
        });
        if (message) {
          message.hidden = false;
          message.classList.remove('is-error');
          message.textContent = `Sent ${result.sent || 0} SMS.${result.failed ? ` ${result.failed} failed.` : ''}`;
        }
        event.target.reset();
        setButtonBusy(submit, false, { done: 'Sent' });
        await loadFollowup({ keepTab: true });
      } catch (err) {
        setButtonBusy(submit, false, { fail: 'Not sent' });
        if (message) {
          message.hidden = false;
          message.classList.add('is-error');
          message.textContent = err.message || 'Could not send SMS.';
        }
      }
    });
    document.getElementById('crm-pipeline-card-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await adminApi('crm-pipeline-card', {
          method: 'POST',
          body: {
            pipeline_id: document.getElementById('crm-pipe-select').value,
            stage_id: document.getElementById('crm-pipe-stage').value,
            title: document.getElementById('crm-pipe-title').value,
            notes: document.getElementById('crm-pipe-notes').value
          }
        });
        event.target.reset();
        await loadFollowup({ keepTab: true });
      } catch (err) {
        alert(err.message || 'Could not add pipeline card.');
      }
    });
    document.getElementById('crm-calendar-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const local = document.getElementById('crm-cal-start').value;
        await adminApi('crm-calendar-create', {
          method: 'POST',
          body: {
            title: document.getElementById('crm-cal-title').value,
            starts_at: local ? new Date(local).toISOString() : '',
            event_type: document.getElementById('crm-cal-type').value,
            location: document.getElementById('crm-cal-location').value,
            details: document.getElementById('crm-cal-details').value,
            status: 'confirmed'
          }
        });
        event.target.reset();
        await loadFollowup({ keepTab: true });
      } catch (err) {
        alert(err.message || 'Could not add calendar item.');
      }
    });
  }

  async function loadFollowup() {
    bindFollowupUi();
    setFollowupTab(state.followupTab || 'email');
    const [campaigns, pipelines, calendar, funnel] = await Promise.all([
      adminApi('crm-campaigns'),
      adminApi('crm-pipelines'),
      adminApi('crm-calendar'),
      adminApi('crm-funnel')
    ]);
    renderCampaigns(campaigns.rows || []);
    const smsStatus = document.getElementById('crm-sms-status');
    if (smsStatus) {
      smsStatus.textContent = campaigns.sms_ready
        ? 'Twilio is connected. SMS will go to members who have a phone number on their profile.'
        : 'SMS is not connected yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM on Vercel to enable sending.';
    }
    state.pipelineData = pipelines;
    fillPipelineSelects(pipelines);
    renderPipelineBoard(pipelines);
    renderCalendar(calendar.rows || []);
    renderFunnel(funnel.steps || []);
  }

  async function refreshPanel(id) {
    const nav = resolveNav(id);
    const panelId = nav.panel;
    state.navId = nav.navId;
    state.listScope = nav.scope || '';

    if (panelId === 'business' || panelId === 'pages') {
      if (panelId === 'business') ensureBusinessEditor();
      return;
    }

    if (!state.isAdmin) {
      return;
    }

    if (panelId !== 'ithelp') stopItHelpPoll();
    if (panelId !== 'inbox') stopInboxPoll();

    if (panelId === 'overview') {
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
      if (panelId === 'enquiries') await loadEnquiries();
      if (panelId === 'ithelp') {
        await loadItHelp();
        startItHelpPoll();
      }
      if (panelId === 'inbox') {
        await loadInbox();
        startInboxPoll();
      }
      if (panelId === 'members') await loadMembers();
      if (panelId === 'crm') await loadCrm();
      if (panelId === 'followup') await loadFollowup();
      if (panelId === 'imports') await loadImports();
      if (panelId === 'events') await loadEvents();
      if (panelId === 'invoices') await loadInvoices();
      if (panelId === 'claims') await loadClaims();
      if (panelId === 'sponsors') await loadSponsors();
      if (panelId === 'gallery') await loadGallery();
      if (panelId === 'admins') await loadSiteAdmins();
      if (panelId === 'newsletter') await loadNewsletter();
      if (panelId === 'announcements') await loadAnnouncementsAdmin();
      if (status) status.hidden = true;
    } catch (err) {
      console.error(err);
      if (status) {
        status.hidden = false;
        status.classList.add('is-error');
        status.textContent =
          panelId === 'crm' || panelId === 'followup' || panelId === 'claims' || panelId === 'inbox'
            ? `${err.message || 'Could not load this panel.'} If tables are missing, run docs/supabase/APPLY-WELFARE-INBOX.sql (inbox/attachments) or APPLY-WELFARE-CLAIMS.sql (claims) or APPLY-CRM-FOLLOWUP.sql (follow-up) in the Supabase SQL Editor, then refresh.`
            : err.message ||
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
    document.getElementById('admin-nav-close')?.addEventListener('click', () => setAdminNavOpen(false));
    backdrop?.addEventListener('click', () => setAdminNavOpen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setAdminNavOpen(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 1024) setAdminNavOpen(false);
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
      refreshPanel(state.navId || active?.dataset.adminNav || 'overview');
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
      jumpToPanel(id);
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
      const submit = e.target.querySelector('button[type="submit"]');
      if (!threadId) return;
      if (!text) {
        alert('Enter a reply.');
        return;
      }
      setButtonBusy(submit, true, { busy: 'Sending…' });
      try {
        await adminApi('it-help-reply', { method: 'POST', body: { thread_id: threadId, body: text } });
        if (textarea) textarea.value = '';
        setButtonBusy(submit, false, { done: 'Sent' });
        await loadItHelpMessages(threadId);
        await loadItHelp({ silent: true });
      } catch (err) {
        setButtonBusy(submit, false, { fail: 'Not sent' });
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

    document.getElementById('inbox-start-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const select = document.getElementById('inbox-new-member');
      const textarea = document.getElementById('inbox-start-body');
      const chosen = String(select?.value || '').trim();
      const text = String(textarea?.value || '').trim();
      if (!chosen) {
        alert('Choose a welfare member or committee admin.');
        return;
      }
      if (!text) {
        alert('Enter a message.');
        return;
      }
      const body = { body: text };
      if (chosen.startsWith('admin:')) body.admin_email = chosen.slice(6);
      else if (chosen.startsWith('member:')) body.profile_id = chosen.slice(7);
      else body.profile_id = chosen;
      const submit = e.target.querySelector('button[type="submit"]');
      setButtonBusy(submit, true, { busy: 'Sending…' });
      try {
        const result = await adminApi('welfare-inbox-start', {
          method: 'POST',
          body
        });
        if (textarea) textarea.value = '';
        setButtonBusy(submit, false, { done: 'Sent' });
        state.inboxSelectedId = result.thread_id || '';
        state.inboxFilter = 'open';
        const filter = document.getElementById('inbox-filter');
        if (filter) filter.value = 'open';
        await loadInbox();
      } catch (err) {
        setButtonBusy(submit, false, { fail: 'Not sent' });
        alert(err.message || 'Could not start the conversation.');
      }
    });

    document.getElementById('inbox-people-search')?.addEventListener('input', (e) => {
      state.inboxPeopleQuery = e.target.value || '';
      renderInboxPeopleSelect();
    });

    document.getElementById('inbox-filter')?.addEventListener('change', (e) => {
      state.inboxFilter = e.target.value;
      state.inboxSelectedId = '';
      state.inboxThread = null;
      state.inboxMessages = [];
      if (state.isAdmin) {
        loadInbox().catch((err) => alert(err.message || 'Could not load team inbox.'));
      }
    });

    document.getElementById('inbox-reply-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const threadId = state.inboxSelectedId;
      const textarea = document.getElementById('inbox-reply-body');
      const text = String(textarea?.value || '').trim();
      const submit = e.target.querySelector('button[type="submit"]');
      if (!threadId) return;
      if (!text) {
        alert('Enter a reply.');
        return;
      }
      setButtonBusy(submit, true, { busy: 'Sending…' });
      try {
        await adminApi('welfare-inbox-reply', { method: 'POST', body: { thread_id: threadId, body: text } });
        if (textarea) textarea.value = '';
        setButtonBusy(submit, false, { done: 'Sent' });
        await loadInboxMessages(threadId);
        await loadInbox({ silent: true });
      } catch (err) {
        setButtonBusy(submit, false, { fail: 'Not sent' });
        alert(err.message || 'Could not send reply.');
      }
    });

    document.getElementById('inbox-reply-body')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      document.getElementById('inbox-reply-form')?.requestSubmit();
    });

    document.getElementById('inbox-toggle-status')?.addEventListener('click', async () => {
      const thread = state.inboxThread;
      if (!thread || isCommitteeThread(thread)) return;
      const nextStatus = thread.status === 'closed' ? 'open' : 'closed';
      try {
        await adminApi('welfare-inbox-close', {
          method: 'POST',
          body: { thread_id: thread.id, status: nextStatus }
        });
        await loadInbox();
      } catch (err) {
        alert(err.message || 'Could not update conversation status.');
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

    document.getElementById('admin-mambo-csv-pick')?.addEventListener('click', () => {
      document.getElementById('admin-mambo-csv')?.click();
    });
    document.getElementById('admin-mambo-csv')?.addEventListener('change', async (event) => {
      const input = event.target;
      const file = input.files && input.files[0];
      const status = document.getElementById('admin-mambo-import-status');
      const nameEl = document.getElementById('admin-mambo-csv-name');
      const pick = document.getElementById('admin-mambo-csv-pick');
      if (!file) return;
      if (nameEl) nameEl.textContent = file.name;
      if (status) {
        status.hidden = false;
        status.classList.remove('is-error');
        status.textContent = 'Updating the website list from Mambo Mob. Welfare flags will stay as they are…';
      }
      try {
        const csv = await file.text();
        setButtonBusy(pick, true, { busy: 'Updating…' });
        const data = await adminApi('import-mambo-csv', { method: 'POST', body: { csv } });
        setButtonBusy(pick, false, { done: 'List updated', stay: true });
        if (status) {
          status.classList.remove('is-error');
          status.textContent = data.message || 'Member list updated from Mambo Mob.';
        }
        await loadImports();
      } catch (err) {
        setButtonBusy(pick, false, { fail: 'Not updated' });
        if (status) {
          status.classList.add('is-error');
          status.textContent = err.message || 'Could not update the member list.';
        }
      } finally {
        input.value = '';
      }
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
    document.getElementById('admin-claim-filter')?.addEventListener('change', () => {
      if (state.isAdmin) loadClaims().catch((err) => alert(err.message || 'Could not load claims.'));
    });
    document.getElementById('admin-claims-refresh')?.addEventListener('click', () => {
      if (state.isAdmin) loadClaims().catch((err) => alert(err.message || 'Could not load claims.'));
    });

    document.getElementById('admin-newsletter-export')?.addEventListener('click', () => {
      exportNewsletterCsv();
    });

    document.getElementById('admin-announcement-form')?.addEventListener('submit', createAnnouncement);

    document.getElementById('admin-invite-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.target;
      const fullName = String(form.querySelector('[name="full_name"]')?.value || '').trim();
      const email = String(form.querySelector('[name="email"]')?.value || '').trim();
      const submit = form.querySelector('button[type="submit"]');
      if (!fullName || fullName.length < 2) {
        setInviteStatus('Enter the committee member’s full name.', true);
        return;
      }
      if (!email) {
        setInviteStatus('Enter their email address.', true);
        return;
      }
      setButtonBusy(submit, true, { busy: 'Sending invitation…' });
      setInviteStatus('Sending invitation…', false);
      try {
        const data = await inviteSiteAdmin({ fullName, email });
        form.reset();
        setButtonBusy(submit, false, { done: 'Invitation sent', stay: true });
        setInviteStatus(data.message || `Invitation sent to ${email}.`, false);
      } catch (err) {
        setButtonBusy(submit, false, { fail: 'Not sent' });
        setInviteStatus(err.message || 'Could not send the invitation.', true);
      }
    });

    document.getElementById('admin-admins-body')?.addEventListener('click', async (event) => {
      const resend = event.target.closest('[data-admin-resend]');
      const remove = event.target.closest('[data-admin-remove]');
      if (resend) {
        const email = String(resend.getAttribute('data-admin-resend') || '').trim();
        const fullName = String(resend.getAttribute('data-admin-resend-name') || '').trim() || email;
        if (!email) return;
        setButtonBusy(resend, true, { busy: 'Sending…' });
        setInviteStatus(`Sending invitation to ${email}…`, false);
        try {
          const data = await inviteSiteAdmin({ fullName, email, refreshList: false });
          setButtonBusy(resend, false, { done: 'Sent', stay: true });
          setInviteStatus(data.message || `Invitation sent to ${email}.`, false);
        } catch (err) {
          setButtonBusy(resend, false, { fail: 'Not sent' });
          setInviteStatus(err.message || 'Could not resend the invitation.', true);
        }
        return;
      }
      if (remove) {
        const email = String(remove.getAttribute('data-admin-remove') || '').trim();
        if (!email) return;
        if (!window.confirm(`Remove ${email} from the committee admin list? They will no longer be able to open this dashboard.`)) {
          return;
        }
        setButtonBusy(remove, true, { busy: 'Removing…' });
        try {
          await adminApi('remove-admin', { method: 'POST', body: { email } });
          setInviteStatus(`${email} was removed from the admin list.`, false);
          await loadSiteAdmins();
        } catch (err) {
          setButtonBusy(remove, false, { fail: 'Not removed' });
          setInviteStatus(err.message || 'Could not remove that admin.', true);
        }
      }
    });

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
            : sessionInfo.email || 'Committee admin',
          sessionInfo.email
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
      enterAdminPortal(sessionInfo.email || state.user?.email || 'Committee admin', sessionInfo.email || state.user?.email);
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
