/**
 * Business Hub content editor (cards / news / blog).
 * Used inside /admin/ (committee session) — no separate PIN.
 */
(function (global) {
  'use strict';

  function mount(root, options) {
    const api = global.TaunetBusinessContent;
    if (!api || !root) return null;

    const {
      loadBusinessContent,
      saveBusinessContent,
      clearStoredBusinessContent,
      downloadBusinessContent,
      normalizeContent,
      formatDisplayDate,
      escapeHtml,
    } = api;

    const basePath = options?.basePath || '../';
    const statusEl = root.querySelector('[data-biz-status]');
    const updatedEl = root.querySelector('[data-biz-updated]');
    const importInput = root.querySelector('[data-biz-import]');
    let content = normalizeContent({ businesses: [], news: [], blog: [] });
    let mounted = true;

    function setStatus(message, isError) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.toggle('is-error', Boolean(isError));
      statusEl.hidden = !message;
    }

    function field(label, value, key, type) {
      return `
      <label class="admin-field">
        <span>${label}</span>
        <${type === 'textarea' ? 'textarea' : 'input'} name="${key}" ${type === 'textarea' ? '' : `type="${type || 'text'}"`} value="${type === 'textarea' ? '' : escapeHtml(value)}">${type === 'textarea' ? escapeHtml(value) : ''}</${type === 'textarea' ? 'textarea' : 'input'}>
      </label>`;
    }

    function renderList(containerSel, items, type) {
      const container = root.querySelector(containerSel);
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
      const container = root.querySelector(`[data-biz-${type}-list]`);
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
      renderList('[data-biz-business-list]', content.businesses, 'business');
      renderList('[data-biz-news-list]', content.news, 'news');
      renderList('[data-biz-blog-list]', content.blog, 'blog');
      if (updatedEl) updatedEl.textContent = formatDisplayDate(content.updatedAt) || '—';
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
      content = await loadBusinessContent({ preferStorage: true, basePath });
      renderAll();
    }

    root.querySelector('[data-biz-save]')?.addEventListener('click', () => {
      content = collectFormData();
      saveBusinessContent(content);
      setStatus('Draft saved in this browser. Export JSON and push to GitHub to publish site-wide.');
    });

    root.querySelector('[data-biz-export]')?.addEventListener('click', () => {
      content = collectFormData();
      downloadBusinessContent(content);
      setStatus('Downloaded business-content.json — replace assets/data/business-content.json in the repo and push to GitHub.');
    });

    root.querySelector('[data-biz-reset]')?.addEventListener('click', () => {
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

    root.querySelector('[data-biz-add-business]')?.addEventListener('click', () => newItem('business'));
    root.querySelector('[data-biz-add-news]')?.addEventListener('click', () => newItem('news'));
    root.querySelector('[data-biz-add-blog]')?.addEventListener('click', () => newItem('blog'));

    loadEditorData().catch((err) => {
      setStatus(err.message || 'Could not load business content.', true);
    });

    return {
      reload: loadEditorData,
      destroy() {
        mounted = false;
      },
      get isMounted() {
        return mounted;
      },
    };
  }

  global.TaunetBusinessAdmin = { mount };
})(window);
