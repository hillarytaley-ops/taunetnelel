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

  const state = {
    client: null,
    user: null,
    isAdmin: false,
    preview: false,
    enquiries: [],
    enquiryFilter: 'all',
    enquirySearch: '',
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
      imports: 'Imported member list',
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

  async function checkAdmin(client, user) {
    const email = (user?.email || '').toLowerCase().trim();
    if (!email) return { ok: false, reason: 'No email on this Auth session.' };

    const { data, error } = await client.rpc('is_site_admin');
    if (!error && data === true) return { ok: true };

    // Fallback: own row (policy allows reading your email only)
    const { data: row, error: rowErr } = await client
      .from('site_admins')
      .select('email')
      .eq('email', email)
      .maybeSingle();

    if (row?.email) return { ok: true };

    const hint = error?.message || rowErr?.message || '';
    return {
      ok: false,
      reason:
        `Signed in as ${email}, but that address is not in site_admins` +
        (hint ? ` (${hint})` : '') +
        '. Run 011_fix_site_admin_recognition.sql, then try again.'
    };
  }

  async function enterAdmin(user) {
    const client = await getClient();
    const result = await checkAdmin(client, user);
    if (!result.ok) {
      await client.auth.signOut();
      showShell(false);
      setAuthStatus(result.reason || 'Not recognized as a site admin.', true);
      return;
    }
    state.user = user;
    state.isAdmin = true;
    if (els.userLabel) els.userLabel.textContent = user.email || '';
    showShell(true);
    setAuthStatus('');
    await loadOverview();
    const hash = (location.hash || '#overview').replace('#', '');
    setPanel(hash);
  }

  async function loadOverview() {
    const client = await getClient();
    const counts = {
      enquiries: '—',
      newEnquiries: '—',
      profiles: '—',
      imports: '—',
      newsletter: '—'
    };

    try {
      const { count: total } = await client
        .from('form_submissions')
        .select('*', { count: 'exact', head: true });
      counts.enquiries = total ?? 0;

      const { count: fresh } = await client
        .from('form_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');
      counts.newEnquiries = fresh ?? 0;
    } catch (_) { /* ignore */ }

    try {
      const { count } = await client.from('profiles').select('*', { count: 'exact', head: true });
      counts.profiles = count ?? 0;
    } catch (_) { /* ignore */ }

    try {
      const { count } = await client.from('member_imports').select('*', { count: 'exact', head: true });
      counts.imports = count ?? 0;
    } catch (_) { /* ignore */ }

    try {
      const { count } = await client
        .from('newsletter_subscribers')
        .select('*', { count: 'exact', head: true });
      counts.newsletter = count ?? 0;
    } catch (_) { /* ignore */ }

    const map = {
      'stat-enquiries': counts.enquiries,
      'stat-new': counts.newEnquiries,
      'stat-profiles': counts.profiles,
      'stat-imports': counts.imports,
      'stat-newsletter': counts.newsletter
    };
    Object.entries(map).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
  }

  async function loadEnquiries() {
    const client = await getClient();
    const { data, error } = await client
      .from('form_submissions')
      .select('id,form_type,name,email,phone,message,metadata,status,admin_notes,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    state.enquiries = data || [];
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
          const client = await getClient();
          const { error } = await client
            .from('form_submissions')
            .update({ status: select.value })
            .eq('id', select.dataset.statusFor);
          if (error) throw error;
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
    const client = await getClient();
    const { data, error } = await client
      .from('profiles')
      .select('id,full_name,email,phone,plan,association_member,welfare_member,member_number,created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const body = document.getElementById('admin-members-body');
    if (!body) return;
    if (!data?.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No profiles yet.</td></tr>`;
      return;
    }
    body.innerHTML = data
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
          const client = await getClient();
          const id = btn.dataset.approveWelfare;
          const row = data.find((r) => r.id === id);
          const nextPlan = row?.association_member ? 'both' : 'welfare';
          const { error } = await client
            .from('profiles')
            .update({
              welfare_member: true,
              association_member: row?.association_member !== false,
              plan: nextPlan
            })
            .eq('id', id);
          if (error) throw error;
          await loadMembers();
        } catch (err) {
          alert(err.message || 'Could not approve welfare.');
        }
      });
    });
  }

  async function loadImports() {
    const client = await getClient();
    const { data, error } = await client
      .from('member_imports')
      .select('member_number,full_name,email,plan,membership_label,status,association_member,welfare_member')
      .order('member_number', { ascending: true })
      .limit(100);
    if (error) throw error;

    let statsHtml = '';
    try {
      const { data: stats } = await client.from('member_import_stats').select('*').maybeSingle();
      if (stats) {
        statsHtml = `<div class="admin-stats">
          <div class="admin-stat"><strong>${stats.total ?? '—'}</strong><span>Total imported</span></div>
          <div class="admin-stat"><strong>${stats.association_and_welfare ?? '—'}</strong><span>Association + Welfare</span></div>
          <div class="admin-stat"><strong>${stats.association_only ?? '—'}</strong><span>Association only</span></div>
          <div class="admin-stat"><strong>${stats.welfare_only ?? '—'}</strong><span>Welfare only</span></div>
          <div class="admin-stat"><strong>${stats.pending_invite ?? '—'}</strong><span>Pending invite</span></div>
        </div>`;
      }
    } catch (_) { /* view may be missing */ }

    const statsHost = document.getElementById('admin-imports-stats');
    if (statsHost) statsHost.innerHTML = statsHtml;

    const body = document.getElementById('admin-imports-body');
    if (!body) return;
    if (!data?.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No import rows (or migration 009 not applied).</td></tr>`;
      return;
    }
    body.innerHTML = data
      .map(
        (row) => `<tr>
          <td>${escapeHtml(row.member_number || '—')}</td>
          <td>${escapeHtml(row.full_name || '—')}<div class="admin-detail">${escapeHtml(row.email || '')}</div></td>
          <td><span class="admin-chip">${escapeHtml(row.membership_label || row.plan || '')}</span></td>
          <td>${escapeHtml(row.status || '—')}</td>
          <td>${row.association_member ? 'A' : '—'} / ${row.welfare_member ? 'W' : '—'}</td>
        </tr>`
      )
      .join('');
  }

  async function loadSimpleTable(table, columns, bodyId, emptyMsg) {
    const client = await getClient();
    const { data, error } = await client.from(table).select(columns).limit(100);
    if (error) throw error;
    const body = document.getElementById(bodyId);
    if (!body) return;
    if (!data?.length) {
      body.innerHTML = `<tr><td colspan="6" class="admin-empty">${escapeHtml(emptyMsg)}</td></tr>`;
      return;
    }
    return data;
  }

  async function loadEvents() {
    const data = await loadSimpleTable(
      'events',
      'id,title,location,start_at,is_published,registration_open,featured',
      'admin-events-body',
      'No events in the database yet. Public events still come from events-phases.js.'
    );
    const body = document.getElementById('admin-events-body');
    if (!body || !data) return;
    body.innerHTML = data
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
    const data = await loadSimpleTable(
      'sponsors',
      'id,name,tier,website,is_published,sort_order',
      'admin-sponsors-body',
      'No sponsors in the database yet. Public sponsorship page is still mostly static HTML.'
    );
    const body = document.getElementById('admin-sponsors-body');
    if (!body || !data) return;
    body.innerHTML = data
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
    const client = await getClient();
    const { data, error } = await client
      .from('gallery_albums')
      .select('id,title,event_date,is_published,preview_limit,group_id')
      .order('sort_date', { ascending: false })
      .limit(100);
    if (error) throw error;
    const body = document.getElementById('admin-gallery-body');
    if (!body) return;
    if (!data?.length) {
      body.innerHTML = `<tr><td colspan="5" class="admin-empty">No gallery albums in DB (public gallery may still use gallery-data.js).</td></tr>`;
      return;
    }
    body.innerHTML = data
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
          const { error: upErr } = await client
            .from('gallery_albums')
            .update({ is_published: input.checked })
            .eq('id', input.dataset.albumPub);
          if (upErr) throw upErr;
        } catch (err) {
          alert(err.message || 'Could not update album.');
          input.checked = !input.checked;
        }
      });
    });
  }

  async function loadNewsletter() {
    const data = await loadSimpleTable(
      'newsletter_subscribers',
      'email,list_key,subscribed_at',
      'admin-newsletter-body',
      'No newsletter subscribers yet.'
    );
    const body = document.getElementById('admin-newsletter-body');
    if (!body || !data) return;
    body.innerHTML = data
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

    const status = document.getElementById('admin-panel-status');
    if (status) {
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Loading…';
    }
    try {
      if (id === 'overview') await loadOverview();
      if (id === 'enquiries') await loadEnquiries();
      if (id === 'members') await loadMembers();
      if (id === 'imports') await loadImports();
      if (id === 'business') ensureBusinessEditor();
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
          'Could not load data. Confirm migration 009 is applied and your email is in site_admins.';
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
  }

  async function init() {
    bindNav();

    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === '1' || params.get('preview') === 'true') {
      enterPreview();
      return;
    }

    if (!window.taunetSupabaseApi?.isConfigured()) {
      setAuthStatus('Supabase is not configured (assets/js/supabase-config.js).', true);
      return;
    }

    els.loginForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAuthStatus('Signing in…');
      try {
        const client = await getClient();
        const email = els.loginForm.querySelector('[name="email"]')?.value?.trim();
        const password = els.loginForm.querySelector('[name="password"]')?.value || '';
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await enterAdmin(data.user);
        await refreshPanel((location.hash || '#overview').replace('#', ''));
      } catch (err) {
        setAuthStatus(err.message || 'Sign-in failed.', true);
      }
    });

    els.logoutBtn?.addEventListener('click', async () => {
      if (state.preview) {
        window.location.href = 'index.html';
        return;
      }
      try {
        const client = await getClient();
        await client.auth.signOut();
      } catch (_) { /* ignore */ }
      state.user = null;
      state.isAdmin = false;
      showShell(false);
      setAuthStatus('Signed out.');
    });

    try {
      const client = await getClient();
      const { data } = await client.auth.getSession();
      if (data?.session?.user) {
        await enterAdmin(data.session.user);
        await refreshPanel((location.hash || '#overview').replace('#', ''));
      }
    } catch (err) {
      console.warn(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
