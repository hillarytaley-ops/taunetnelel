/**
 * Public IT Help chat. Members send portal issues; IT replies in Admin.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'taunet_it_help';
  const API = '/api/it-help';
  const POLL_MS = 8000;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveStore(next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function mount(options) {
    const embedRoot = options.embedRoot || document.getElementById('it-help-embed');
    const embedded = Boolean(embedRoot);
    const host = embedded ? embedRoot : document.body;
    if (!host) return;

    const widget = document.createElement('div');
    widget.className = embedded ? 'it-help-widget it-help-widget--embed' : 'it-help-widget it-help-widget--float';
    widget.innerHTML = `
      <button type="button" class="it-help-launcher" aria-expanded="${embedded ? 'true' : 'false'}">IT Help</button>
      <div class="it-help-panel"${embedded ? '' : ' hidden'}>
        <div class="it-help-panel__head">
          <div>
            <strong>IT Help</strong>
            <span>Portal login &amp; invite issues</span>
          </div>
          <button type="button" class="it-help-panel__close" aria-label="Close chat">&times;</button>
        </div>
        <div class="it-help-messages" id="it-help-messages" aria-live="polite"></div>
        <form class="it-help-compose" id="it-help-form">
          <input type="text" name="fullName" autocomplete="name" placeholder="Your name" required>
          <input type="email" name="email" autocomplete="email" placeholder="Email on your invite" required>
          <textarea name="body" placeholder="Describe the IT issue…" required minlength="2" maxlength="2000"></textarea>
          <button type="submit">Send to IT</button>
          <p class="it-help-note">Do not share your password or password link. IT replies here.</p>
          <p class="it-help-status" role="status" hidden></p>
        </form>
      </div>
    `;
    host.appendChild(widget);

    const launcher = widget.querySelector('.it-help-launcher');
    const panel = widget.querySelector('.it-help-panel');
    const closeBtn = widget.querySelector('.it-help-panel__close');
    const messagesEl = widget.querySelector('#it-help-messages');
    const form = widget.querySelector('#it-help-form');
    const nameInput = form.elements.fullName;
    const emailInput = form.elements.email;
    const bodyInput = form.elements.body;
    const statusEl = widget.querySelector('.it-help-status');
    let pollTimer = null;
    let lastMessageCount = 0;

    function setStatus(text, isError) {
      if (!statusEl) return;
      if (!text) {
        statusEl.hidden = true;
        statusEl.textContent = '';
        return;
      }
      statusEl.hidden = false;
      statusEl.textContent = text;
      statusEl.classList.toggle('is-error', Boolean(isError));
    }

    function syncIdentityFields() {
      const store = loadStore();
      const hasThread = Boolean(store.threadId && store.guestToken);
      nameInput.hidden = hasThread;
      emailInput.hidden = hasThread;
      nameInput.required = !hasThread;
      emailInput.required = !hasThread;
      if (store.fullName) nameInput.value = store.fullName;
      if (store.email) emailInput.value = store.email;
    }

    function renderMessages(payload) {
      const messages = payload.messages || [];
      if (!messages.length) {
        messagesEl.innerHTML =
          '<p class="it-help-empty">Send a message about sign-in, invite email, or password links. IT will reply here.</p>';
        lastMessageCount = 0;
        return;
      }
      const atBottom =
        messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 48;
      messagesEl.innerHTML = messages
        .map((m) => {
          const who = m.sender === 'it' ? 'it' : 'member';
          const label = who === 'it' ? 'IT' : 'You';
          return `<div class="it-help-bubble it-help-bubble--${who}">
            <strong>${label}</strong>
            <div>${escapeHtml(m.body)}</div>
            <time>${escapeHtml(formatTime(m.createdAt || m.created_at))}</time>
          </div>`;
        })
        .join('');
      if (atBottom || messages.length !== lastMessageCount) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      lastMessageCount = messages.length;
      if (payload.status === 'closed') {
        setStatus('This chat is closed. Send another message to reopen it.');
      }
    }

    async function fetchThread() {
      const store = loadStore();
      if (!store.threadId || !store.guestToken) {
        renderMessages({ messages: [] });
        return null;
      }
      const params = new URLSearchParams({
        threadId: store.threadId,
        guestToken: store.guestToken
      });
      const res = await fetch(`${API}?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        saveStore({ email: store.email || '', fullName: store.fullName || '' });
        syncIdentityFields();
        renderMessages({ messages: [] });
        return null;
      }
      if (!res.ok) throw new Error(data.error || 'Could not load chat.');
      renderMessages(data);
      return data;
    }

    function startPoll() {
      stopPoll();
      pollTimer = setInterval(() => {
        if (panel.hidden) return;
        fetchThread().catch(() => {});
      }, POLL_MS);
    }

    function stopPoll() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function openPanel() {
      panel.hidden = false;
      launcher.setAttribute('aria-expanded', 'true');
      syncIdentityFields();
      fetchThread().catch((err) => setStatus(err.message || 'Could not load chat.', true));
      startPoll();
    }

    function closePanel() {
      if (embedded) return;
      panel.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
      stopPoll();
    }

    launcher.addEventListener('click', () => {
      if (panel.hidden) openPanel();
      else closePanel();
    });
    closeBtn.addEventListener('click', closePanel);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const store = loadStore();
      const text = String(bodyInput.value || '').trim();
      if (text.length < 2) {
        setStatus('Enter a short description of the issue.', true);
        return;
      }
      const payload = { body: text };
      if (store.threadId && store.guestToken) {
        payload.threadId = store.threadId;
        payload.guestToken = store.guestToken;
      } else {
        payload.fullName = String(nameInput.value || '').trim();
        payload.email = String(emailInput.value || '').trim();
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      setStatus('Sending…');
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not send message.');
        saveStore({
          threadId: data.threadId,
          guestToken: data.guestToken,
          email: data.email || payload.email || store.email || '',
          fullName: data.fullName || payload.fullName || store.fullName || ''
        });
        bodyInput.value = '';
        syncIdentityFields();
        renderMessages(data);
        setStatus('Sent. IT will reply here.');
        startPoll();
      } catch (err) {
        setStatus(err.message || 'Could not send message.', true);
      } finally {
        btn.disabled = false;
      }
    });

    syncIdentityFields();
    if (embedded) openPanel();
    else {
      const store = loadStore();
      if (store.threadId) {
        fetchThread().catch(() => {});
      } else {
        renderMessages({ messages: [] });
      }
    }
  }

  function init() {
    if (document.querySelector('.it-help-widget')) return;
    mount({ embedRoot: document.getElementById('it-help-embed') });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
