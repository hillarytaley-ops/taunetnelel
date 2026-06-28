(function () {
  'use strict';

  const ADMIN_SESSION_KEY = 'taunet_business_admin';
  const ADMIN_PIN = 'TaunetBiz2026';

  const {
    loadBusinessContent,
    saveBusinessContent,
    clearStoredBusinessContent,
    downloadBusinessContent,
    normalizeContent,
    formatDisplayDate,
    escapeHtml,
  } = window.TaunetBusinessContent;

  const loginGate = document.getElementById('admin-login');
  const editor = document.getElementById('admin-editor');
  const loginForm = document.getElementById('admin-login-form');
  const logoutBtn = document.getElementById('admin-logout');
  const statusEl = document.getElementById('admin-status');
  const updatedEl = document.getElementById('admin-updated');
  const importInput = document.getElementById('admin-import-file');
  const exportBtn = document.getElementById('admin-export');
  const saveDraftBtn = document.getElementById('admin-save-draft');
  const resetBtn = document.getElementById('admin-reset-storage');
  const addBusinessBtn = document.getElementById('admin-add-business');
  const addNewsBtn = document.getElementById('admin-add-news');
  const addBlogBtn = document.getElementById('admin-add-blog');

  let content = normalizeContent({ businesses: [], news: [], blog: [] });

  function setStatus(message, isError) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', Boolean(isError));
    statusEl.hidden = !message;
  }

  function isAuthed() {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
  }

  function showEditor(show) {
    if (loginGate) loginGate.hidden = show;
    if (editor) editor.hidden = !show;
  }

  function field(label, value, key, type) {
    return `
      <label class="admin-field">
        <span>${label}</span>
        <${type === 'textarea' ? 'textarea' : 'input'} name="${key}" ${type === 'textarea' ? '' : `type="${type || 'text'}"`} value="${type === 'textarea' ? '' : escapeHtml(value)}">${type === 'textarea' ? escapeHtml(value) : ''}</${type === 'textarea' ? 'textarea' : 'input'}>
      </label>`;
  }

  function renderList(containerId, items, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = items
      .map((item, index) => {
        const common = `
          ${field('Title / Name', item.title || item.name, 'title', 'text')}
          ${type === 'business'
            ? `${field('Category', item.category, 'category')}
               ${field('Location', item.location, 'location')}
               ${field('Contact name', item.contactName, 'contactName')}
               ${field('Phone', item.phone, 'phone')}
               ${field('Email', item.email, 'email', 'email')}
               ${field('Website', item.website, 'url', 'url')}`
            : `${field('Date', item.date, 'date', 'date')}
               ${type === 'blog' ? field('Author', item.author, 'author') : ''}`}
          ${field('Summary', item.summary || item.description, 'summary', 'textarea')}
          ${type !== 'business' ? field('Full text', item.body, 'body', 'textarea') : field('Description', item.description || item.summary, 'body', 'textarea')}
        `;
        return `
          <article class="admin-item" data-admin-item="${type}" data-index="${index}" data-id="${escapeHtml(item.id || '')}">
            <div class="admin-item__head">
              <h3>${escapeHtml(item.title || item.name || `${type} ${index + 1}`)}</h3>
              <button type="button" class="admin-item__remove" data-remove="${type}" data-index="${index}">Remove</button>
            </div>
            <div class="admin-item__fields">${common}</div>
          </article>`;
      })
      .join('');

    container.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const listType = btn.dataset.remove;
        content[listType === 'business' ? 'businesses' : listType].splice(idx, 1);
        renderAll();
      });
    });
  }

  function readList(type) {
    const key = type === 'business' ? 'businesses' : type;
    const container = document.getElementById(`admin-${type}-list`);
    if (!container) return content[key];

    return Array.from(container.querySelectorAll(`[data-admin-item="${type}"]`)).map((article) => {
      const get = (name) => article.querySelector(`[name="${name}"]`)?.value.trim() || '';
      const itemId = article.dataset.id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (type === 'business') {
        return {
          id: itemId,
          name: get('title'),
          category: get('category'),
          location: get('location'),
          contactName: get('contactName'),
          phone: get('phone'),
          email: get('email'),
          website: get('url'),
          description: get('body'),
          summary: get('summary'),
        };
      }
      return {
        id: itemId,
        title: get('title'),
        date: get('date') || new Date().toISOString().slice(0, 10),
        author: get('author') || 'Taunet Nelel Team',
        summary: get('summary'),
        body: get('body'),
      };
    });
  }

  function collectFormData() {
    return normalizeContent({
      updatedAt: new Date().toISOString(),
      businesses: readList('business'),
      news: readList('news'),
      blog: readList('blog'),
    });
  }

  function renderAll() {
    renderList('admin-business-list', content.businesses, 'business');
    renderList('admin-news-list', content.news, 'news');
    renderList('admin-blog-list', content.blog, 'blog');
    if (updatedEl) updatedEl.textContent = formatDisplayDate(content.updatedAt);
  }

  function newItem(type) {
    if (type === 'business') {
      content.businesses.unshift({
        id: `biz-${Date.now()}`,
        name: 'New business',
        category: '',
        description: '',
        contactName: '',
        phone: '',
        email: '',
        website: '',
        location: '',
      });
    } else {
      content[type].unshift({
        id: `${type}-${Date.now()}`,
        title: 'New post',
        date: new Date().toISOString().slice(0, 10),
        author: 'Taunet Nelel Team',
        summary: '',
        body: '',
      });
    }
    renderAll();
  }

  async function loadEditorData() {
    content = await loadBusinessContent({ preferStorage: true, basePath: '../' });
    renderAll();
  }

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = loginForm.querySelector('input[name="pin"]')?.value.trim();
    if (pin !== ADMIN_PIN) {
      setStatus('Incorrect admin PIN.', true);
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    setStatus('');
    showEditor(true);
    loadEditorData();
  });

  logoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    showEditor(false);
    setStatus('Signed out.');
  });

  saveDraftBtn?.addEventListener('click', () => {
    content = collectFormData();
    saveBusinessContent(content);
    setStatus('Draft saved in this browser. Export the JSON file and push to GitHub to publish site-wide.');
  });

  exportBtn?.addEventListener('click', () => {
    content = collectFormData();
    downloadBusinessContent(content);
    setStatus('Downloaded business-content.json — replace assets/data/business-content.json in the repo and push to GitHub.');
  });

  resetBtn?.addEventListener('click', () => {
    clearStoredBusinessContent();
    setStatus('Local draft cleared. Reloading published content…');
    loadEditorData();
  });

  importInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      content = normalizeContent(JSON.parse(text));
      renderAll();
      setStatus('Imported JSON. Review changes, then export and push to GitHub.');
    } catch {
      setStatus('Could not read that JSON file.', true);
    }
    e.target.value = '';
  });

  addBusinessBtn?.addEventListener('click', () => newItem('business'));
  addNewsBtn?.addEventListener('click', () => newItem('news'));
  addBlogBtn?.addEventListener('click', () => newItem('blog'));

  if (isAuthed()) {
    showEditor(true);
    loadEditorData();
  } else {
    showEditor(false);
  }
})();
