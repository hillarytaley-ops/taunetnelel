/**
 * If Supabase drops auth/recovery links on the site root (Site URL),
 * forward tokens to the member auth page so the reset form can open.
 */
(function () {
  try {
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    if (!search && !hash) return;

    var q = new URLSearchParams(search);
    var h = new URLSearchParams(hash.charAt(0) === '#' ? hash.slice(1) : hash);
    var type = q.get('type') || h.get('type') || '';
    var isAuth =
      q.has('code') ||
      q.has('token_hash') ||
      h.has('access_token') ||
      type === 'recovery' ||
      type === 'signup' ||
      type === 'invite' ||
      type === 'magiclink' ||
      q.has('error_description') ||
      h.has('error_description') ||
      q.has('error_code') ||
      h.has('error_code');

    if (!isAuth) return;

    // Already on the auth page — do nothing
    if (/\/members\/auth\.html$/i.test(window.location.pathname)) return;

    var dest = new URL('members/auth.html', window.location.href);
    dest.searchParams.set('tab', 'signin');
    if (type) {
      dest.searchParams.set('type', type);
    } else if (h.has('access_token')) {
      // Implicit recovery/invite tokens without type still need the auth page
      dest.searchParams.set('type', 'recovery');
    }
    q.forEach(function (value, key) {
      if (key === 'tab') return;
      dest.searchParams.set(key, value);
    });
    window.location.replace(dest.pathname + dest.search + hash);
  } catch (_) {
    /* ignore */
  }
})();
