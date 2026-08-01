/**
 * Supabase Auth helpers for the members area.
 * Depends on supabase-config.js + supabase-init.js (taunetSupabaseApi).
 */
(function (global) {
  'use strict';

  function planLabel(plan, association, welfare) {
    if (plan === 'both' || (association && welfare)) return 'Association + Welfare';
    if (plan === 'welfare' || welfare) return 'Welfare';
    return 'Association (Standard)';
  }

  function profileToMember(profile, email) {
    const association = Boolean(profile?.association_member) || profile?.plan === 'basic' || profile?.plan === 'both';
    const welfare = Boolean(profile?.welfare_member) || profile?.plan === 'welfare' || profile?.plan === 'both';
    let plan = profile?.plan || 'basic';
    if (association && welfare) plan = 'both';
    else if (welfare && !association) plan = 'welfare';
    else if (association) plan = plan === 'welfare' ? 'both' : 'basic';

    return {
      id: profile?.id || null,
      name: profile?.full_name || email || 'Member',
      email: profile?.email || email || '',
      phone: profile?.phone || '',
      plan,
      planLabel: planLabel(plan, association, welfare),
      associationMember: association,
      welfareMember: welfare,
      welfareRegistered: welfare,
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
    return profileToMember(data || { full_name: '', email }, email);
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
    const type = search.get('type') || hash.get('type');
    const errorCode = search.get('error_code') || hash.get('error_code');
    const errorDescription = search.get('error_description') || hash.get('error_description');

    if (errorDescription || errorCode) {
      const msg = errorDescription
        ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
        : String(errorCode);
      // Clear bad tokens from the address bar so refresh doesn't re-show the error
      const clean = `${window.location.pathname}?tab=signin`;
      window.history.replaceState({}, document.title, clean);
      throw new Error(msg);
    }

    if (code) {
      const { data, error } = await client.auth.exchangeCodeForSession(window.location.href);
      if (error) throw error;
      const resolvedType = type || 'email';
      // Keep type=recovery in the URL so the reset form can detect it after reload
      const keep =
        resolvedType === 'recovery'
          ? `${window.location.pathname}?tab=signin&type=recovery`
          : `${window.location.pathname}?tab=signin`;
      window.history.replaceState({}, document.title, keep);
      return { type: resolvedType, session: data?.session || null };
    }

    // Implicit / hash recovery links (#access_token=...&type=recovery)
    if (hash.get('access_token') && client.auth.getSession) {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data?.session) {
        const resolvedType = type || 'email';
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

  async function signIn(email, password) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');

    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) throw error;

    return fetchProfile(client, data.user.id, data.user.email);
  }

  async function signUp({ name, email, phone, password, plan }) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');

    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name,
          phone: phone || '',
          // Server handle_new_user ignores client plan for non-imported emails
          plan: 'basic'
        },
        // After confirm, land on dashboard (session tokens / code are handled there)
        emailRedirectTo: `${window.location.origin}/members/dashboard.html`
      }
    });
    if (error) throw error;

    // If email confirmation is required, session may be null
    if (!data.session || !data.user) {
      return { needsEmailConfirmation: true, member: null };
    }

    const member = await fetchProfile(client, data.user.id, data.user.email);
    return { needsEmailConfirmation: false, member };
  }

  async function signOut() {
    const client = await getClient();
    if (!client) return;
    await client.auth.signOut();
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

  async function updatePassword(newPassword) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');
    const password = String(newPassword || '');
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    const { data, error } = await client.auth.updateUser({ password });
    if (error) throw error;
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
    updatePassword,
    updateProfile,
    profileToMember,
    planLabel
  };
})(window);
