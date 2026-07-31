/**
 * Business Hub content editor (cards / news / blog).
 * Used inside /admin/ (committee session) — no separate PIN.
 * Items stay collapsed by default; only one section tab is visible.
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
    let activeTab = 'business';
    let expandedKey = null;

    function setStatus(message, isError) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.toggle('is-error', Boolean(isError));
      statusEl.hidden = !message;
    }

    function field(label, value, key, type) {
      const rows = type === 'textarea' ? ' rows="3"' : '';
      return `
      <label class="admin-field">
        <span>${label}</span>
        <${type === 'textarea' ? 'textarea' : 'input'} name="${key}"${rows} ${type === 'textarea' ? '' : `type="${type || 'text'}"`} value="${type === 'textarea' ? '' : escapeHtml(value)}">${type === 'textarea' ? escapeHtml(value) : ''}</${type === 'textarea' ? 'textarea' : 'input'}>
      </label>`;
    }

    function itemMeta(item, type) {
      if (type === 'business') {
        return [item.category, item.location].filter(Boolean).join(' · ') || 'Business card';
      }
      return [item.date, type === 'blog' ? item.author : ''].filter(Boolean).join(' · ') || 'Draft';
    }

    function renderList(containerSel, items, type) {
      const container = root.querySelector(containerSel);
      if (!container) return;

      if (!items.length) {
        container.innerHTML = `<p class="admin-empty" style="padding:1rem">No items yet. Use Add above.</p>`;
        return;
      }

      container.innerHTML = items
        .map((item, index) => {
          const key = `${type}:${index}`;
          const isOpen = expandedKey === key;
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
          <article class="admin-item${isOpen ? ' is-open' : ' is-collapsed'}" data-admin-item="${type}" data-index="${index}" data-id="${escapeHtml(item.id || '')}">
            <div class="admin-item__head">
              <div class="admin-item__title-wrap">
                <h3>${escapeHtml(item.title || item.name || `${type} ${index + 1}`)}</h3>
                <p class="admin-item__meta">${escapeHtml(itemMeta(item, type))}</p>
              </div>
              <div class="admin-item__actions">
                <button type="button" class="admin-item__toggle" data-toggle="${type}" data-index="${index}" aria-expanded="${isOpen}">
                  ${isOpen ? 'Collapse' : 'Edit'}
                </button>
                <button type="button" class="admin-item__remove" data-remove="${type}" data-index="${index}">Remove</button>
              </div>
            </div>
            <div class="admin-item__fields">${common}</div>
          </article>`;
        })
        .join('');

      container.querySelectorAll('[data-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          content = collectFormData();
          const key = `${btn.dataset.toggle}:${btn.dataset.index}`;
          expandedKey = expandedKey === key ? null : key;
          renderAll();
        });
      });

      container.querySelectorAll('[data-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          content = collectFormData();
          const idx = Number(btn.dataset.index);
          const listType = btn.dataset.remove;
          content[listType === 'business' ? 'businesses' : listType].splice(idx, 1);
          if (expandedKey && expandedKey.startsWith(`${listType}:`)) expandedKey = null;
          renderAll();
        });
      });
    }

    function readList(type) {
      const key = type === 'business' ? 'businesses' : type;
      const container = root.querySelector(`[data-biz-${type}-list]`);
      if (!container) return content[key];

      const articles = Array.from(container.querySelectorAll(`[data-admin-item="${type}"]`));
      if (!articles.length && !(content[key] || []).length) return content[key];
      if (!articles.length) return content[key];

      return articles.map((article) => {
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

    function updateCounts() {
      const map = {
        business: content.businesses?.length || 0,
        news: content.news?.length || 0,
        blog: content.blog?.length || 0,
      };
      Object.entries(map).forEach(([tab, count]) => {
        const el = root.querySelector(`[data-biz-count="${tab}"]`);
        if (el) el.textContent = String(count);
      });
    }

    function setTab(tab) {
      activeTab = tab;
      root.querySelectorAll('[data-biz-tab]').forEach((btn) => {
        const on = btn.dataset.bizTab === tab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      root.querySelectorAll('[data-biz-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.bizPanel !== tab;
      });
    }

    function renderAll() {
      renderList('[data-biz-business-list]', content.businesses, 'business');
      renderList('[data-biz-news-list]', content.news, 'news');
      renderList('[data-biz-blog-list]', content.blog, 'blog');
      updateCounts();
      setTab(activeTab);
      if (updatedEl) updatedEl.textContent = formatDisplayDate(content.updatedAt) || '—';
    }

    function newItem(type) {
      content = collectFormData();
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
      activeTab = type;
      expandedKey = `${type}:0`;
      renderAll();
    }

    async function loadEditorData() {
      content = await loadBusinessContent({ preferStorage: true, basePath });
      expandedKey = null;
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
        expandedKey = null;
        renderAll();
        setStatus('Imported JSON. Review changes, then export and push to GitHub.');
      } catch {
        setStatus('Could not read that JSON file.', true);
      }
      e.target.value = '';
    });

    root.querySelectorAll('[data-biz-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        content = collectFormData();
        setTab(btn.dataset.bizTab);
        renderAll();
      });
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
