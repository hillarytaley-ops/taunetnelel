/**
 * Taunet Nelel — site-wide committee admin dashboard.
 * Access: committee admin PIN (session) → /api/admin/data
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
    'announcements',
    'pages'
  ];

  const ADMIN_PIN_KEY = 'taunet_site_admin_pin';
  const ADMIN_PIN_VALUE_KEY = 'taunet_site_admin_pin_value';

  const state = {
    client: null,
    user: null,
    isAdmin: false,
    pinOk: false,
    enquiries: [],
    enquiryFilter: 'all',
    enquirySearch: '',
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
    history.replaceState(null, '', `#${next}`);
    if (next === 'enquiries') renderEnquiries();
  }

  async function getClient() {
    if (state.client) return state.client;
    const api = window.taunetSupabaseApi;
    if (!api?.isConfigured()) throw new Error('Supabase is not configured.');
    state.client = await api.ensureClient();
    if (!state.client) throw new Error('Could not load Supabase client.');
    return state.client;
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
    if (els.userLabel) els.userLabel.textContent = 'PIN session (committee portal)';
    showShell(true);
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
      body.innerHTML = `<tr><td colspan="6" class="admin-empty">No events in the database yet. Use “Seed events from site list” below, or run migration 014.</td></tr>`;
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
    state.businessEditor = window.TaunetBusinessAdmin.mount(root, { basePath: '../' });
  }

  async function refreshPanel(id) {
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

    document.getElementById('admin-seed-events')?.addEventListener('click', () => {
      seedEventsFromSite();
    });

    document.getElementById('admin-newsletter-export')?.addEventListener('click', () => {
      exportNewsletterCsv();
    });

    document.getElementById('admin-announcement-form')?.addEventListener('submit', createAnnouncement);
  }

  async function init() {
    bindNav();

    els.logoutBtn?.addEventListener('click', async () => {
      sessionStorage.removeItem(ADMIN_PIN_KEY);
      sessionStorage.removeItem(ADMIN_PIN_VALUE_KEY);
      state.pinOk = false;
      state.isAdmin = false;
      state.user = null;
      try {
        if (window.taunetSupabaseApi?.isConfigured()) {
          const client = await getClient();
          await client.auth.signOut();
        }
      } catch (_) { /* ignore */ }
      window.location.href = authEntryUrl();
    });

    // PIN session only — never auto-open admin from a members Auth session alone
    if (hasPinSession()) {
      enterPinPortal();
      return;
    }
    window.location.replace(authEntryUrl());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
