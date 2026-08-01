(function (global) {
  'use strict';

  // Same-origin copy — Edge Tracking Prevention blocks storage for CDN scripts (jsDelivr).
  function supabaseScriptUrl() {
    const el = document.querySelector('script[src*="supabase-init.js"]');
    const src = el?.getAttribute('src') || '';
    if (src.includes('supabase-init.js')) {
      return src.replace(/supabase-init\.js[^/]*$/, 'vendor/supabase.min.js');
    }
    return 'assets/js/vendor/supabase.min.js';
  }

  const CORE_FIELDS = new Set(['name', 'email', 'phone', 'message']);

  let client = null;
  let loadPromise = null;

  function getConfig() {
    return global.TAUNET_SUPABASE || {};
  }

  function isConfigured() {
    const { url, anonKey } = getConfig();
    return Boolean(url && anonKey);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-taunet-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.taunetSrc = src;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (client) return client;

    const { url, anonKey } = getConfig();
    if (!global.supabase?.createClient) return null;

    client = global.supabase.createClient(url, anonKey);
    global.taunetSupabase = client;
    return client;
  }

  function ensureClient() {
    if (!isConfigured()) {
      return Promise.resolve(null);
    }

    if (client) {
      return Promise.resolve(client);
    }

    if (!loadPromise) {
      loadPromise = loadScript(supabaseScriptUrl()).then(() => getClient());
    }

    return loadPromise;
  }

  function getStatusMessage(el) {
    return el.querySelector('.inquiry-form__message, .site-form__message');
  }

  function showMessage(el, text, isError) {
    const message = getStatusMessage(el);
    if (!message) return;

    message.hidden = false;
    message.classList.toggle('is-error', Boolean(isError));
    message.textContent = text;
  }

  function resetSubmitButton(button, label) {
    if (!button) return;
    button.disabled = false;
    button.textContent = label || button.dataset.defaultLabel || 'Submit';
  }

  function buildSubmission(formType, formData) {
    const payload = {
      form_type: formType,
      name: null,
      email: null,
      phone: null,
      message: null,
      metadata: {}
    };

    formData.forEach((value, key) => {
      if (!value || key.startsWith('_') || key === '_honey') return;

      if (CORE_FIELDS.has(key)) {
        payload[key] = String(value).trim();
        return;
      }

      payload.metadata[key] = String(value).trim();
    });

    return payload;
  }

  function bindForms() {
    document.querySelectorAll('form[data-supabase-form]').forEach((form) => {
      if (form.dataset.supabaseBound === 'true') return;
      form.dataset.supabaseBound = 'true';

      const submitButton = form.querySelector('[type="submit"]');
      if (submitButton && !submitButton.dataset.defaultLabel) {
        submitButton.dataset.defaultLabel = submitButton.textContent.trim();
      }

      // When Supabase keys are present, do not fall back to FormSubmit.
      if (isConfigured() && form.getAttribute('action')?.includes('formsubmit.co')) {
        form.dataset.formsubmitFallback = form.getAttribute('action') || '';
        form.removeAttribute('action');
        form.setAttribute('method', 'post');
      }

      form.addEventListener('submit', async (event) => {
        if (!isConfigured()) return;

        event.preventDefault();

        const supabase = await ensureClient();
        if (!supabase) {
          showMessage(form, 'Supabase is not configured yet. Please try again later.', true);
          return;
        }

        const honeypot = form.querySelector('[name="_honey"]');
        if (honeypot?.value) return;

        const formType = form.dataset.supabaseForm;
        const payload = buildSubmission(formType, new FormData(form));

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Sending...';
        }

        const { error } = await supabase.from('form_submissions').insert(payload);

        if (error) {
          console.error('Supabase form error:', error);
          showMessage(
            form,
            'Sorry, your message could not be sent right now. Please email info@taunetnelel.org instead.',
            true
          );
          resetSubmitButton(submitButton, submitButton?.dataset.defaultLabel);
          return;
        }

        const successText = getStatusMessage(form)?.dataset.success
          || 'Thank you! Your enquiry has been sent. We will respond within 2 business days.';

        showMessage(form, successText, false);
        form.reset();

        const panel = form.closest('[data-sponsorship-form-panel]');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        resetSubmitButton(submitButton, submitButton?.dataset.defaultLabel);
      });
    });
  }

  function initNewsletter() {
    if (!isConfigured()) return;

    document.querySelectorAll('[data-supabase-newsletter]').forEach((form) => {
      if (form.dataset.supabaseBound === 'true') return;
      form.dataset.supabaseBound = 'true';

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const supabase = await ensureClient();
        if (!supabase) return;

        const emailInput = form.querySelector('input[type="email"]');
        const email = emailInput?.value?.trim();
        if (!email) return;

        const listKey = form.dataset.supabaseNewsletter || 'default';
        let error = null;
        const rpc = await supabase.rpc('subscribe_newsletter', {
          p_email: email,
          p_list_key: listKey
        });
        if (rpc.error) {
          // Fallback if migration 018 not applied yet
          const upsert = await supabase
            .from('newsletter_subscribers')
            .upsert({ email, list_key: listKey }, { onConflict: 'email' });
          error = upsert.error;
        }

        const message =
          form.querySelector('.newsletter-form__message') ||
          form.querySelector('.newsletter__message');
        if (message) {
          message.hidden = false;
          const duplicate = error && (error.code === '23505' || /duplicate|unique/i.test(error.message || ''));
          message.classList.toggle('is-error', Boolean(error) && !duplicate);
          if (!error || duplicate) {
            message.textContent = duplicate
              ? 'You are already subscribed. Thank you!'
              : 'Thank you for subscribing!';
          } else {
            message.textContent = 'Could not save your email right now. Please try again.';
          }
        }

        if ((!error || (error && (error.code === '23505' || /duplicate|unique/i.test(error.message || '')))) && emailInput) {
          emailInput.value = '';
        }
      });
    });
  }

  function init() {
    bindForms();
    initNewsletter();

    if (isConfigured()) {
      ensureClient().catch((error) => {
        console.warn('Taunet Supabase failed to initialize:', error);
      });
    }
  }

  global.taunetSupabaseApi = {
    ensureClient,
    isConfigured,
    getClient: () => client
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
