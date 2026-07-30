/**
 * Taunet Nelel — site-wide committee admin dashboard.
 * Requires: supabase-config.js, supabase-init.js, members-auth.js (optional helpers)
 * Access: signed-in Supabase user whose email is in public.site_admins (migration 009).
 */
(function () {
  'use strict';

  const PANELS = [
    'overview',
    'enquiries',
    'members',
    'imports',
    'business',
    'events',
    'sponsors',
    'gallery',
    'newsletter',
    'pages'
  ];

  const ADMIN_PIN_KEY = 'taunet_site_admin_pin';
  const ADMIN_PIN_VALUE_KEY = 'taunet_site_admin_pin_value';

  const state = {
    client: null,
    user: null,
    isAdmin: false,
    pinOk: false,
    preview: false,
    enquiries: [],
    enquiryFilter: 'all',
    enquirySearch: '',
    importFilter: 'all',
    importSearch: '',
    importRows: [],
    businessEditor: null
  };

  const els = {
    gate: document.getElementById('admin-auth-gate'),
    shell: document.getElementById('admin-shell'),
    loginForm: document.getElementById('admin-login-form'),
    status: document.getElementById('admin-auth-status'),
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

  function setAuthStatus(message, isError) {
    if (!els.status) return;
    els.status.hidden = !message;
    els.status.textContent = message || '';
    els.status.classList.toggle('is-error', Boolean(isError));
  }

  function showShell(show) {
    if (els.gate) els.gate.hidden = show;
    if (els.shell) els.shell.hidden = !show;
  }

  function setPanel(id) {
    const next = PANELS.includes(id) ? id : 'overview';
    els.nav.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.adminNav === next);
    });
    els.panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.adminPanel === next);
    });
    const title = document.getElementById('admin-panel-title');
    const titles = {
      overview: 'Overview',
      enquiries: 'Form enquiries',
      members: 'Member profiles',
      imports: 'Members — Association / Welfare',
      business: 'Business Hub',
      events: 'Events (database)',
      sponsors: 'Sponsors (database)',
      gallery: 'Gallery (database)',
      newsletter: 'Newsletter subscribers',
      pages: 'Site pages & tools'
    };
    if (title) title.textContent = titles[next] || 'Admin';
    const previewQs = state.preview ? '?preview=1' : '';
    history.replaceState(null, '', `${previewQs}#${next}`);
    if (next === 'enquiries') renderEnquiries();
  }

  function showPreviewBanner() {
    if (!state.preview) return;
    const main = document.querySelector('.site-admin__main');
    if (!main || main.querySelector('.admin-preview-banner')) return;
    const banner = document.createElement('div');
    banner.className = 'admin-preview-banner';
    banner.innerHTML = `
      <p><strong>Preview mode.</strong> Sample layout only — not live member data. Sign in for real committee access.</p>
      <a href="index.html" class="admin-preview-banner__link">Exit preview</a>
    `;
    main.insertBefore(banner, main.firstChild);
  }

  function loadPreviewDemo() {
    document.getElementById('stat-enquiries').textContent = '12';
    document.getElementById('stat-new').textContent = '3';
    document.getElementById('stat-profiles').textContent = '2';
    document.getElementById('stat-imports').textContent = '540';
    document.getElementById('stat-newsletter').textContent = '8';

    state.enquiries = [
      {
        id: 'demo-1',
        form_type: 'welfare',
        name: 'Sample Member',
        email: 'sample@email.com',
        phone: '0400 000 000',
        message: 'Demo welfare registration request.',
        metadata: { welfare_package: 'Welfare Plus — Individual ($300/year)' },
        status: 'new',
        admin_notes: '',
        created_at: new Date().toISOString()
      },
      {
        id: 'demo-2',
        form_type: 'contact',
        name: 'Jane Example',
        email: 'jane@example.com',
        phone: '',
        message: 'Demo contact enquiry about membership.',
        metadata: {},
        status: 'reviewed',
        admin_notes: '',
        created_at: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    const membersBody = document.getElementById('admin-members-body');
    if (membersBody) {
      membersBody.innerHTML = `<tr>
        <td>Demo Member<div class="admin-detail">demo@taunetnelel.org</div></td>
        <td><span class="admin-chip">basic</span></td>
        <td>Yes</td>
        <td>No</td>
        <td class="admin-detail">Preview only</td>
      </tr>`;
    }

    const importsBody = document.getElementById('admin-imports-body');
    if (importsBody) {
      importsBody.innerHTML = `<tr>
        <td>TN-0001</td>
        <td>Demo Import Row<div class="admin-detail">import@example.com</div></td>
        <td><span class="admin-chip">Association + Welfare</span></td>
        <td>pending_invite</td>
        <td>A / W</td>
      </tr>`;
    }

    ['admin-events-body', 'admin-sponsors-body', 'admin-gallery-body', 'admin-newsletter-body'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerHTML = `<tr><td colspan="6" class="admin-empty">Preview mode — open Business Hub tab to try the editor, or sign in for live data.</td></tr>`;
      }
    });
  }

  function enterPreview() {
    state.preview = true;
    state.isAdmin = false;
    if (els.userLabel) els.userLabel.textContent = 'Preview (not signed in)';
    showShell(true);
    showPreviewBanner();
    loadPreviewDemo();
    const hash = (location.hash || '#overview').replace('#', '');
    setPanel(hash);
    if (hash === 'business') ensureBusinessEditor();
    else if (hash === 'enquiries') renderEnquiries();
  }

  async function getClient() {
    if (state.client) return state.client;
    const api = window.taunetSupabaseApi;
    if (!api?.isConfigured()) throw new Error('Supabase is not configured.');
    state.client = await api.ensureClient();
    if (!state.client) throw new Error('Could not load Supabase client.');
    return state.client;
  }

  function expectedAdminPin() {
    return window.TAUNET_SUPABASE?.adminPin || 'TaunetAdmin2026';
  }

  function hasPinSession() {
    return sessionStorage.getItem(ADMIN_PIN_KEY) === '1' && Boolean(sessionStorage.getItem(ADMIN_PIN_VALUE_KEY));
  }

  function getStoredPin() {
    return sessionStorage.getItem(ADMIN_PIN_VALUE_KEY) || '';
  }

  async function adminApi(resource, options = {}) {
    const pin = getStoredPin();
    if (!pin) throw new Error('Admin PIN session missing. Sign in again.');
    const params = new URLSearchParams({ resource });
    if (options.filter) params.set('filter', options.filter);
    const res = await fetch(`/api/admin/data?${params.toString()}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': pin
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.error || `Admin API error (${res.status})`);
    }
    return data;
  }

  function enterPinPortal() {
    state.pinOk = true;
    state.isAdmin = true;
    state.preview = false;
    if (els.userLabel) els.userLabel.textContent = 'PIN session (committee portal)';
    showShell(true);
    setAuthStatus('');
    const hash = (location.hash || '#overview').replace('#', '');
    setPanel(hash);
    ensureBusinessEditor();
    refreshPanel(hash);
  }

  async function loadOverview() {
    const data = await adminApi('overview');
    const map = {
      'stat-enquiries': data.enquiries,
      'stat-new': data.newEnquiries,
      'stat-profiles': data.profiles,
      'stat-imports': data.imports,
      'stat-newsletter': data.newsletter
    };
    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value ?? '—';
    });
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
              <select data-status-for="${escapeHtml(row.id)}">
                <option value="new"${status === 'new' ? ' selected' : ''}>new</option>
                <option value="reviewed"${status === 'reviewed' ? ' selected' : ''}>reviewed</option>
                <option value="actioned"${status === 'actioned' ? ' selected' : ''}>actioned</option>
                <option value="archived"${status === 'archived' ? ' selected' : ''}>archived</option>
              </select>
            </div>
          </td>
          <td class="admin-detail">${escapeHtml(row.admin_notes || '')}</td>
        </tr>`;
      })
      .join('');

    body.querySelectorAll('[data-status-for]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          if (state.preview) {
            const item = state.enquiries.find((r) => r.id === select.dataset.statusFor);
            if (item) item.status = select.value;
            renderEnquiries();
            return;
          }
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
        return `<tr>
          <td>${escapeHtml(row.member_number || '—')}</td>
          <td>${escapeHtml(row.full_name || '—')}<div class="admin-detail">${escapeHtml(row.email || '')}</div></td>
          <td><span class="admin-chip admin-chip--${chip}">${escapeHtml(label)}</span></td>
          <td>${escapeHtml(row.status || '—')}</td>
          <td>${row.association_member ? 'Yes' : '—'}</td>
          <td>${row.welfare_member ? 'Yes' : '—'}</td>
        </tr>`;
      })
      .join('');
  }

  async function loadEvents() {
    const data = await adminApi('events');
    const body = document.getElementById('admin-events-body');
    if (!body) return;
    const rows = data.rows || [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="6" class="admin-empty">No events in the database yet. Public events still come from events-phases.js.</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.title || '—')}</td>
          <td>${escapeHtml(row.location || '—')}</td>
          <td>${escapeHtml(formatDate(row.start_at))}</td>
          <td>${row.is_published ? 'Yes' : 'No'}</td>
          <td>${row.registration_open ? 'Open' : 'Closed'}</td>
          <td>${row.featured ? 'Yes' : '—'}</td>
        </tr>`
      )
      .join('');
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
    const data = await adminApi('gallery');
    const body = document.getElementById('admin-gallery-body');
    if (!body) return;
    const rows = data.rows || [];
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No gallery albums in DB (public gallery may still use gallery-data.js).</td></tr>`;
      return;
    }
    body.innerHTML = rows
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.title || '—')}</td>
          <td>${escapeHtml(row.event_date || '—')}</td>
          <td>${escapeHtml(row.group_id || '—')}</td>
          <td>${row.is_published ? 'Yes' : 'No'}</td>
          <td>
            <label class="admin-actions">
              <input type="checkbox" data-album-pub="${escapeHtml(row.id)}" ${row.is_published ? 'checked' : ''}>
              Published
            </label>
          </td>
        </tr>`
      )
      .join('');

    body.querySelectorAll('[data-album-pub]').forEach((input) => {
      input.addEventListener('change', async () => {
        try {
          await adminApi('gallery-publish', {
            method: 'PATCH',
            body: { id: input.dataset.albumPub, is_published: input.checked }
          });
        } catch (err) {
          alert(err.message || 'Could not update album.');
          input.checked = !input.checked;
        }
      });
    });
  }

  async function loadNewsletter() {
    const data = await adminApi('newsletter');
    const body = document.getElementById('admin-newsletter-body');
    if (!body) return;
    const rows = data.rows || [];
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

  function ensureBusinessEditor() {
    const root = document.getElementById('admin-business-root');
    if (!root || !window.TaunetBusinessAdmin) return;
    if (state.businessEditor) {
      state.businessEditor.reload?.();
      return;
    }
    state.businessEditor = window.TaunetBusinessAdmin.mount(root, { basePath: '../' });
  }

  async function refreshPanel(id) {
    if (state.preview) {
      if (id === 'business') ensureBusinessEditor();
      if (id === 'enquiries') renderEnquiries();
      if (id === 'overview') loadPreviewDemo();
      return;
    }

    if (id === 'business' || id === 'pages') {
      if (id === 'business') ensureBusinessEditor();
      return;
    }

    if (!(state.pinOk || state.isAdmin)) {
      return;
    }

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
      if (id === 'members') await loadMembers();
      if (id === 'imports') await loadImports();
      if (id === 'events') await loadEvents();
      if (id === 'sponsors') await loadSponsors();
      if (id === 'gallery') await loadGallery();
      if (id === 'newsletter') await loadNewsletter();
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
    els.nav.forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.adminNav;
        setPanel(id);
        refreshPanel(id);
      });
    });

    document.getElementById('admin-refresh')?.addEventListener('click', () => {
      const active = document.querySelector('[data-admin-nav].is-active');
      refreshPanel(active?.dataset.adminNav || 'overview');
    });

    document.getElementById('enquiry-filter')?.addEventListener('change', (e) => {
      state.enquiryFilter = e.target.value;
      renderEnquiries();
    });

    document.getElementById('enquiry-search')?.addEventListener('input', (e) => {
      state.enquirySearch = e.target.value;
      renderEnquiries();
    });

    document.getElementById('imports-filter')?.addEventListener('change', (e) => {
      state.importFilter = e.target.value;
      loadImports();
    });

    document.getElementById('imports-search')?.addEventListener('input', (e) => {
      state.importSearch = e.target.value;
      renderImports();
    });
  }

  async function init() {
    bindNav();

    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1' || params.get('preview') === 'true') {
      enterPreview();
      return;
    }

    els.loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = els.loginForm.querySelector('[name="pin"]')?.value?.trim() || '';
      if (pin !== expectedAdminPin()) {
        setAuthStatus('Incorrect admin PIN.', true);
        return;
      }
      sessionStorage.setItem(ADMIN_PIN_KEY, '1');
      sessionStorage.setItem(ADMIN_PIN_VALUE_KEY, pin);
      enterPinPortal();
    });


    els.logoutBtn?.addEventListener('click', async () => {
      sessionStorage.removeItem(ADMIN_PIN_KEY);
      sessionStorage.removeItem(ADMIN_PIN_VALUE_KEY);
      state.pinOk = false;
      state.isAdmin = false;
      state.user = null;
      state.preview = false;
      try {
        if (window.taunetSupabaseApi?.isConfigured()) {
          const client = await getClient();
          await client.auth.signOut();
        }
      } catch (_) { /* ignore */ }
      showShell(false);
      setAuthStatus('Signed out of admin portal.');
    });

    // PIN session only — never auto-open admin from a members Auth session alone
    if (hasPinSession()) {
      enterPinPortal();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
