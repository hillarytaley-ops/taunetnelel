(function () {
  'use strict';

  if (document.querySelector('.floating-social-folder')) return;
  if (!document.querySelector('.site-header')) return;

  const SOCIAL_LINKS = [
    {
      label: 'Facebook',
      href: 'https://www.facebook.com/p/Taunet-Nelel-Organisation-Group-100080157475566/',
      className: 'floating-social-folder__link--facebook',
      icon: '<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>',
    },
    {
      label: 'Instagram',
      href: 'https://www.instagram.com/taunet_nelel/',
      className: 'floating-social-folder__link--instagram',
      icon: '<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>',
    },
    {
      label: 'TikTok',
      href: 'https://www.tiktok.com/@taunet_nelel',
      className: 'floating-social-folder__link--tiktok',
      icon: '<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/>',
    },
    {
      label: 'YouTube',
      href: 'https://www.youtube.com/@taunet_nelel',
      className: 'floating-social-folder__link--youtube',
      icon: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
    },
  ];

  const WHATSAPP_ICON =
    '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>';

  function assetBase() {
    const mainCss = document.querySelector('link[href*="assets/css/main.css"]');
    if (!mainCss) return '';
    return mainCss.getAttribute('href').replace(/assets\/css\/main\.css.*$/, '');
  }

  function loadStylesheet() {
    if (document.querySelector('link[href*="floating-social/floating-social.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${assetBase()}assets/floating-social/floating-social.css`;
    document.head.appendChild(link);
  }

  function renderSocialLinks() {
    return SOCIAL_LINKS.map(
      (item) =>
        `<a href="${item.href}" class="floating-social-folder__link ${item.className}" target="_blank" rel="noopener" aria-label="${item.label}"><svg viewBox="0 0 24 24" aria-hidden="true">${item.icon}</svg></a>`
    ).join('');
  }

  function mountFloatingSocial() {
    const folder = document.createElement('aside');
    folder.className = 'floating-social-folder';
    folder.setAttribute('aria-label', 'Social media');
    folder.innerHTML = `
      <button type="button" class="floating-social-folder__toggle" aria-expanded="false" aria-controls="floating-social-panel">
        <svg class="floating-social-folder__toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
        <span class="floating-social-folder__toggle-label">Social</span>
      </button>
      <div class="floating-social-folder__panel" id="floating-social-panel" hidden>
        ${renderSocialLinks()}
      </div>
    `;

    const whatsapp = document.createElement('a');
    whatsapp.className = 'whatsapp-float';
    whatsapp.href = 'https://wa.me/61475273985';
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener';
    whatsapp.setAttribute('aria-label', 'WhatsApp');
    whatsapp.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${WHATSAPP_ICON}</svg>`;

    document.body.appendChild(folder);
    document.body.appendChild(whatsapp);

    const toggle = folder.querySelector('.floating-social-folder__toggle');
    const panel = folder.querySelector('.floating-social-folder__panel');

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      folder.classList.toggle('is-open', !open);
      panel.hidden = open;
    });

    document.addEventListener('click', (event) => {
      if (!folder.classList.contains('is-open')) return;
      if (folder.contains(event.target)) return;
      folder.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
    });

    if (document.querySelector('.mobile-join-fab')) {
      document.body.classList.add('has-mobile-join-fab');
    }
  }

  loadStylesheet();
  mountFloatingSocial();
})();
