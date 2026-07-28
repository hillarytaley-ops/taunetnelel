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
    const plan = profile?.plan || (association && welfare ? 'both' : welfare ? 'welfare' : 'basic');

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
          plan: plan || 'basic'
        },
        emailRedirectTo: `${window.location.origin}/members/login.html`
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

  async function requestPasswordReset(email) {
    const client = await getClient();
    if (!client) throw new Error('Supabase is not configured.');

    const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/members/login.html`
    });
    if (error) throw error;
  }

  global.taunetMembersAuth = {
    getClient,
    getSessionMember,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    profileToMember,
    planLabel
  };
})(window);
