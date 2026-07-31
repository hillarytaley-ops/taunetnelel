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
    const blurb = document.getElementById('admin-panel-blurb');
    const titles = {
      overview: 'Overview',
      enquiries: 'Enquiries',
      members: 'Member profiles',
      imports: 'Association & Welfare',
      business: 'Business Hub',
      events: 'Events',
      sponsors: 'Sponsors',
      gallery: 'Gallery',
      newsletter: 'Newsletter',
      announcements: 'Announcements',
      pages: 'Pages & tools'
    };
    const blurbs = {
      overview: 'Your committee home — counts, alerts, and shortcuts.',
      enquiries: 'Contact, membership, and other form submissions.',
      members: 'People who have registered or signed in online.',
      imports: 'Association and Welfare membership lists.',
      business: 'Edit business cards, news, and blog posts.',
      events: 'Published events for the public site and members.',
      sponsors: 'Sponsor listings for the public sponsorship page.',
      gallery: 'Album visibility for the public gallery.',
      newsletter: 'Event update subscribers from the Contact page.',
      announcements: 'Messages shown on the members dashboard.',
      pages: 'Shortcuts to public pages and committee tools.'
    };
    if (title) title.textContent = titles[next] || 'Admin';
    if (blurb) blurb.textContent = blurbs[next] || '';
    history.replaceState(null, '', `#${next}`);
    if (next === 'enquiries') renderEnquiries();
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
          </td>
          <td>${row.is_published ? 'Yes' : 'No'}</td>
          <td>
            <label class="admin-upload-btn">
              Upload photos
              <input type="file" accept="image/*" multiple hidden data-event-photos="${escapeHtml(row.id)}">
            </label>
            <div class="admin-detail" data-event-photo-status="${escapeHtml(row.id)}"></div>
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

    body.querySelectorAll('[data-event-photos]').forEach((input) => {
      input.addEventListener('change', async () => {
        const eventId = input.dataset.eventPhotos;
        const status = document.querySelector(`[data-event-photo-status="${eventId}"]`);
        const files = Array.from(input.files || []).slice(0, 6);
        if (!files.length) return;
        if (status) status.textContent = 'Uploading…';
        try {
          const photos = [];
          for (const file of files) {
            const dataUrl = await readFileAsDataUrl(file);
            photos.push({ name: file.name, dataUrl, alt: file.name });
          }
          const result = await adminApi('event-photos', {
            method: 'POST',
            body: { event_id: eventId, photos, move_to_recent: true }
          });
          if (status) {
            status.textContent = `Uploaded ${result.uploaded || photos.length} photo(s). Event moved to Most Recent.`;
          }
          await loadEvents();
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

  async function createEventFromForm(event) {
    event.preventDefault();
    const form = event.target;
    const status = document.getElementById('admin-events-seed-status');
    const fd = new FormData(form);
    const startAt = fromDatetimeLocalValue(fd.get('start_at'));
    const endRaw = fd.get('end_at');
    const payload = {
      title: String(fd.get('title') || '').trim(),
      location: String(fd.get('location') || '').trim(),
      start_at: startAt,
      end_at: endRaw ? fromDatetimeLocalValue(endRaw) : startAt,
      summary: String(fd.get('summary') || '').trim(),
      meta: String(fd.get('meta') || '').trim(),
      badge: String(fd.get('badge') || '').trim(),
      phase_override: String(fd.get('phase_override') || 'auto'),
      is_published: form.querySelector('[name="is_published"]')?.checked !== false,
      registration_open: Boolean(form.querySelector('[name="registration_open"]')?.checked),
      featured: Boolean(form.querySelector('[name="featured"]')?.checked)
    };
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Saving event…';
    }
    try {
      await adminApi('event-create', { method: 'POST', body: payload });
      form.reset();
      form.querySelector('[name="is_published"]').checked = true;
      if (status) status.textContent = 'Event saved.';
      await loadEvents();
    } catch (err) {
      if (status) {
        status.classList.add('is-error');
        status.textContent = err.message || 'Could not save event.';
      }
    }
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
        jumpToPanel(id);
      });
    });

    document.getElementById('admin-refresh')?.addEventListener('click', () => {
      const active = document.querySelector('[data-admin-nav].is-active');
      refreshPanel(active?.dataset.adminNav || 'overview');
    });

    document.addEventListener('click', (e) => {
      const jump = e.target.closest('[data-admin-jump]');
      if (!jump || !document.getElementById('admin-shell')?.contains(jump)) return;
      e.preventDefault();
      jumpToPanel(jump.dataset.adminJump);
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

    document.getElementById('admin-event-form')?.addEventListener('submit', createEventFromForm);

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
