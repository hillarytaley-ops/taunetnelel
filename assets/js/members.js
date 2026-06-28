(function () {
  'use strict';

  const STORAGE_KEY = 'taunet_member';
  const DEMO_USER = {
    name: 'Jane Kiprotich',
    email: 'jane.kiprotich@email.com',
    phone: '+61 400 000 000',
    plan: 'basic',
    planLabel: 'Basic',
    renews: '12 Aug 2026',
    memberSince: '2024',
    registrations: [
      { event: 'Taunet Nelel Gala 2026', status: 'Confirmed', date: '18 Apr 2026' }
    ]
  };

  const DEMO_WELFARE_USER = {
    ...DEMO_USER,
    plan: 'welfare',
    planLabel: 'Welfare Plus'
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
        setMember({
          ...DEMO_USER,
          name,
          email,
          phone,
          plan,
          planLabel: plan === 'welfare' ? 'Welfare Plus' : 'Basic',
          registrations: []
        });
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect');
        window.location.href = redirect || 'dashboard.html';
      });
    }
  }

  function initDashboard() {
    const member = requireAuth();
    if (!member) return;

    const initials = member.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

    document.querySelectorAll('[data-member-name]').forEach((el) => { el.textContent = member.name; });
    document.querySelectorAll('[data-member-email]').forEach((el) => { el.textContent = member.email; });
    document.querySelectorAll('[data-member-plan]').forEach((el) => { el.textContent = member.planLabel; });
    document.querySelectorAll('[data-member-renews]').forEach((el) => { el.textContent = member.renews; });
    document.querySelectorAll('[data-member-initials]').forEach((el) => { el.textContent = initials; });

    const isWelfare = member.plan === 'welfare';

    const welfareGate = document.getElementById('welfare-gate');
    const welfareContent = document.getElementById('welfare-content');
    if (welfareGate && welfareContent) {
      if (isWelfare) {
        welfareGate.style.display = 'none';
        welfareContent.style.display = 'block';
      } else {
        welfareGate.style.display = 'block';
        welfareContent.style.display = 'none';
      }
    }

    const welfareQuickAction = document.querySelector('.quick-actions [data-welfare-only]');
    if (welfareQuickAction && !isWelfare) {
      welfareQuickAction.textContent = 'Upgrade for Welfare';
      welfareQuickAction.href = 'membership.html';
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
