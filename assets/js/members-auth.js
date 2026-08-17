/**
 * Supabase Auth helpers for the members area.
 * Depends on supabase-config.js + supabase-init.js (taunetSupabaseApi).
 */
(function (global) {
  'use strict';

  function planLabel(plan, association, welfare) {
    if (plan === 'both' || (association && welfare)) return 'Association + Welfare';
    if (plan === 'welfare' || welfare) return 'Welfare';
    return 'Association';
  }

  function profileToMember(profile, email) {
    // Trust DB flags only — plan='basic' alone must NOT unlock the portal
    const association = Boolean(profile?.association_member);
    const welfare = Boolean(profile?.welfare_member);
    let plan = profile?.plan || 'basic';
    if (association && welfare) plan = 'both';
    else if (welfare && !association) plan = 'welfare';
    else if (association) plan = 'basic';
    else plan = 'basic';

    const label =
      association || welfare
        ? planLabel(plan, association, welfare)
        : 'Pending payment';

    return {
      id: profile?.id || null,
      name: profile?.full_name || email || 'Member',
      email: profile?.email || email || '',
      phone: profile?.phone || '',
      plan,
      planLabel: label,
      associationMember: association,
      welfareMember: welfare,
      welfareRegistered: welfare,
      membershipPending: !association && !welfare,
      memberNumber: profile?.member_number || '',
      memberSince: profile?.member_since ? String(profile.member_since) : '',
      renews: profile?.renews_at || '',
      welfarePackage: welfare ? 'Welfare membership' : undefined,
      welfareStatus: welfare ? 'active' : undefined,
      welfareSince: welfare ? (profile?.member_since ? String(profile.member_since) : '') : undefined,
      welfareCover: welfare ? 'Bereavement & hardship' : undefined,
      welfareAlertsEnabled: welfare,
      registrations: []
    };
  }

  async function getClient() {
    const api = global.taunetSupabaseApi;
    if (!api || !api.isConfigured()) return null;
    return api.ensureClient();
  }

  async function fetchProfile(client, userId, email) {
    const { data, error } = await client
      .from('profiles')
      .select('id,full_name,email,phone,plan,association_member,welfare_member,member_number,member_since,renews_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return profileToMember(data, email);

    // Trigger may have missed — create a pending profile so Admin can see the member
    const ensured = await ensureProfile(client, userId, email);
    return profileToMember(ensured || { full_name: '', email }, email);
  }

  async function ensureProfile(client, userId, email) {
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user || user.id !== userId) return null;

    const meta = user.user_metadata || {};
    const row = {
      id: userId,
      email: String(email || user.email || '')
        .trim()
        .toLowerCase(),
      full_name: String(meta.full_name || '').trim(),
      phone: String(meta.phone || '').trim() || null,
      plan: 'basic',
      association_member: false,
      welfare_member: false,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select(
        'id,full_name,email,phone,plan,association_member,welfare_member,member_number,member_since,renews_at'
      )
      .maybeSingle();

    if (error) {
      console.warn('ensureProfile failed:', error.message || error);
      return null;
    }
    return data;
  }

  /**
   * Finish email-confirm / magic-link / recovery redirects from Supabase.
   * Call before reading the session on login or dashboard pages.
   */
  async function handleAuthCallback() {
    const client = await getClient();
    if (!client) return { type: null, session: null };

    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = search.get('code');
    const tokenHash = search.get('token_hash');
    const type = search.get('type') || hash.get('type');
    const errorCode = search.get('error_code') || hash.get('error_code');
    const errorDescription = search.get('error_description') || hash.get('error_description');

    // token_hash links: do NOT verify yet (email scanners only GET the page).
    // UI shows Continue → verifyRecoveryTokenHash().
    if (tokenHash && !code && !errorDescription && !errorCode) {
      return {
        type: type || 'recovery',
        session: null,
        tokenHash,
        pendingVerify: true
      };
    }

    if (errorDescription || errorCode) {
      const msg = errorDescription
        ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
        : String(errorCode);
      const wasRecovery =
        String(type || '').toLowerCase() === 'recovery' ||
        /otp_expired|expired|invalid/i.test(msg);
      // Keep type=recovery so the UI shows the reset panel (not only Sign in).
      const clean = wasRecovery
        ? `${window.location.pathname}?tab=signin&type=recovery`
        : `${window.location.pathname}?tab=signin`;
      window.history.replaceState({}, document.title, clean);
      const err = new Error(msg);
      err.authType = wasRecovery ? 'recovery' : type;
      err.expired = /invalid|expired|otp_expired/i.test(msg);
      throw err;
    }

    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(window.location.href);
      if (error) {
        const err = new Error(error.message || 'Auth link failed');
        err.authType = type || 'recovery';
        err.expired = /invalid|expired|otp_expired|flow_state/i.test(String(error.message || ''));
        throw err;
      }
      const resolvedType = type || 'email';
      // Keep type=recovery in the URL so the reset form can detect it after reload
      const keep =
        resolvedType === 'recovery'
          ? `${window.location.pathname}?tab=signin&type=recovery`
          : `${window.location.pathname}?tab=signin`;
      window.history.replaceState({}, document.title, keep);
      return { type: resolvedType, session: data?.session || null };
    }

    // Implicit / hash recovery links (#access_token=...&refresh_token=...&type=recovery)
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (accessToken && refreshToken) {
      const { data, error } = await client.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) {
        const err = new Error(error.message || 'Could not open reset session');
        err.authType = type || 'recovery';
        err.expired = true;
        throw err;
      }
      const resolvedType = type || 'recovery';
      const keep =
        resolvedType === 'recovery'
          ? `${window.location.pathname}?tab=signin&type=recovery`
          : `${window.location.pathname}?tab=signin`;
      window.history.replaceState({}, document.title, keep);
      return { type: resolvedType, session: data?.session || null };
    }

    if (accessToken) {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data?.session) {
        const resolvedType = type || 'recovery';
        const keep =
          resolvedType === 'recovery'
            ? `${window.location.pathname}?tab=signin&type=recovery`
            : `${window.location.pathname}?tab=signin`;
        window.history.replaceState({}, document.title, keep);
        return { type: resolvedType, session: data.session };
      }
    }

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return { type, session: data?.session || null };
  }

  async function getSessionMember() {
    const client = await getClient();
    if (!client) return null;

    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const session = data?.session;
    if (!session?.user) return null;

    return fetchProfile(client, session.user.id, session.user.email);
  }

  function clearLocalAuthStorage() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('sb-') && key.includes('auth')) {
          localStorage.removeItem(key);
        }
      });
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Drop a stale / revoked local session before password login.
   * After long idle, a dead refresh token in localStorage can make the next
   * signInWithPassword fail with "Invalid login credentials" even when the
   * password is correct.
   */
  async function clearLocalSession(client) {
    if (!client) {
      clearLocalAuthStorage();
      return;
    }
    try {
      await Promise.race([
        client.auth.signOut({ scope: 'local' }),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch (_) {
      /* continue — wipe storage below */
    }
    clearLocalAuthStorage();
  }

  async function signIn(email, password) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');

    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();
    // Trim only leading/trailing whitespace (chat/email paste often adds a newline).
    const normalizedPassword = String(password || '').replace(/^\s+|\s+$/g, '');
    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Enter your email and password.');
    }

    await clearLocalSession(client);

    const { data, error } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password: normalizedPassword,
    });
    if (error) throw error;

    return fetchProfile(client, data.user.id, data.user.email);
  }

  async function sendConfirmEmail(email, fullName) {
    const trimmed = String(email || '')
      .trim()
      .toLowerCase();
    if (!trimmed) return null;

    const resp = await fetch('/api/auth/send-confirm-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: trimmed,
        fullName: String(fullName || '').trim(),
      }),
    });
    let payload = {};
    try {
      payload = await resp.json();
    } catch (_) {
      payload = {};
    }
    if (!resp.ok) {
      console.warn('send-confirm-email failed:', payload.error || resp.status);
      return null;
    }
    return payload;
  }

  async function signUp({ name, email, phone, password, plan }) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');

    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();

    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: name,
          phone: phone || '',
          // Server handle_new_user ignores client plan for non-imported emails
          plan: 'basic'
        },
        // Branded confirm mail uses portal auth page (scanner-safe token_hash).
        emailRedirectTo: `${window.location.origin}/members/auth.html?tab=signin&type=signup`
      }
    });
    if (error) throw error;

    // Existing email: Supabase may return a user with empty identities and no session
    if (
      data?.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      const err = new Error('User already registered');
      err.status = 422;
      throw err;
    }

    // If email confirmation is required, session may be null — send branded Resend mail
    // (Supabase's default Confirm template should be stubbed in the dashboard).
    if (!data.session || !data.user) {
      await sendConfirmEmail(normalizedEmail, name);
      return { needsEmailConfirmation: true, member: null };
    }

    // Some projects auto-confirm; still send branded confirm if user is unconfirmed.
    if (data.user && !data.user.email_confirmed_at && !data.user.confirmed_at) {
      await sendConfirmEmail(normalizedEmail, name);
      const member = await fetchProfile(client, data.user.id, data.user.email);
      return { needsEmailConfirmation: true, member };
    }

    const member = await fetchProfile(client, data.user.id, data.user.email);
    return { needsEmailConfirmation: false, member };
  }

  /**
   * @param {{ global?: boolean }} [options]
   * Default is local-only. Fire-and-forget global signOut previously raced with
   * the next login and could revoke a freshly issued refresh token.
   */
  async function signOut(options) {
    const client = await getClient();
    if (!client) {
      clearLocalAuthStorage();
      return;
    }
    const scope = options && options.global ? 'global' : 'local';
    try {
      await Promise.race([
        client.auth.signOut({ scope }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch (_) {
      /* continue — clear storage below */
    }
    clearLocalAuthStorage();
  }

  /**
   * Ask the server to email a recovery link via Resend.
   * (Browser-only Supabase reset often shows "sent" even when mail never arrives.)
   */
  async function requestPasswordReset(email) {
    const trimmed = String(email || '').trim();
    if (!trimmed) throw new Error('Enter your email first, then click Forgot password.');

    const resp = await fetch('/api/auth/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed })
    });

    let payload = {};
    try {
      payload = await resp.json();
    } catch (_) {
      payload = {};
    }

    if (!resp.ok) {
      throw new Error(
        payload.error ||
          'Could not send a reset email. Please try again later or contact Taunet Nelel IT.'
      );
    }
    return payload;
  }

  /**
   * Exchange email token_hash for a recovery session (call on user Continue click).
   */
  async function verifyRecoveryTokenHash(tokenHash, linkType) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');
    const hash = String(tokenHash || '').trim();
    if (!hash) throw new Error('Missing reset token. Request a fresh password email.');

    const rawType = String(linkType || 'recovery').toLowerCase();
    let otpType = 'recovery';
    if (rawType === 'invite') otpType = 'invite';
    else if (rawType === 'signup' || rawType === 'email' || rawType === 'confirmation') {
      otpType = 'signup';
    }
    const { data, error } = await client.auth.verifyOtp({
      token_hash: hash,
      type: otpType
    });
    if (error) {
      const err = new Error(error.message || 'This reset link is no longer valid.');
      err.authType = otpType === 'signup' ? 'signup' : 'recovery';
      err.expired = /invalid|expired|otp_expired/i.test(String(error.message || ''));
      throw err;
    }

    const keepType = otpType === 'signup' ? 'signup' : otpType === 'invite' ? 'invite' : 'recovery';
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}?tab=signin&type=${keepType}`
    );
    return { type: keepType, session: data?.session || null };
  }

  async function updatePassword(newPassword) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');
    const password = String(newPassword || '').replace(/^\s+|\s+$/g, '');
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;

    // Confirm the new password works the same way the login form will
    // (anon-key password grant), so a "saved" password that Auth rejected
    // cannot look successful in the UI.
    const email = String(data?.user?.email || '').trim().toLowerCase();
    if (email) {
      await clearLocalSession(client);
      const verify = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (verify.error) {
        throw new Error(
          'Password was not accepted by the login service. Choose a different password (at least 8 characters) and try again.'
        );
      }
    }

    return data?.user || null;
  }

  async function updateProfile({ fullName, phone }) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = sessionData?.session?.user?.id;
    if (!userId) throw new Error('You must be signed in to update your profile.');

    const { data, error } = await client
      .from('profiles')
      .update({
        full_name: String(fullName || '').trim(),
        phone: String(phone || '').trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('id,full_name,email,phone,plan,association_member,welfare_member,member_number,member_since,renews_at')
      .maybeSingle();

    if (error) throw error;
    const email = data?.email || sessionData.session.user.email || '';
    return profileToMember(data || { full_name: fullName, email, phone }, email);
  }

  global.taunetMembersAuth = {
    getClient,
    handleAuthCallback,
    getSessionMember,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    sendConfirmEmail,
    verifyRecoveryTokenHash,
    updatePassword,
    updateProfile,
    profileToMember,
    planLabel
  };
})(window);
