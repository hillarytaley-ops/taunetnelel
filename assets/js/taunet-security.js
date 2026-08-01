/**
 * Shared XSS / redirect helpers for public and members pages.
 */
(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value, options) {
    const allowRelative = !options || options.allowRelative !== false;
    const s = String(value ?? '').trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('vbscript:') ||
      lower.startsWith('file:')
    ) {
      return '';
    }
    if (s.startsWith('//')) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (allowRelative && (s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || s.startsWith('#') || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s))) {
      return s;
    }
    return '';
  }

  /** Only same-site relative paths (blocks open redirects). */
  function safeRedirectPath(value, fallback) {
    const s = String(value ?? '').trim();
    const fb = fallback || '/';
    if (!s) return fb;
    const lower = s.toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('data:') ||
      lower.startsWith('vbscript:') ||
      s.startsWith('//') ||
      /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)
    ) {
      return fb;
    }
    if (s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || /^[A-Za-z0-9._~/#?&=%+-]+$/.test(s)) {
      return s;
    }
    return fb;
  }

  function safeDomId(value) {
    return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  global.TaunetSecurity = {
    escapeHtml,
    safeUrl,
    safeRedirectPath,
    safeDomId
  };
})(window);
