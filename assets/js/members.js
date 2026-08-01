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
      { eventId: 'gala-2026', event: 'Taunet Nelel Gala 2026', status: 'Confirmed', date: '18 Apr 2026' }
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

  function migrateMember(raw) {
    if (!raw) return null;
    const member = { ...raw };

    if (member.plan === 'both' || (member.associationMember && member.welfareMember)) {
      member.plan = 'both';
      member.planLabel = member.planLabel || 'Association + Welfare';
      member.associationMember = true;
      member.welfareMember = true;
      member.welfareRegistered = true;
      member.welfarePackage = member.welfarePackage || 'Welfare membership';
      member.welfareStatus = member.welfareStatus || 'active';
      member.welfareCover = member.welfareCover || 'Bereavement & hardship';
      if (member.welfareAlertsEnabled === undefined) member.welfareAlertsEnabled = true;
      return member;
    }

    // Stale localStorage / admin-approved welfare while plan column still "basic"
    if (
      member.planLabel === 'Association + Welfare' ||
      (member.welfareStatus === 'active' && member.welfarePackage)
    ) {
      member.plan = 'both';
      member.associationMember = true;
      member.welfareMember = true;
      member.welfareRegistered = true;
      member.welfareStatus = member.welfareStatus || 'active';
      member.welfarePackage = member.welfarePackage || 'Welfare membership';
      member.planLabel = 'Association + Welfare';
      if (member.welfareAlertsEnabled === undefined) member.welfareAlertsEnabled = true;
      return member;
    }

    if (member.plan === 'welfare' || member.welfareRegistered === true || member.welfareMember === true) {
      member.welfareRegistered = true;
      member.welfareMember = true;
      member.welfarePackage = member.welfarePackage || 'Welfare membership';
      member.welfareStatus = member.welfareStatus || 'active';
      member.welfareSince = member.welfareSince || member.memberSince || new Date().getFullYear().toString();
      member.welfareCover = member.welfareCover || 'Bereavement & hardship';
      if (member.welfareAlertsEnabled === undefined) member.welfareAlertsEnabled = true;
      if (member.plan !== 'welfare') {
        member.plan = 'welfare';
        member.planLabel = member.planLabel || 'Welfare';
      }
    }

    return member;
  }

  function getMember() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? migrateMember(JSON.parse(data)) : null;
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
    if (!member) return false;
    return (
      member.plan === 'welfare' ||
      member.plan === 'both' ||
      member.welfareMember === true ||
      member.welfareRegistered === true ||
      member.welfareStatus === 'active' ||
      member.welfareStatus === 'pending'
    );
  }

  function packageLabelFromValue(value) {
    if (value.includes('Family')) return 'Welfare Plus — Family household';
    if (value.includes('Bereavement')) return 'Welfare Bereavement — Standard';
    return 'Welfare Plus — Individual';
  }

  function isAuthPagePath(pathname) {
    return /\/members\/(auth|login|register)\.html/i.test(pathname || '');
  }

  function authPageUrl(tab) {
    const base = window.location.pathname.includes('/members/') ? '' : 'members/';
    return `${base}auth.html?tab=${tab || 'signin'}`;
  }

  function requireAuth() {
    const member = getMember();
    if (!member && !isAuthPagePath(window.location.pathname)) {
      window.location.href = authPageUrl('signin');
    }
    return member;
  }

  function authErrorMessage(error, context) {
    const raw = (error && (error.message || error.error_description || error.msg)) || '';
    const status = error?.status || error?.code;
    const lowered = String(raw).toLowerCase();
    const isRateLimited =
      status === 429 ||
      lowered.includes('rate limit') ||
      lowered.includes('too many requests') ||
      lowered.includes('over_email') ||
      lowered.includes('too many reset');

    if (isRateLimited) {
      if (context === 'password-reset') {
        return (
          'Too many password-reset attempts right now. Wait about an hour, then try again. ' +
          'If this keeps happening, ask Taunet Nelel IT to reset your password.'
        );
      }
      if (context === 'signup') {
        return (
          'Sign-up email is temporarily rate-limited. Wait a while and try again, ' +
          'or ask IT if custom SMTP / Resend is configured in Supabase.'
        );
      }
      return 'Too many requests right now. Please wait a short while and try again.';
    }
    return raw || 'Request failed.';
  }

  function showAuthMessage(form, text, isError) {
    let message = form.querySelector('.auth-form__message');
    if (!message) {
      message = document.createElement('p');
      message.className = 'auth-form__message';
      message.setAttribute('role', 'status');
      form.insertBefore(message, form.querySelector('button[type="submit"]'));
    }
    message.hidden = !text;
    message.textContent = text || '';
    message.classList.toggle('is-error', Boolean(isError));
  }

  function setSubmitBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = busy;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = busy ? 'Please wait…' : btn.dataset.originalText;
  }

  function redirectAfterAuth() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    const fallback = 'dashboard.html';
    const safe =
      window.TaunetSecurity?.safeRedirectPath?.(redirect, fallback) || fallback;
    window.location.href = safe;
  }

  function showResetPasswordPanel() {
    const tabs = document.querySelector('.auth-tabs');
    if (tabs) tabs.hidden = true;
    document.querySelectorAll('[data-auth-panel]').forEach((panel) => {
      const on = panel.getAttribute('data-auth-panel') === 'reset';
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
    document.title = 'Reset password | Taunet Nelel';
  }

  function isPasswordRecoveryContext(callbackType) {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const type = String(callbackType || params.get('type') || hash.get('type') || '').toLowerCase();
    return type === 'recovery';
  }

  async function initAuth() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const resetForm = document.getElementById('reset-password-form');
    const authApi = window.taunetMembersAuth;
    let authBusy = false;
    let recoveryMode = isPasswordRecoveryContext();

    if (authApi?.getClient) {
      try {
        const client = await authApi.getClient();
        client?.auth?.onAuthStateChange?.((event) => {
          if (event === 'PASSWORD_RECOVERY') {
            recoveryMode = true;
            showResetPasswordPanel();
          }
        });
      } catch (_) { /* ignore */ }
    }

    // Finish email-confirm / recovery redirects, then prefer live session
    if (authApi) {
      try {
        const callback = await authApi.handleAuthCallback();
        if (isPasswordRecoveryContext(callback?.type)) {
          recoveryMode = true;
        }
        const sessionMember = await authApi.getSessionMember();
        if (sessionMember && recoveryMode) {
          setMember(sessionMember);
          showResetPasswordPanel();
          if (resetForm) {
            showAuthMessage(resetForm, 'Choose a new password to finish resetting your account.', false);
          }
          // Do not send them to the dashboard until the new password is saved.
        } else if (sessionMember) {
          setMember(sessionMember);
          redirectAfterAuth();
          return;
        } else if (callback?.type === 'signup' || callback?.type === 'email') {
          if (loginForm) {
            showAuthMessage(
              loginForm,
              'Email confirmed. Sign in with the password you created.',
              false
            );
          }
        }
      } catch (error) {
        if (loginForm) {
          showAuthMessage(loginForm, authErrorMessage(error), true);
        } else {
          console.warn('Auth callback failed:', error);
        }
      }
    }

    if (resetForm && authApi) {
      resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (authBusy) return;
        const password = resetForm.querySelector('[name="password"]')?.value || '';
        const confirm = resetForm.querySelector('[name="password_confirm"]')?.value || '';
        if (password.length < 8) {
          showAuthMessage(resetForm, 'Password must be at least 8 characters.', true);
          return;
        }
        if (password !== confirm) {
          showAuthMessage(resetForm, 'Passwords do not match.', true);
          return;
        }
        authBusy = true;
        setSubmitBusy(resetForm, true);
        showAuthMessage(resetForm, '');
        try {
          await authApi.updatePassword(password);
          const member = await authApi.getSessionMember();
          if (member) setMember(member);
          showAuthMessage(resetForm, 'Password updated. Opening your dashboard…', false);
          window.setTimeout(() => redirectAfterAuth(), 600);
        } catch (error) {
          showAuthMessage(resetForm, authErrorMessage(error), true);
        } finally {
          authBusy = false;
          setSubmitBusy(resetForm, false);
        }
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (authBusy) return;
        const email = loginForm.querySelector('[name="email"]')?.value?.trim();
        const password = loginForm.querySelector('[name="password"]')?.value || '';

        if (!authApi || !window.taunetSupabaseApi?.isConfigured()) {
          showAuthMessage(loginForm, 'Member login is not connected yet. Check supabase-config.js.', true);
          return;
        }

        authBusy = true;
        setSubmitBusy(loginForm, true);
        showAuthMessage(loginForm, '');
        try {
          const member = await authApi.signIn(email, password);
          setMember(member);
          redirectAfterAuth();
        } catch (error) {
          showAuthMessage(loginForm, authErrorMessage(error), true);
        } finally {
          authBusy = false;
          setSubmitBusy(loginForm, false);
        }
      });

      const forgotBtn = document.getElementById('forgot-password');
      forgotBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (authBusy) return;
        const email = loginForm.querySelector('[name="email"]')?.value?.trim();
        if (!email) {
          showAuthMessage(loginForm, 'Enter your email first, then click Forgot password.', true);
          return;
        }
        if (!authApi) return;
        authBusy = true;
        try {
          await authApi.requestPasswordReset(email);
          showAuthMessage(
            loginForm,
            'If that email has an account, a reset link was sent. Check inbox and spam (from members@taunetnelel.org).',
            false
          );
        } catch (error) {
          showAuthMessage(loginForm, authErrorMessage(error, 'password-reset'), true);
        } finally {
          authBusy = false;
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (authBusy) return;
        const name = registerForm.querySelector('[name="name"]')?.value?.trim() || '';
        const email = registerForm.querySelector('[name="email"]')?.value?.trim() || '';
        const phone = registerForm.querySelector('[name="phone"]')?.value?.trim() || '';
        const password = registerForm.querySelector('[name="password"]')?.value || '';
        const plan = registerForm.querySelector('[name="plan"]:checked')?.value
          || registerForm.querySelector('[name="plan"]')?.value
          || 'basic';

        if (!authApi || !window.taunetSupabaseApi?.isConfigured()) {
          showAuthMessage(registerForm, 'Registration is not connected yet. Check supabase-config.js.', true);
          return;
        }

        authBusy = true;
        setSubmitBusy(registerForm, true);
        showAuthMessage(registerForm, '');
        try {
          const result = await authApi.signUp({ name, email, phone, password, plan });
          if (result.needsEmailConfirmation) {
            showAuthMessage(
              registerForm,
              'Account created. Check your email to confirm, then sign in. If your email is on the member list, your membership will be applied automatically.',
              false
            );
            return;
          }
          setMember(result.member);
          redirectAfterAuth();
        } catch (error) {
          showAuthMessage(registerForm, authErrorMessage(error, 'signup'), true);
        } finally {
          authBusy = false;
          setSubmitBusy(registerForm, false);
        }
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
    const badge = document.getElementById('welfare-status-badge');
    const topbarStatus = document.getElementById('welfare-topbar-status');

    const statusLabel = status === 'active' ? 'Active'
      : status === 'pending' ? 'Pending approval'
        : status === 'expired' ? 'Expired' : 'Not enrolled';

    chips.forEach((chip) => {
      chip.textContent = statusLabel;
    });

    if (badge) {
      badge.dataset.status = status;
      badge.classList.remove('welfare-status-badge--active', 'welfare-status-badge--pending', 'welfare-status-badge--expired');
      if (status === 'active') badge.classList.add('welfare-status-badge--active');
      else if (status === 'pending') badge.classList.add('welfare-status-badge--pending');
      else if (status === 'expired') badge.classList.add('welfare-status-badge--expired');
    }

    if (topbarStatus) {
      if (status === 'active' || status === 'pending') {
        topbarStatus.hidden = false;
        topbarStatus.textContent = statusLabel;
        topbarStatus.classList.remove('status-chip--active', 'status-chip--pending', 'status-chip--welfare');
        topbarStatus.classList.add(status === 'active' ? 'status-chip--active' : 'status-chip--pending');
      } else {
        topbarStatus.hidden = true;
      }
    }

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
    const liveAlert = document.getElementById('welfare-live-alert');
    const liveAlertText = document.getElementById('welfare-live-alert-text');
    if (!list) return;

    const enabled = member.welfareAlertsEnabled !== false;
    if (toggle) toggle.checked = enabled;

    const alertsSection = document.getElementById('welfare-alerts');
    const alertsList = document.getElementById('welfare-alert-list');

    if (!enabled) {
      if (liveAlert) liveAlert.hidden = true;
      if (alertsList) {
        alertsList.innerHTML = '<li class="welfare-alert-list__empty">Alerts are turned off. Turn on the toggle above to receive reimbursement notifications.</li>';
      }
      return;
    }

    if (alertsSection) alertsSection.hidden = false;

    const latest = WELFARE_ALERTS[0];
    const dismissed = sessionStorage.getItem('taunet_welfare_alert_dismissed') === latest.id;

    if (liveAlert && liveAlertText && !dismissed) {
      liveAlert.hidden = false;
      liveAlertText.textContent = `A social welfare member (${latest.member}) received a ${latest.type.toLowerCase()} of ${latest.amount} on ${latest.date}.`;
    } else if (liveAlert) {
      liveAlert.hidden = true;
    }

    if (list.children.length === 0) {
      WELFARE_ALERTS.forEach((alert, index) => {
        const item = document.createElement('li');
        item.className = `welfare-alert-item${index === 0 ? ' welfare-alert-item--new' : ''}`;
        item.dataset.alertId = alert.id;
        item.innerHTML = `
          <div class="welfare-alert-item__icon" aria-hidden="true">&#9888;</div>
          <div class="welfare-alert-item__body">
            <p class="welfare-alert-item__title">${alert.type} — ${alert.amount}</p>
            <p class="welfare-alert-item__meta">${alert.member} · ${alert.date} · <span class="status-chip status-chip--active">${alert.status}</span>${index === 0 ? ' <span class="welfare-alert-item__new">New</span>' : ''}</p>
          </div>
        `;
        list.appendChild(item);
      });
    }
  }

  function initWelfareLiveAlert() {
    const dismiss = document.getElementById('welfare-live-alert-dismiss');
    const liveAlert = document.getElementById('welfare-live-alert');
    dismiss?.addEventListener('click', () => {
      if (liveAlert) liveAlert.hidden = true;
      sessionStorage.setItem('taunet_welfare_alert_dismissed', WELFARE_ALERTS[0].id);
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

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const msg = document.getElementById('welfare-register-message');
      const submitBtn = form.querySelector('button[type="submit"]');
      const packageSelect = form.querySelector('[name="welfare_package"]');
      const packageValue = packageSelect?.value || '';
      const honeypot = form.querySelector('[name="_honey"]');
      if (honeypot?.value) return;

      const current = getMember() || member;
      const nameInput = form.querySelector('[name="name"]');
      const emailInput = form.querySelector('[name="email"]');
      if (nameInput && !nameInput.value) nameInput.value = current.name || '';
      if (emailInput && !emailInput.value) emailInput.value = current.email || '';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
        submitBtn.textContent = 'Submitting…';
      }

      try {
        const api = window.taunetSupabaseApi;
        if (!api?.isConfigured()) {
          throw new Error('Supabase is not configured.');
        }
        const client = await api.ensureClient();
        if (!client) throw new Error('Could not connect to Supabase.');

        const formData = new FormData(form);
        const metadata = {};
        formData.forEach((value, key) => {
          if (!value || key.startsWith('_') || ['name', 'email', 'phone', 'message'].includes(key)) return;
          metadata[key] = String(value).trim();
        });

        const { error } = await client.from('form_submissions').insert({
          form_type: 'welfare',
          name: String(formData.get('name') || current.name || '').trim() || null,
          email: String(formData.get('email') || current.email || '').trim() || null,
          phone: String(formData.get('phone') || current.phone || '').trim() || null,
          message: String(formData.get('message') || '').trim() || null,
          metadata
        });
        if (error) throw error;

        const updated = {
          ...current,
          welfareRegistered: true,
          welfareStatus: 'pending',
          welfarePackage: packageLabelFromValue(packageValue),
          welfareSince: new Date().getFullYear().toString(),
          welfareCover: packageValue.includes('Bereavement') ? 'Bereavement only' : 'Bereavement & hardship',
          welfareAlertsEnabled: true
        };
        setMember(updated);

        if (msg) {
          msg.hidden = false;
          msg.classList.remove('is-error');
          msg.textContent = msg.dataset.success
            || 'Thank you! Your welfare registration has been submitted. The Welfare Committee will confirm your enrolment within 3 business days.';
        }

        form.querySelectorAll('input, select, textarea, button').forEach((el) => {
          if (el.type === 'hidden' || el.name === '_honey') return;
          el.disabled = true;
        });
        renderWelfareStatus(updated);
        summary?.removeAttribute('hidden');
        upgradeBtn?.setAttribute('hidden', '');
      } catch (error) {
        console.error('Welfare registration failed:', error);
        if (msg) {
          msg.hidden = false;
          msg.classList.add('is-error');
          msg.textContent = 'Sorry, your welfare registration could not be sent. Please try again or email info@taunetnelel.org.';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || 'Submit welfare registration';
        }
      }
    });
  }

  function initWelfarePortal(member) {
    const toggle = document.getElementById('welfare-alerts-enabled');
    toggle?.addEventListener('change', () => {
      const updated = { ...getMember(), welfareAlertsEnabled: toggle.checked };
      setMember(updated);
      renderWelfareAlerts(updated);
    });

    initWelfareLiveAlert();
    renderWelfareStatus(member);
    renderWelfareAlerts(member);
  }

  function showWelfareSection(member) {
    const isWelfare = isWelfareMember(member);
    const welfareGate = document.getElementById('welfare-gate');
    const welfareContent = document.getElementById('welfare-content');

    if (!welfareGate || !welfareContent) return;

    if (isWelfare) {
      welfareGate.hidden = true;
      welfareGate.setAttribute('hidden', '');
      welfareContent.hidden = false;
      welfareContent.removeAttribute('hidden');
      initWelfarePortal(member);
    } else {
      welfareGate.hidden = false;
      welfareGate.removeAttribute('hidden');
      welfareContent.hidden = true;
      welfareContent.setAttribute('hidden', '');
    }
  }

  function renderMemberRegistrations(member) {
    const list = document.querySelector('[data-member-registrations]');
    if (!list || !window.TaunetEventsPhases) return;

    const groups = window.TaunetEventsPhases.categorizeEvents();
    const allEvents = [...groups.upcoming, ...groups.present, ...groups['most-recent'], ...groups.past];
    const registered = allEvents.filter((event) =>
      member.registrations?.some((r) => r.eventId === event.id || r.event === event.title)
    );

    if (!registered.length) {
      list.innerHTML = '<li><span>No registrations yet</span></li>';
      return;
    }

    list.innerHTML = registered.map((event) => {
      const reg = member.registrations.find((r) => r.eventId === event.id || r.event === event.title);
      const phase = window.TaunetEventsPhases.getEventPhase(event);
      const chipClass = phase === 'present' ? 'status-chip--active' : phase === 'upcoming' ? 'status-chip--active' : 'status-chip--pending';
      const chipText = reg?.status || (phase === 'past' ? 'Attended' : phase === 'present' ? 'Live' : 'Confirmed');
      return `<li><span>${event.title}</span><span class="status-chip ${chipClass}">${chipText}</span></li>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadAnnouncements(member) {
    const root = document.querySelector('[data-announcements-list]');
    if (!root) return;

    const fallback = `<p style="margin:0;color:var(--color-muted,#5a4b3c);">No announcements yet. Committee updates will appear here.</p>`;

    try {
      const client = await window.taunetSupabaseApi?.ensureClient?.();
      if (!client) {
        root.innerHTML = fallback;
        return;
      }
      const { data, error } = await client
        .from('announcements')
        .select('id,title,body,audience,published_at')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(5);
      if (error || !data?.length) {
        root.innerHTML = fallback;
        return;
      }

      const isWelfare = isWelfareMember(member);
      const filtered = data.filter((row) => {
        if (row.audience === 'welfare') return isWelfare;
        if (row.audience === 'association') return Boolean(member?.associationMember) || !isWelfare;
        return true;
      });

      if (!filtered.length) {
        root.innerHTML = fallback;
        return;
      }

      root.innerHTML = filtered
        .map((row) => {
          const when = row.published_at
            ? new Date(row.published_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              })
            : '';
          return `<article class="announce-item" style="margin-bottom:1rem;">
            <h3 style="margin:0 0 0.25rem;font-size:1.05rem;">${escapeHtml(row.title)}</h3>
            ${when ? `<p class="meta" style="margin:0 0 0.35rem;font-size:0.85rem;">${escapeHtml(when)}</p>` : ''}
            <p style="margin:0;white-space:pre-wrap;">${escapeHtml(row.body)}</p>
          </article>`;
        })
        .join('');
    } catch (error) {
      console.warn('Announcements load skipped:', error);
      root.innerHTML = fallback;
    }
  }

  async function loadMemberResources() {
    const root = document.querySelector('[data-member-resources]');
    if (!root) return;

    try {
      const client = await window.taunetSupabaseApi?.ensureClient?.();
      if (!client) return;
      const { data, error } = await client
        .from('member_resources')
        .select('id,title,description,category,file_type,file_url,sort_order')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });
      if (error || !data?.length) return;

      root.innerHTML = data
        .map((row) => {
          const label = row.file_type === 'VID' ? 'Watch' : row.file_type === 'LINK' ? 'Open' : 'Open';
          return `<div class="resource-item">
            <div class="file-icon">${escapeHtml(row.file_type || 'DOC')}</div>
            <div><strong>${escapeHtml(row.title)}</strong><br><span class="meta">${escapeHtml(row.category || '')}${row.description ? ' · ' + escapeHtml(row.description) : ''}</span></div>
            <a class="btn btn--ghost" href="${escapeHtml(row.file_url)}" ${row.file_url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${label}</a>
          </div>`;
        })
        .join('');
    } catch (error) {
      console.warn('Resources load skipped:', error);
    }
  }

  function initDashboard() {
    const member = requireAuth();
    if (!member) return;

    populateMemberFields(member);

    showWelfareSection(member);

    initWelfareRegister(member);

    if (window.TaunetEventsPhases) {
      window.TaunetEventsPhases.initMemberEvents(member);
      renderMemberRegistrations(member);
    }

    loadAnnouncements(member);
    loadMemberResources();

    const welfareQuickAction = document.querySelector('.quick-actions [data-welfare-only]');
    const isWelfare = isWelfareMember(member);
    if (welfareQuickAction && !isWelfare) {
      welfareQuickAction.textContent = 'Register for Welfare';
      welfareQuickAction.href = 'dashboard.html#welfare-register-card';
    }

    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.querySelector('[name="name"]').value = member.name;
      profileForm.querySelector('[name="email"]').value = member.email;
      profileForm.querySelector('[name="phone"]').value = member.phone || '';
      profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = profileForm.querySelector('[name="name"]').value;
        const phone = profileForm.querySelector('[name="phone"]').value;
        const email = profileForm.querySelector('[name="email"]').value;
        const submitBtn = profileForm.querySelector('[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
          let updated = { ...member, name, email, phone };
          if (window.taunetMembersAuth?.updateProfile && member.id) {
            updated = await window.taunetMembersAuth.updateProfile({ fullName: name, phone });
          }
          setMember(updated);
          populateMemberFields(updated);
          alert('Profile updated successfully.');
        } catch (error) {
          console.warn('Profile save failed, kept local copy:', error);
          setMember({ ...member, name, email, phone });
          alert(error.message || 'Could not save to the server. Changes kept on this device.');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    document.getElementById('logout-btn')?.addEventListener('click', async (e) => {
      e.preventDefault();
      clearPreviewMode();
      clearMember();
      try {
        await window.taunetMembersAuth?.signOut();
      } catch (error) {
        console.warn('Sign out error:', error);
      }
      window.location.href = authPageUrl('signin');
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

  async function bootMembersArea() {
    const path = window.location.pathname;
    const onAuthPage = isAuthPagePath(path);

    if (onAuthPage) {
      if (new URLSearchParams(window.location.search).get('exit') === 'preview') {
        clearPreviewMode();
        clearMember();
        try {
          await window.taunetMembersAuth?.signOut();
        } catch (_) { /* ignore */ }
        history.replaceState(null, '', 'auth.html?tab=signin');
      }
      await initAuth();
      return;
    }

    if (!path.includes('members')) return;

    // Preview mode still works without Auth
    if (applyPreviewMode()) {
      initDashboard();
      showPreviewBanner();
      initMobileSidebar();
      initInquirySuccess();
      return;
    }

    // Restore session from Supabase when available
    if (window.taunetMembersAuth && window.taunetSupabaseApi?.isConfigured()) {
      try {
        await window.taunetMembersAuth.handleAuthCallback();
        const sessionMember = await window.taunetMembersAuth.getSessionMember();
        if (sessionMember) {
          setMember(sessionMember);
        } else if (!getMember()) {
          requireAuth();
          return;
        }
      } catch (error) {
        console.warn('Could not restore member session:', error);
        if (!getMember()) {
          requireAuth();
          return;
        }
      }
    } else if (!getMember()) {
      requireAuth();
      return;
    }

    initDashboard();
    showPreviewBanner();
    initMobileSidebar();
    initInquirySuccess();
  }

  bootMembersArea();
})();
