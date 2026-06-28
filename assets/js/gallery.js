(function () {
  'use strict';

  const MEMBER_KEY = 'taunet_member';
  const events = window.TAUNET_GALLERY || [];
  const groups = window.TAUNET_GALLERY_GROUPS || [];

  let activeGroup = groups[0]?.id || 'recent';
  let activeAlbum = events[0]?.id || null;

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

  function renderMemberBanner(container, member) {
    const banner = document.createElement('div');
    banner.className = `gallery-member-banner${member ? ' gallery-member-banner--member' : ''}`;
    banner.innerHTML = member
      ? `<p><strong>Welcome, ${member.name.split(' ')[0]}.</strong> You can download full-resolution photos from each event album below.</p>`
      : `<p>Photos are free to browse. <a href="${loginUrl()}">Log in as a member</a> or <a href="members/register.html">join Taunet Nelel</a> to download images.</p>`;
    container.appendChild(banner);
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

  function renderAlbumSection(event, member) {
    const previewLimit = event.previewLimit || event.photos.length;
    const hasMore = event.photos.length > previewLimit;
    const photosHtml = event.photos
      .map((photo, index) => renderPhotoFigure(photo, member, index >= previewLimit))
      .join('');

    const albumLinks = (event.externalAlbums || [])
      .map(
        (album) =>
          `<a class="gallery-event__album-link" href="${album.url}" target="_blank" rel="noopener">${album.label}</a>`
      )
      .join('');

    const section = document.createElement('section');
    section.className = 'gallery-event';
    section.id = event.id;
    section.dataset.group = event.group;
    section.hidden = event.id !== activeAlbum;

    section.innerHTML = `
      <header class="gallery-event__header">
        <div>
          <p class="gallery-event__date">${event.date}</p>
          <h2>${event.title}</h2>
          <p>${event.description}</p>
          ${albumLinks ? `<div class="gallery-event__albums">${albumLinks}</div>` : ''}
        </div>
        <span class="gallery-event__count">${event.photos.length} photo${event.photos.length === 1 ? '' : 's'}</span>
      </header>
      <div class="gallery-grid gallery-grid--photos" data-album-grid="${event.id}">${photosHtml}</div>
      ${hasMore ? `<button type="button" class="btn btn--outline gallery-event__show-more" data-show-more="${event.id}">Show all ${event.photos.length} photos</button>` : ''}`;

    return section;
  }

  function renderToolbar(container) {
    const toolbar = document.createElement('div');
    toolbar.className = 'gallery-toolbar';

    const groupNav = document.createElement('nav');
    groupNav.className = 'gallery-toolbar__groups';
    groupNav.setAttribute('aria-label', 'Gallery groups');
    groupNav.innerHTML = groups
      .map(
        (group) =>
          `<button type="button" class="gallery-toolbar__group${group.id === activeGroup ? ' is-active' : ''}" data-group="${group.id}">${group.label}</button>`
      )
      .join('');

    const albumNav = document.createElement('nav');
    albumNav.className = 'gallery-toolbar__albums';
    albumNav.setAttribute('aria-label', 'Albums in group');

    toolbar.append(groupNav, albumNav);
    container.appendChild(toolbar);
    return { groupNav, albumNav };
  }

  function updateAlbumNav(albumNav) {
    const albums = albumsInGroup(activeGroup);
    if (!albums.some((album) => album.id === activeAlbum)) {
      activeAlbum = albums[0]?.id || activeAlbum;
    }

    albumNav.innerHTML = albums
      .map(
        (album) =>
          `<button type="button" class="gallery-toolbar__album${album.id === activeAlbum ? ' is-active' : ''}" data-album="${album.id}">${album.nav}</button>`
      )
      .join('');
  }

  function showAlbum(albumId, { updateHash = true } = {}) {
    const album = findAlbum(albumId);
    if (!album) return;

    activeAlbum = albumId;
    activeGroup = album.group;

    document.querySelectorAll('.gallery-toolbar__group').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.group === activeGroup);
    });

    const albumNav = document.querySelector('.gallery-toolbar__albums');
    if (albumNav) updateAlbumNav(albumNav);

    document.querySelectorAll('.gallery-event').forEach((section) => {
      const isActive = section.id === activeAlbum;
      section.hidden = !isActive;
      section.classList.toggle('gallery-event--active', isActive);
    });

    if (updateHash) {
      history.replaceState(null, '', `#${albumId}`);
    }
  }

  function showGroup(groupId) {
    activeGroup = groupId;
    const albums = albumsInGroup(groupId);
    if (!albums.length) return;

    document.querySelectorAll('.gallery-toolbar__group').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.group === groupId);
    });

    showAlbum(albums[0].id);
  }

  function bindToolbar(toolbar) {
    toolbar.addEventListener('click', (e) => {
      const groupBtn = e.target.closest('[data-group]');
      if (groupBtn) {
        showGroup(groupBtn.dataset.group);
        return;
      }

      const albumBtn = e.target.closest('[data-album]');
      if (albumBtn) {
        showAlbum(albumBtn.dataset.album);
      }
    });
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

  function renderEvents(container, member) {
    const albumsWrap = document.createElement('div');
    albumsWrap.className = 'gallery-albums';
    events.forEach((event) => {
      albumsWrap.appendChild(renderAlbumSection(event, member));
    });
    container.appendChild(albumsWrap);
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
      const album = findAlbum(hash);
      activeGroup = album.group;
      activeAlbum = hash;
      return;
    }
    activeGroup = groups[0]?.id || events[0]?.group;
    activeAlbum = albumsInGroup(activeGroup)[0]?.id || events[0]?.id;
  }

  function init() {
    const root = document.getElementById('gallery-root');
    if (!root || !events.length) return;

    initFromHash();

    const member = getMember();
    renderMemberBanner(root, member);

    const { albumNav } = renderToolbar(root);
    updateAlbumNav(albumNav);

    renderEvents(root, member);

    const toolbar = root.querySelector('.gallery-toolbar');
    bindToolbar(toolbar);
    bindShowMore(root);
    showAlbum(activeAlbum, { updateHash: false });

    initLightbox();

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && findAlbum(hash)) showAlbum(hash, { updateHash: false });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
