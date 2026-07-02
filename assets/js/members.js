(function () {
  'use strict';

  const STORAGE_KEY = 'taunet_member';

  const WELFARE_ALERTS = [
    { id: 'a1', date: '28 Jun 2026', type: 'Bereavement reimbursement', amount: '$2,500', member: 'Member #1042', status: 'Approved' },
    { id: 'a2', date: '12 Jun 2026', type: 'Hardship support', amount: '$800', member: 'Member #0987', status: 'Approved' },
    { id: 'a3', date: '30 May 2026', type: 'Bereavement reimbursement', amount: '$2,500', member: 'Member #0911', status: 'Approved' }
  ];

  const DEMO_USER = {
    name: 'Jane Kiprotich',
    email: 'jane.kiprotich@email.com',
    phone: '+61 400 000 000',
    plan: 'basic',
    planLabel: 'Basic',
    renews: '12 Aug 2026',
    memberSince: '2024',
    welfareRegistered: false,
    registrations: [
      { event: 'Taunet Nelel Gala 2026', status: 'Confirmed', date: '18 Apr 2026' }
    ]
  };

  const DEMO_WELFARE_USER = {
    ...DEMO_USER,
    plan: 'welfare',
    planLabel: 'Welfare Plus',
    welfareRegistered: true,
    welfarePackage: 'Welfare Plus — Individual',
    welfarePackageKey: 'welfare-plus-individual',
    welfareStatus: 'active',
    welfareSince: '2024',
    welfareCover: 'Bereavement & hardship',
    welfareAlertsEnabled: true
  };

  function applyPreviewMode() {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get('preview');
    if (!preview) return false;

    if (preview === 'welfare') {
      setMember({ ...DEMO_WELFARE_USER });
    } else if (preview === 'basic' || preview === '1' || preview === 'true') {
      setMember({ ...DEMO_USER });
    } else {
      return false;
    }

    sessionStorage.setItem('taunet_preview', '1');
    if (params.has('preview')) {
      params.delete('preview');
      const query = params.toString();
      const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
      history.replaceState(null, '', nextUrl);
    }
    return true;
  }

  function showPreviewBanner() {
    if (sessionStorage.getItem('taunet_preview') !== '1') return;

    const main = document.querySelector('.members-main');
    if (!main || main.querySelector('.members-preview-banner')) return;

    const banner = document.createElement('div');
    banner.className = 'members-preview-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = `
      <p><strong>Preview mode.</strong> You are viewing a demo member dashboard with sample data — no real account is required.</p>
      <a href="login.html?exit=preview" class="members-preview-banner__link">Exit preview</a>
    `;
    main.prepend(banner);
  }

  function clearPreviewMode() {
    sessionStorage.removeItem('taunet_preview');
  }

  function getMember() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function setMember(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearMember() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isWelfareMember(member) {
    return member.plan === 'welfare' || member.welfareRegistered === true;
  }

  function packageLabelFromValue(value) {
    if (value.includes('Family')) return 'Welfare Plus — Family household';
    if (value.includes('Bereavement')) return 'Welfare Bereavement — Standard';
    return 'Welfare Plus — Individual';
  }

  function requireAuth() {
    const member = getMember();
    if (!member && !window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
      const base = window.location.pathname.includes('/members/') ? '' : 'members/';
      window.location.href = base + 'login.html';
    }
    return member;
  }

  function initAuth() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('[name="email"]')?.value;
        const user = { ...DEMO_USER, email: email || DEMO_USER.email };
        setMember(user);
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        window.location.href = redirect || 'dashboard.html';
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = registerForm.querySelector('[name="name"]')?.value || 'New Member';
        const email = registerForm.querySelector('[name="email"]')?.value || '';
        const plan = registerForm.querySelector('[name="plan"]:checked')?.value
          || registerForm.querySelector('[name="plan"]')?.value
          || 'basic';
        const phone = registerForm.querySelector('[name="phone"]')?.value || '';
        const isWelfare = plan === 'welfare';
        setMember({
          ...DEMO_USER,
          name,
          email,
          phone,
          plan,
          planLabel: isWelfare ? 'Welfare Plus' : 'Basic',
          welfareRegistered: isWelfare,
          welfarePackage: isWelfare ? 'Welfare Plus — Individual' : undefined,
          welfareStatus: isWelfare ? 'active' : undefined,
          welfareSince: isWelfare ? new Date().getFullYear().toString() : undefined,
          welfareCover: isWelfare ? 'Bereavement & hardship' : undefined,
          welfareAlertsEnabled: isWelfare,
          registrations: []
        });
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        window.location.href = redirect || 'dashboard.html';
      });
    }
  }

  function populateMemberFields(member) {
    document.querySelectorAll('[data-member-name]').forEach((el) => { el.textContent = member.name; });
    document.querySelectorAll('[data-member-email]').forEach((el) => { el.textContent = member.email; });
    document.querySelectorAll('[data-member-plan]').forEach((el) => { el.textContent = member.planLabel; });
    document.querySelectorAll('[data-member-renews]').forEach((el) => { el.textContent = member.renews; });
    document.querySelectorAll('[data-member-name-field]').forEach((el) => { el.value = member.name; });
    document.querySelectorAll('[data-member-email-field]').forEach((el) => { el.value = member.email; });

    const initials = member.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    document.querySelectorAll('[data-member-initials]').forEach((el) => { el.textContent = initials; });

    if (member.welfarePackage) {
      document.querySelectorAll('[data-welfare-package]').forEach((el) => { el.textContent = member.welfarePackage; });
    }
    if (member.welfareSince) {
      document.querySelectorAll('[data-welfare-since]').forEach((el) => { el.textContent = member.welfareSince; });
    }
    if (member.welfareCover) {
      document.querySelectorAll('[data-welfare-cover]').forEach((el) => { el.textContent = member.welfareCover; });
    }
  }

  function renderWelfareStatus(member) {
    const status = member.welfareStatus || (isWelfareMember(member) ? 'active' : 'none');
    const chips = document.querySelectorAll('[data-welfare-status-chip]');
    const note = document.getElementById('welfare-status-note');

    chips.forEach((chip) => {
      chip.classList.remove('status-chip--active', 'status-chip--pending', 'status-chip--welfare');
      if (status === 'active') {
        chip.textContent = 'Active';
        chip.classList.add('status-chip--active');
      } else if (status === 'pending') {
        chip.textContent = 'Pending';
        chip.classList.add('status-chip--pending');
      } else if (status === 'expired') {
        chip.textContent = 'Expired';
        chip.classList.add('status-chip--pending');
      }
    });

    if (note) {
      if (status === 'active') {
        note.textContent = 'Your social welfare membership is active. You are eligible for bereavement support and community reimbursements.';
      } else if (status === 'pending') {
        note.textContent = 'Your welfare registration is being reviewed. You will receive confirmation within 3 business days.';
      } else if (status === 'expired') {
        note.textContent = 'Your welfare membership has expired. Please renew to continue receiving support and alerts.';
      }
    }
  }

  function renderWelfareAlerts(member) {
    const list = document.getElementById('welfare-alert-list');
    const toggle = document.getElementById('welfare-alerts-enabled');
    if (!list) return;

    const enabled = member.welfareAlertsEnabled !== false;
    if (toggle) toggle.checked = enabled;

    list.innerHTML = '';
    if (!enabled) {
      list.innerHTML = '<li class="welfare-alert-list__empty">Alerts are turned off. Enable notifications above to see reimbursement updates.</li>';
      return;
    }

    WELFARE_ALERTS.forEach((alert) => {
      const item = document.createElement('li');
      item.className = 'welfare-alert-item';
      item.innerHTML = `
        <div class="welfare-alert-item__icon" aria-hidden="true">&#9888;</div>
        <div class="welfare-alert-item__body">
          <p class="welfare-alert-item__title">${alert.type} — ${alert.amount}</p>
          <p class="welfare-alert-item__meta">${alert.member} · ${alert.date} · <span class="status-chip status-chip--active">${alert.status}</span></p>
        </div>
      `;
      list.appendChild(item);
    });
  }

  function initWelfareRegister(member) {
    const card = document.getElementById('welfare-register-card');
    const form = document.getElementById('welfare-register-form');
    const upgradeBtn = document.getElementById('dashboard-upgrade-btn');
    const summary = document.getElementById('welfare-member-summary');
    const params = new URLSearchParams(window.location.search);

    if (isWelfareMember(member)) {
      card?.setAttribute('hidden', '');
      upgradeBtn?.setAttribute('hidden', '');
      summary?.removeAttribute('hidden');
      renderWelfareStatus(member);
    } else {
      card?.removeAttribute('hidden');
      upgradeBtn?.removeAttribute('hidden');
      summary?.setAttribute('hidden', '');

      const startInput = document.getElementById('welfare-start');
      if (startInput && !startInput.value) {
        const today = new Date();
        startInput.value = today.toISOString().slice(0, 10);
      }
    }

    if (params.get('welfare') === 'registered') {
      const msg = document.getElementById('welfare-register-message');
      if (msg) {
        msg.hidden = false;
        msg.classList.remove('is-error');
        msg.textContent = 'Thank you! Your welfare registration has been submitted. The Welfare Committee will confirm your enrolment within 3 business days.';
      }
      params.delete('welfare');
      const query = params.toString();
      history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }

    form?.addEventListener('submit', () => {
      const packageSelect = form.querySelector('[name="welfare_package"]');
      const packageValue = packageSelect?.value || '';
      const updated = {
        ...member,
        welfareRegistered: true,
        welfareStatus: 'pending',
        welfarePackage: packageLabelFromValue(packageValue),
        welfareSince: new Date().getFullYear().toString(),
        welfareCover: packageValue.includes('Bereavement') ? 'Bereavement only' : 'Bereavement & hardship',
        welfareAlertsEnabled: true
      };
      setMember(updated);
    });
  }

  function initWelfarePortal(member) {
    const toggle = document.getElementById('welfare-alerts-enabled');
    toggle?.addEventListener('change', () => {
      const updated = { ...getMember(), welfareAlertsEnabled: toggle.checked };
      setMember(updated);
      renderWelfareAlerts(updated);
    });

    renderWelfareStatus(member);
    renderWelfareAlerts(member);
  }

  function initDashboard() {
    const member = requireAuth();
    if (!member) return;

    populateMemberFields(member);

    const isWelfare = isWelfareMember(member);

    const welfareGate = document.getElementById('welfare-gate');
    const welfareContent = document.getElementById('welfare-content');
    if (welfareGate && welfareContent) {
      if (isWelfare) {
        welfareGate.style.display = 'none';
        welfareContent.style.display = 'block';
        initWelfarePortal(member);
      } else {
        welfareGate.style.display = 'block';
        welfareContent.style.display = 'none';
      }
    }

    initWelfareRegister(member);

    const welfareQuickAction = document.querySelector('.quick-actions [data-welfare-only]');
    if (welfareQuickAction && !isWelfare) {
      welfareQuickAction.textContent = 'Register for Welfare';
      welfareQuickAction.href = 'dashboard.html#welfare-register-card';
    }

    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.querySelector('[name="name"]').value = member.name;
      profileForm.querySelector('[name="email"]').value = member.email;
      profileForm.querySelector('[name="phone"]').value = member.phone || '';
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const updated = {
          ...member,
          name: profileForm.querySelector('[name="name"]').value,
          email: profileForm.querySelector('[name="email"]').value,
          phone: profileForm.querySelector('[name="phone"]').value
        };
        setMember(updated);
        alert('Profile updated successfully.');
      });
    }

    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      clearPreviewMode();
      clearMember();
      window.location.href = 'login.html';
    });
  }

  function initMobileSidebar() {
    const toggle = document.querySelector('.members-menu-toggle');
    const sidebar = document.querySelector('.members-sidebar');
    toggle?.addEventListener('click', () => sidebar?.classList.toggle('open'));
  }

  function initInquirySuccess() {
    if (new URLSearchParams(window.location.search).get('sent') !== '1') return;

    const inquiryMsg = document.querySelector('.inquiry-form__message');
    if (!inquiryMsg) return;

    inquiryMsg.hidden = false;
    inquiryMsg.classList.remove('is-error');
    inquiryMsg.textContent = inquiryMsg.dataset.success
      || 'Thank you! Your enquiry has been sent. We will respond within 2 business days.';
    const anchor = inquiryMsg.closest('[id]');
    const hash = anchor?.id || 'inquiry';
    history.replaceState(null, '', `${window.location.pathname}#${hash}`);
  }

  const path = window.location.pathname;
  if (path.includes('login') || path.includes('register')) {
    if (new URLSearchParams(window.location.search).get('exit') === 'preview') {
      clearPreviewMode();
      clearMember();
      history.replaceState(null, '', path.includes('register') ? 'register.html' : 'login.html');
    }
    if (getMember()) {
      window.location.href = 'dashboard.html';
    }
    initAuth();
  } else if (path.includes('/members/')) {
    applyPreviewMode();
    initDashboard();
    showPreviewBanner();
    initMobileSidebar();
    initInquirySuccess();
  }
})();
