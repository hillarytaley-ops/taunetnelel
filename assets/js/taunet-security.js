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

  function setButtonBusy(btn, busy, opts) {
    if (!btn) return;
    const options = opts || {};
    if (busy) {
      if (btn.dataset.idleLabel == null) {
        btn.dataset.idleLabel = String(btn.textContent || btn.value || '').trim();
      }
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.classList.add('is-busy');
      btn.classList.remove('is-done', 'is-fail');
      const label = options.busy || 'Sending…';
      if (btn.tagName === 'INPUT') btn.value = label;
      else btn.textContent = label;
      return;
    }
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-busy');
    const idle = btn.dataset.idleLabel || options.idle || '';
    const applyIdle = () => {
      btn.classList.remove('is-done', 'is-fail');
      if (btn.dataset.stayDone === '1') {
        btn.classList.add('is-done');
        btn.classList.remove('btn--ghost');
      }
      if (btn.tagName === 'INPUT') btn.value = idle;
      else if (idle) btn.textContent = idle;
    };
    if (options.done) {
      btn.classList.add('is-done');
      btn.classList.remove('btn--ghost');
      if (btn.tagName === 'INPUT') btn.value = options.done;
      else btn.textContent = options.done;
      if (options.stay) {
        btn.dataset.idleLabel = options.done;
        btn.dataset.stayDone = '1';
        return;
      }
      window.setTimeout(applyIdle, options.hold || 2200);
      return;
    }
    if (options.fail) {
      btn.classList.add('is-fail');
      if (btn.tagName === 'INPUT') btn.value = options.fail;
      else btn.textContent = options.fail;
      window.setTimeout(applyIdle, options.hold || 2200);
      return;
    }
    applyIdle();
  }

  function bindButtonPressFeedback() {
    if (global.__taunetBtnFeedback) return;
    global.__taunetBtnFeedback = true;
    const selector = 'button, .btn, input[type="submit"], input[type="button"]';
    const clearPressed = () => {
      document.querySelectorAll('.is-pressed').forEach((el) => el.classList.remove('is-pressed'));
    };
    document.addEventListener(
      'pointerdown',
      (event) => {
        const btn = event.target.closest?.(selector);
        if (!btn || btn.disabled) return;
        btn.classList.add('is-pressed');
      },
      true
    );
    document.addEventListener('pointerup', clearPressed, true);
    document.addEventListener('pointercancel', clearPressed, true);
    document.addEventListener(
      'submit',
      (event) => {
        if (event.defaultPrevented) return;
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        const btn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (!btn || btn.disabled) return;
        setButtonBusy(btn, true, { busy: btn.getAttribute('data-busy-label') || 'Sending…' });
      },
      false
    );
  }

  global.TaunetUi = { setButtonBusy };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindButtonPressFeedback, { once: true });
  } else {
    bindButtonPressFeedback();
  }
})(window);
