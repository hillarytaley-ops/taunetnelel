(function () {
  'use strict';

  const MEMBER_KEY = 'taunet_member';
  const events = window.TAUNET_GALLERY || [];
  const groups = window.TAUNET_GALLERY_GROUPS || [
    { id: 'recent', label: 'Most Recent', hint: 'Albums from the last few months', icon: '✦', mod: 'recent' },
    { id: 'past', label: 'Past Events', hint: 'Browse our community archive', icon: '◷', mod: 'past' }
  ];

  const GROUP_META = {
    recent: { label: 'Most Recent', hint: 'Fresh albums & recent gatherings', icon: '✦', mod: 'recent' },
    past: { label: 'Past Events', hint: 'Browse photos & memories', icon: '◷', mod: 'past' }
  };

  function getMember() {
    try {
      const data = localStorage.getItem(MEMBER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function loginUrl() {
    const redirect = `${window.location.pathname}${window.location.hash}`;
    return `members/login.html?redirect=${encodeURIComponent(redirect.replace(/^\//, ''))}`;
  }

  function albumsInGroup(groupId) {
    return events.filter((event) => event.group === groupId);
  }

  function findAlbum(id) {
    return events.find((event) => event.id === id);
  }

  function groupMeta(groupId) {
    return GROUP_META[groupId] || { label: groupId, hint: '', icon: '◷', mod: groupId };
  }

  function renderMemberBanner(container, member) {
    const banner = document.createElement('div');
    banner.className = `gallery-member-banner${member ? ' gallery-member-banner--member' : ''}`;
    banner.innerHTML = member
      ? `<p><strong>Welcome, ${member.name.split(' ')[0]}.</strong> You can download full-resolution photos from each event album below.</p>`
      : `<p>Photos are free to browse. <a href="${loginUrl()}">Log in as a member</a> or <a href="members/register.html">join Taunet Nelel</a> to download images.</p>`;
    container.appendChild(banner);
  }

  function renderFlowStrip() {
    return `
      <div class="gallery-phase-flow" aria-hidden="true">
        <div class="gallery-phase-flow__track">
          <span class="gallery-phase-flow__step gallery-phase-flow__step--recent">
            <span class="gallery-phase-flow__dot"></span>Most Recent
          </span>
          <span class="gallery-phase-flow__arrow">→</span>
          <span class="gallery-phase-flow__step gallery-phase-flow__step--past">
            <span class="gallery-phase-flow__dot"></span>Past Events
          </span>
        </div>
      </div>`;
  }

  function photoActions(photo, member) {
    if (member) {
      return `
        <div class="gallery-photo__actions">
          <button type="button" class="gallery-photo__btn gallery-photo__btn--view" data-view="${photo.src}" data-caption="${photo.alt}">View</button>
          <a href="${photo.src}" class="gallery-photo__btn gallery-photo__btn--download" download="${photo.downloadName}">Download</a>
        </div>`;
    }
    return `
      <div class="gallery-photo__actions">
        <button type="button" class="gallery-photo__btn gallery-photo__btn--view" data-view="${photo.src}" data-caption="${photo.alt}">View</button>
        <a href="${loginUrl()}" class="gallery-photo__btn gallery-photo__btn--locked">Members download</a>
      </div>`;
  }

  function renderPhotoFigure(photo, member, hidden) {
    return `
      <figure class="gallery-photo${hidden ? ' gallery-photo--hidden' : ''}">
        <button type="button" class="gallery-photo__thumb" data-view="${photo.src}" data-caption="${photo.alt}" aria-label="View ${photo.alt}">
          <img src="${photo.src}" alt="${photo.alt}" width="400" height="300" loading="lazy">
        </button>
        ${photoActions(photo, member)}
      </figure>`;
  }

  function renderAlbumCard(event, member) {
    const previewLimit = Math.min(event.previewLimit || 4, 4);
    const hasMore = event.photos.length > previewLimit;
    const cover = event.photos[0]?.src || '';
    const photosHtml = event.photos
      .map((photo, index) => renderPhotoFigure(photo, member, index >= previewLimit))
      .join('');

    const albumLinks = (event.externalAlbums || [])
      .map(
        (album) =>
          `<a class="gallery-event__album-link" href="${album.url}" target="_blank" rel="noopener">${album.label} →</a>`
      )
      .join('');

    return `
      <article class="gallery-album-card" id="${event.id}" data-group="${event.group}">
        <a href="#${event.id}" class="gallery-album-card__hero" aria-hidden="true" tabindex="-1">
          <img src="${cover}" alt="" width="480" height="200" loading="lazy">
          <span class="gallery-album-card__overlay"></span>
          <span class="gallery-album-card__count">${event.photos.length} photos</span>
        </a>
        <header class="gallery-album-card__head">
          <p class="gallery-album-card__date">${event.date}</p>
          <h2>${event.title}</h2>
          <p class="gallery-album-card__desc">${event.description}</p>
          ${albumLinks ? `<div class="gallery-event__albums">${albumLinks}</div>` : ''}
        </header>
        <div class="gallery-grid gallery-grid--photos gallery-grid--compact" data-album-grid="${event.id}">${photosHtml}</div>
        ${hasMore ? `<button type="button" class="btn btn--outline gallery-event__show-more" data-show-more="${event.id}">Show all ${event.photos.length} photos</button>` : ''}
      </article>`;
  }

  function renderColumn(groupId, member) {
    const meta = groupMeta(groupId);
    const albums = albumsInGroup(groupId);
    const empty = albums.length
      ? albums.map((album) => renderAlbumCard(album, member)).join('')
      : `<div class="gallery-phase-empty"><span class="gallery-phase-empty__icon" aria-hidden="true">${meta.icon}</span><p>No albums in this section yet.</p></div>`;

    return `
      <section class="gallery-phase-column gallery-phase-column--${meta.mod}" aria-labelledby="gallery-col-${groupId}">
        <header class="gallery-phase-column__head gallery-phase-column__head--${meta.mod}">
          <div class="gallery-phase-column__title-wrap">
            <span class="gallery-phase-column__icon" aria-hidden="true">${meta.icon}</span>
            <div>
              <h2 id="gallery-col-${groupId}">${meta.label}</h2>
              <p class="gallery-phase-column__hint">${meta.hint}</p>
            </div>
          </div>
          <span class="gallery-phase-column__count">${albums.length}</span>
        </header>
        <div class="gallery-phase-column__body">${empty}</div>
      </section>`;
  }

  function renderGalleryLayout(root, member) {
    const wrap = document.createElement('div');
    wrap.className = 'gallery-phases-panel';
    wrap.innerHTML = renderFlowStrip();

    const row = document.createElement('div');
    row.className = 'gallery-phases-row';
    row.innerHTML = groups.map((g) => renderColumn(g.id, member)).join('');
    wrap.appendChild(row);
    root.appendChild(wrap);
  }

  function bindShowMore(container) {
    container.addEventListener('click', (e) => {
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
        </figure>
        <div class="lightbox__footer">
          <a href="#" class="btn btn--accent lightbox__download" download hidden>Download photo</a>
          <a href="${loginUrl()}" class="btn btn--ghost lightbox__login" hidden>Member login to download</a>
        </div>`;
      document.body.appendChild(lightbox);
    }

    const img = lightbox.querySelector('.lightbox__img');
    const caption = lightbox.querySelector('.lightbox__caption');
    const downloadBtn = lightbox.querySelector('.lightbox__download');
    const loginBtn = lightbox.querySelector('.lightbox__login');
    const closeBtn = lightbox.querySelector('.lightbox__close');

    function openLightbox(src, alt, downloadName) {
      const member = getMember();
      if (!img) return;
      img.src = src;
      img.alt = alt || 'Event photo';
      if (caption) caption.textContent = alt || '';
      if (member && downloadBtn) {
        downloadBtn.href = src;
        downloadBtn.download = downloadName || 'taunet-photo.jpg';
        downloadBtn.hidden = false;
        if (loginBtn) loginBtn.hidden = true;
      } else {
        if (downloadBtn) downloadBtn.hidden = true;
        if (loginBtn) loginBtn.hidden = false;
      }
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
      const src = viewBtn.dataset.view;
      const alt = viewBtn.dataset.caption || '';
      const figure = viewBtn.closest('.gallery-photo');
      const downloadLink = figure?.querySelector('.gallery-photo__btn--download');
      const downloadName = downloadLink?.getAttribute('download') || '';
      openLightbox(src, alt, downloadName);
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
      requestAnimationFrame(() => scrollToAlbum(hash));
    }
  }

  function init() {
    const root = document.getElementById('gallery-root');
    if (!root || !events.length) return;

    const member = getMember();
    renderMemberBanner(root, member);
    renderGalleryLayout(root, member);
    bindShowMore(root);
    initLightbox();
    initFromHash();

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && findAlbum(hash)) scrollToAlbum(hash);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
