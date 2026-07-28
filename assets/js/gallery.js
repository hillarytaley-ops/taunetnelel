(function () {
  'use strict';

  let events = window.TAUNET_GALLERY || [];
  let activeFilter = 'recent';

  const FILTERS = [
    { id: 'recent', label: 'Most recent' },
    { id: 'past', label: 'Past events' }
  ];

  function sortedAlbums(filterId) {
    return events
      .filter((event) => event.group === filterId)
      .sort((a, b) => {
        const da = a.sortDate || '0000';
        const db = b.sortDate || '0000';
        const byDate = db.localeCompare(da);
        if (byDate !== 0) return byDate;
        return (b.photos?.length || 0) - (a.photos?.length || 0);
      });
  }

  function findAlbum(id) {
    return events.find((event) => event.id === id);
  }

  function renderPhotoFigure(photo, hidden) {
    return `
      <figure class="gallery-photo${hidden ? ' gallery-photo--hidden' : ''}">
        <button type="button" class="gallery-photo__thumb" data-view="${photo.src}" data-caption="${photo.alt}" aria-label="View ${photo.alt}">
          <img src="${photo.src}" alt="${photo.alt}" width="400" height="300" loading="lazy">
        </button>
      </figure>`;
  }

  function renderAlbumCard(event) {
    const previewLimit = Math.min(event.previewLimit || 4, 8);
    const hasMore = event.photos.length > previewLimit;
    const cover = event.photos[0]?.src || '';
    const photosHtml = event.photos
      .map((photo, index) => renderPhotoFigure(photo, index >= previewLimit))
      .join('');

    const albumLinks = (event.externalAlbums || [])
      .map(
        (album) =>
          `<a class="gallery-event__album-link" href="${album.url}" target="_blank" rel="noopener">${album.label} →</a>`
      )
      .join('');

    const badge =
      event.group === 'recent'
        ? '<span class="gallery-album-card__badge gallery-album-card__badge--recent">Most recent</span>'
        : '<span class="gallery-album-card__badge">Past event</span>';

    return `
      <article class="gallery-album-card" id="${event.id}" data-group="${event.group}">
        <a href="#${event.id}" class="gallery-album-card__hero" aria-hidden="true" tabindex="-1">
          <img src="${cover}" alt="" width="960" height="360" loading="lazy">
          <span class="gallery-album-card__overlay"></span>
          <span class="gallery-album-card__count">${event.photos.length} photos</span>
        </a>
        <header class="gallery-album-card__head">
          <div class="gallery-album-card__meta">
            <p class="gallery-album-card__date">${event.date}</p>
            ${badge}
          </div>
          <h2>${event.title}</h2>
          <p class="gallery-album-card__desc">${event.description}</p>
          ${albumLinks ? `<div class="gallery-event__albums">${albumLinks}</div>` : ''}
        </header>
        <div class="gallery-grid gallery-grid--photos gallery-grid--compact" data-album-grid="${event.id}">${photosHtml}</div>
        ${hasMore ? `<button type="button" class="btn btn--outline gallery-event__show-more" data-show-more="${event.id}">Show all ${event.photos.length} photos</button>` : ''}
      </article>`;
  }

  function renderFilters(activeId, counts) {
    return `
      <div class="gallery-filters" role="tablist" aria-label="Filter albums">
        ${FILTERS.map(
          (filter) => `
          <button
            type="button"
            class="gallery-filters__btn${activeId === filter.id ? ' is-active' : ''}"
            role="tab"
            aria-selected="${activeId === filter.id}"
            data-gallery-filter="${filter.id}"
          >
            ${filter.label}
            <span class="gallery-filters__count">${counts[filter.id] || 0}</span>
          </button>`
        ).join('')}
      </div>`;
  }

  function renderAlbumList(root, filterId) {
    const albums = sortedAlbums(filterId);
    const list = document.createElement('div');
    list.className = 'gallery-album-list';
    list.innerHTML = albums.length
      ? albums.map((album) => renderAlbumCard(album)).join('')
      : `<div class="gallery-phase-empty"><p>No albums in this section yet.</p></div>`;
    root.appendChild(list);
  }

  function renderGalleryLayout(root) {
    const counts = {
      recent: events.filter((e) => e.group === 'recent').length,
      past: events.filter((e) => e.group === 'past').length
    };

    const wrap = document.createElement('div');
    wrap.className = 'gallery-phases-panel';
    wrap.innerHTML = renderFilters(activeFilter, counts);
    root.appendChild(wrap);
    renderAlbumList(root, activeFilter);
  }

  function bindShowMore(container) {
    container.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('[data-gallery-filter]');
      if (filterBtn) {
        activeFilter = filterBtn.dataset.galleryFilter;
        init();
        return;
      }

      const btn = e.target.closest('[data-show-more]');
      if (!btn) return;

      const albumId = btn.dataset.showMore;
      const grid = container.querySelector(`[data-album-grid="${albumId}"]`);
      grid?.querySelectorAll('.gallery-photo--hidden').forEach((photo) => {
        photo.classList.remove('gallery-photo--hidden');
      });
      btn.remove();
    });
  }

  function scrollToAlbum(albumId) {
    const el = document.getElementById(albumId);
    if (!el) return;
    el.classList.add('gallery-album-card--highlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.classList.remove('gallery-album-card--highlight'), 2000);
  }

  function initLightbox() {
    let lightbox = document.getElementById('gallery-lightbox');
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.id = 'gallery-lightbox';
      lightbox.className = 'lightbox';
      lightbox.hidden = true;
      lightbox.innerHTML = `
        <button type="button" class="lightbox__close" aria-label="Close preview">&times;</button>
        <figure class="lightbox__figure">
          <img src="" alt="" class="lightbox__img">
          <figcaption class="lightbox__caption"></figcaption>
        </figure>`;
      document.body.appendChild(lightbox);
    }

    const img = lightbox.querySelector('.lightbox__img');
    const caption = lightbox.querySelector('.lightbox__caption');
    const closeBtn = lightbox.querySelector('.lightbox__close');

    function openLightbox(src, alt) {
      if (!img) return;
      img.src = src;
      img.alt = alt || 'Event photo';
      if (caption) caption.textContent = alt || '';
      lightbox.hidden = false;
      lightbox.setAttribute('aria-hidden', 'false');
      closeBtn?.focus();
    }

    function closeLightbox() {
      lightbox.hidden = true;
      lightbox.setAttribute('aria-hidden', 'true');
      if (img) img.src = '';
    }

    document.addEventListener('click', (e) => {
      const viewBtn = e.target.closest('[data-view]');
      if (!viewBtn) return;
      e.preventDefault();
      openLightbox(viewBtn.dataset.view, viewBtn.dataset.caption || '');
    });

    closeBtn?.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  function initFromHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash && findAlbum(hash)) {
      const album = findAlbum(hash);
      if (album && album.group !== activeFilter) {
        activeFilter = album.group;
        init();
        return;
      }
      requestAnimationFrame(() => scrollToAlbum(hash));
    }
  }

  let bound = false;

  function init() {
    const root = document.getElementById('gallery-root');
    events = window.TAUNET_GALLERY || events;
    if (!root || !events.length) return;

    root.innerHTML = '';
    renderGalleryLayout(root);
    if (!bound) {
      bindShowMore(root);
      initLightbox();
      bound = true;
    }
    initFromHash();
  }

  window.taunetGalleryRefresh = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (hash && findAlbum(hash)) scrollToAlbum(hash);
  });
})();
