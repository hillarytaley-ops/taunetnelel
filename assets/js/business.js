(function () {
  'use strict';

  const businessGrid = document.getElementById('business-directory');
  if (!businessGrid) return;

  const { loadBusinessContent, sortByDateDesc, formatDisplayDate, escapeHtml } = window.TaunetBusinessContent;

  const newsFeed = document.getElementById('business-news-feed');
  const blogFeed = document.getElementById('business-blog-feed');
  const updatedEl = document.getElementById('business-updated');
  const emptyBusiness = document.getElementById('business-directory-empty');
  const emptyNews = document.getElementById('business-news-empty');
  const emptyBlog = document.getElementById('business-blog-empty');

  function renderBusinessCards(businesses) {
    if (!businessGrid) return;
    if (!businesses.length) {
      businessGrid.innerHTML = '';
      if (emptyBusiness) emptyBusiness.hidden = false;
      return;
    }
    if (emptyBusiness) emptyBusiness.hidden = true;

    businessGrid.innerHTML = businesses
      .map(
        (biz) => `
      <article class="biz-card" id="${escapeHtml(biz.id)}">
        <div class="biz-card__top">
          <span class="biz-card__category">${escapeHtml(biz.category || 'Business')}</span>
          <h3 class="biz-card__name">${escapeHtml(biz.name)}</h3>
          ${biz.location ? `<p class="biz-card__location">${escapeHtml(biz.location)}</p>` : ''}
        </div>
        <p class="biz-card__desc">${escapeHtml(biz.description)}</p>
        <ul class="biz-card__contact">
          ${biz.contactName ? `<li><strong>Contact:</strong> ${escapeHtml(biz.contactName)}</li>` : ''}
          ${biz.phone ? `<li><strong>Phone:</strong> <a href="tel:${escapeHtml(biz.phone.replace(/\s/g, ''))}">${escapeHtml(biz.phone)}</a></li>` : ''}
          ${biz.email ? `<li><strong>Email:</strong> <a href="mailto:${escapeHtml(biz.email)}">${escapeHtml(biz.email)}</a></li>` : ''}
          ${biz.website ? `<li><strong>Web:</strong> <a href="${escapeHtml(biz.website)}" target="_blank" rel="noopener">${escapeHtml(biz.website.replace(/^https?:\/\//, ''))}</a></li>` : ''}
        </ul>
      </article>`
      )
      .join('');
  }

  function renderFeedItems(items, container, emptyEl, type) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    container.innerHTML = items
      .map((item, index) => {
        const panelId = `${type}-panel-${index}`;
        return `
      <article class="biz-feed-item">
        <button type="button" class="biz-feed-item__trigger" aria-expanded="false" aria-controls="${panelId}">
          <span class="biz-feed-item__meta">${escapeHtml(formatDisplayDate(item.date))}${item.author ? ` · ${escapeHtml(item.author)}` : ''}</span>
          <span class="biz-feed-item__title">${escapeHtml(item.title)}</span>
          <span class="biz-feed-item__summary">${escapeHtml(item.summary)}</span>
          <span class="biz-feed-item__chevron" aria-hidden="true"></span>
        </button>
        <div class="biz-feed-item__panel" id="${panelId}" hidden>
          <p>${escapeHtml(item.body)}</p>
        </div>
      </article>`;
      })
      .join('');

    container.querySelectorAll('.biz-feed-item__trigger').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const panel = document.getElementById(trigger.getAttribute('aria-controls'));
        const open = trigger.getAttribute('aria-expanded') === 'true';
        trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
        trigger.classList.toggle('is-open', !open);
        if (panel) panel.hidden = open;
      });
    });
  }

  function initTabs() {
    const tabs = document.querySelectorAll('[data-business-tab]');
    const panels = document.querySelectorAll('[data-business-panel]');
    if (!tabs.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.businessTab;
        tabs.forEach((t) => {
          const active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach((panel) => {
          const active = panel.dataset.businessPanel === id;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      });
    });
  }

  async function init() {
    initTabs();
    try {
      const data = await loadBusinessContent();
      renderBusinessCards(data.businesses);
      renderFeedItems(sortByDateDesc(data.news), newsFeed, emptyNews, 'news');
      renderFeedItems(sortByDateDesc(data.blog), blogFeed, emptyBlog, 'blog');
      if (updatedEl) updatedEl.textContent = formatDisplayDate(data.updatedAt);
    } catch (err) {
      if (businessGrid) businessGrid.innerHTML = `<p class="biz-error">Unable to load business content. Please try again later.</p>`;
      console.error(err);
    }
  }

  init();
})();
