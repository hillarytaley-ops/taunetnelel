(function () {
  'use strict';

  const header = document.querySelector('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  document.querySelectorAll('.footer-year').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  const hero = document.querySelector('.hero');
  const slides = document.querySelectorAll('.hero__slides .hero__slide');
  const dots = document.querySelectorAll('.hero__dot');
  const prevBtn = document.querySelector('.hero__arrow--prev');
  const nextBtn = document.querySelector('.hero__arrow--next');
  const pauseBtn = document.querySelector('.hero__pause');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = navigator.connection?.saveData === true;
  let current = 0;
  let timer;
  let autoplayPaused = false;
  let userPaused = false;

  function canPlayHeroVideo() {
    return !reducedMotion.matches && !saveData;
  }

  function getSlideMedia(slide) {
    return slide?.querySelector('.hero__media');
  }

  function useKenBurns(slide, enable) {
    if (!slide) return;
    slide.classList.toggle('hero__slide--ken-burns', enable);
  }

  function loadSlideBg(slide) {
    const media = getSlideMedia(slide);
    if (!media || !slide?.dataset.bg || slide.dataset.bgLoaded) return;
    media.style.backgroundImage = `url('${slide.dataset.bg}')`;
    slide.dataset.bgLoaded = 'true';
  }

  function pauseSlideVideo(slide) {
    slide?.querySelector('.hero__video')?.pause();
  }

  function pauseAllHeroVideos() {
    slides.forEach(pauseSlideVideo);
  }

  function prepareSlideVideo(slide) {
    if (!slide?.dataset.video || !canPlayHeroVideo()) {
      useKenBurns(slide, true);
      return null;
    }

    const media = getSlideMedia(slide);
    if (!media) return null;

    let video = slide.querySelector('.hero__video');
    if (!video) {
      video = document.createElement('video');
      video.className = 'hero__video';
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.preload = 'none';
      if (slide.dataset.bg) video.poster = slide.dataset.bg;
      video.addEventListener('error', () => {
        video.remove();
        useKenBurns(slide, true);
      });
      media.appendChild(video);
    }

    if (!video.dataset.srcLoaded) {
      video.src = slide.dataset.video;
      video.dataset.srcLoaded = 'true';
    }

    useKenBurns(slide, false);
    return video;
  }

  function playSlideVideo(slide) {
    if (userPaused || autoplayPaused) return;
    const video = prepareSlideVideo(slide);
    if (!video) return;
    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => useKenBurns(slide, true));
    }
  }

  function syncHeroMotion() {
    slides.forEach((slide, index) => {
      loadSlideBg(slide);
      if (index === current) {
        if (!userPaused && !autoplayPaused) playSlideVideo(slide);
        else pauseSlideVideo(slide);
      } else {
        pauseSlideVideo(slide);
      }
      if (!slide.dataset.video || !canPlayHeroVideo()) {
        useKenBurns(slide, true);
      }
    });
  }

  function goToSlide(n) {
    if (!slides.length) return;
    pauseSlideVideo(slides[current]);
    slides[current].classList.remove('active');
    if (dots[current]) {
      dots[current].classList.remove('active');
      dots[current].setAttribute('aria-selected', 'false');
    }
    current = (n + slides.length) % slides.length;
    loadSlideBg(slides[current]);
    slides[current].classList.add('active');
    if (dots[current]) {
      dots[current].classList.add('active');
      dots[current].setAttribute('aria-selected', 'true');
    }
    if (!userPaused && !autoplayPaused) playSlideVideo(slides[current]);
    else if (slides[current].dataset.video && canPlayHeroVideo()) {
      prepareSlideVideo(slides[current]);
    }
  }

  function next() { goToSlide(current + 1); }
  function prev() { goToSlide(current - 1); }

  function startAutoplay() {
    if (autoplayPaused || userPaused) return;
    clearInterval(timer);
    timer = setInterval(next, 7000);
  }

  function pauseAutoplay() {
    clearInterval(timer);
    autoplayPaused = true;
    pauseAllHeroVideos();
  }

  function resumeAutoplay() {
    autoplayPaused = false;
    startAutoplay();
    if (!userPaused) playSlideVideo(slides[current]);
  }

  function setPauseUi(paused) {
    if (!pauseBtn) return;
    pauseBtn.classList.toggle('is-paused', paused);
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
  }

  if (slides.length) {
    slides.forEach(loadSlideBg);
    syncHeroMotion();
    dots.forEach((dot, i) => dot.addEventListener('click', () => { goToSlide(i); resumeAutoplay(); }));
    if (prevBtn) prevBtn.addEventListener('click', () => { prev(); resumeAutoplay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { next(); resumeAutoplay(); });
    startAutoplay();

    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => {
        userPaused = !userPaused;
        if (userPaused) {
          pauseAutoplay();
        } else {
          resumeAutoplay();
        }
        setPauseUi(userPaused);
      });
    }

    reducedMotion.addEventListener('change', syncHeroMotion);

    if (hero) {
      hero.addEventListener('mouseenter', pauseAutoplay);
      hero.addEventListener('mouseleave', () => {
        if (!userPaused) resumeAutoplay();
      });
      hero.addEventListener('focusin', pauseAutoplay);
      hero.addEventListener('focusout', (e) => {
        if (!hero.contains(e.relatedTarget) && !userPaused) resumeAutoplay();
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pauseAutoplay();
      else if (!userPaused) resumeAutoplay();
    });
  }

  const menuToggle = document.querySelector('.menu-toggle');
  const mobileNav = document.querySelector('.mobile-nav');
  const mobileClose = document.querySelector('.mobile-nav__close');

  function openMobileNav() {
    if (!mobileNav) return;
    mobileNav.classList.add('open');
    mobileNav.setAttribute('aria-hidden', 'false');
    menuToggle?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open');
  }

  function closeMobileNav() {
    if (!mobileNav) return;
    mobileNav.classList.remove('open');
    mobileNav.setAttribute('aria-hidden', 'true');
    menuToggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
    menuToggle?.focus();
  }

  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', openMobileNav);
    mobileClose?.addEventListener('click', closeMobileNav);
    mobileNav.addEventListener('click', (e) => {
      if (e.target === mobileNav) closeMobileNav();
    });
    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMobileNav);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('open')) closeMobileNav();
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#') return;
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth' });
        closeMobileNav();
      }
    });
  });

  document.querySelectorAll('.newsletter').forEach((newsletter) => {
    const storageKey = newsletter.dataset.storageKey || 'taunet_newsletter_email';
    const newsletterMsg = newsletter.querySelector('.newsletter__message');
    const saved = localStorage.getItem(storageKey);
    const savedLabel = storageKey.includes('sports')
      ? `You're on the Sports Day notify list at ${saved}.`
      : `You're subscribed for updates at ${saved}.`;
    const successLabel = storageKey.includes('sports')
      ? (email) => `Thank you! We'll notify you at ${email} when Sports Day details are confirmed.`
      : (email) => `Thank you! You'll receive event updates at ${email}.`;

    if (saved && newsletterMsg) {
      newsletterMsg.hidden = false;
      newsletterMsg.textContent = savedLabel;
    }

    newsletter.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = newsletter.querySelector('input[type="email"]');
      const email = input?.value?.trim();
      if (!email) return;

      localStorage.setItem(storageKey, email);
      if (newsletterMsg) {
        newsletterMsg.hidden = false;
        newsletterMsg.classList.remove('is-error');
        newsletterMsg.textContent = successLabel(email);
      }
      input.value = '';
    });
  });

  if (new URLSearchParams(window.location.search).get('sent') === '1') {
    const inquiryMsg = document.querySelector('.inquiry-form__message');
    if (inquiryMsg) {
      inquiryMsg.hidden = false;
      inquiryMsg.classList.remove('is-error');
      inquiryMsg.textContent = inquiryMsg.dataset.success
        || 'Thank you! Your enquiry has been sent. We will respond within 2 business days.';
      const anchor = inquiryMsg.closest('[id]');
      const hash = anchor?.id || 'inquiry';
      history.replaceState(null, '', `${window.location.pathname}#${hash}`);
    }
  }

  function initEventFilters() {
    const filters = document.querySelector('.event-filters');
    if (!filters) return;

    const buttons = filters.querySelectorAll('.event-filters__btn');
    const items = document.querySelectorAll('.events-upcoming [data-event-filter]');
    const empty = document.querySelector('.events-filter-empty');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        buttons.forEach((b) => b.classList.toggle('is-active', b === btn));

        let visible = 0;
        items.forEach((item) => {
          const types = (item.dataset.eventFilter || '').split(/\s+/);
          const show = filter === 'all' || types.includes(filter);
          item.hidden = !show;
          if (show) visible += 1;
        });

        if (empty) empty.hidden = visible > 0;
      });
    });
  }

  function initPastEventsToggle() {
    const toggle = document.querySelector('.past-events__toggle');
    const hiddenItems = document.querySelectorAll('.past-event-card.is-collapsed');
    if (!toggle || !hiddenItems.length) return;

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      hiddenItems.forEach((item) => item.classList.toggle('is-hidden', expanded));
      toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      toggle.textContent = expanded ? 'Show more past events' : 'Show fewer past events';
    });
  }

  function initCommunityPrograms() {
    const wrap = document.querySelector('[data-community-programs]');
    if (!wrap) return;

    const tabs = wrap.querySelectorAll('[data-program]');
    const panels = wrap.querySelectorAll('[data-program-panel]');

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.dataset.program;
        tabs.forEach((t) => {
          const active = t === tab;
          t.classList.toggle('is-active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach((panel) => {
          const active = panel.dataset.programPanel === id;
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        });
      });
    });
  }

  function toggleCollapsiblePanel(panel, trigger, expanded) {
    const isOpen = expanded ?? trigger.getAttribute('aria-expanded') !== 'true';
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    panel.hidden = !isOpen;
    trigger.classList.toggle('is-open', isOpen);

    const labelShow = trigger.dataset.labelShow || 'Show details';
    const labelHide = trigger.dataset.labelHide || 'Hide details';
    if (trigger.classList.contains('collapsible-card__toggle')) {
      trigger.textContent = isOpen ? labelHide : labelShow;
    }
  }

  function bindCollapsibleTrigger(trigger, panel) {
    trigger.addEventListener('click', () => toggleCollapsiblePanel(panel, trigger));
  }

  function isAccordionSubheader(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches('h3, h4')) return true;
    if (!el.matches('p')) return false;
    const strong = el.querySelector(':scope > strong');
    if (!strong) return false;
    return el.textContent.trim() === strong.textContent.trim();
  }

  function wrapAccordionSections(container) {
    if (!container || container.dataset.accordionReady === 'true') return;
    container.dataset.accordionReady = 'true';

    const items = Array.from(container.children);
    let index = 0;

    while (index < items.length) {
      const el = items[index];
      if (!isAccordionSubheader(el)) {
        index += 1;
        continue;
      }

      const title = el.textContent.trim();
      el.remove();

      const section = document.createElement('div');
      section.className = 'content-accordion';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'content-accordion__trigger';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.innerHTML = `<span class="content-accordion__title">${title}</span><span class="content-accordion__icon" aria-hidden="true"></span>`;

      const panel = document.createElement('div');
      panel.className = 'content-accordion__panel';
      panel.hidden = true;

      index += 1;
      while (index < items.length) {
        const next = items[index];
        if (isAccordionSubheader(next)) break;
        if (next.matches('.community-card__actions')) break;
        panel.appendChild(next);
        index += 1;
      }

      section.appendChild(trigger);
      section.appendChild(panel);
      container.appendChild(section);
      bindCollapsibleTrigger(trigger, panel);
    }
  }

  function initTopicCards(root) {
    root.querySelectorAll('.community-card__body > ul > li, .community-program ul > li').forEach((li) => {
      if (li.classList.contains('topic-card')) return;

      const strong = li.querySelector(':scope > strong');
      if (!strong) return;

      const title = strong.textContent.replace(/:\s*$/, '').trim();
      const detail = document.createElement('div');
      strong.remove();
      detail.innerHTML = li.innerHTML.trim();
      if (!detail.textContent.trim()) return;

      li.classList.add('topic-card');
      li.innerHTML = '';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'topic-card__trigger';
      trigger.setAttribute('aria-expanded', 'false');
      trigger.innerHTML = `<span class="topic-card__title">${title}</span><span class="topic-card__chevron" aria-hidden="true"></span>`;

      const panel = document.createElement('div');
      panel.className = 'topic-card__panel';
      panel.hidden = true;
      panel.appendChild(detail);

      li.appendChild(trigger);
      li.appendChild(panel);
      bindCollapsibleTrigger(trigger, panel);
    });
  }

  function addMainCardToggle(headerEl, panelEl, labelShow, labelHide) {
    const panelId = `collapsible-${Math.random().toString(36).slice(2, 9)}`;
    panelEl.id = panelId;
    panelEl.classList.add('collapsible-card__panel');
    panelEl.hidden = true;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'collapsible-card__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panelId);
    toggle.dataset.labelShow = labelShow;
    toggle.dataset.labelHide = labelHide;
    toggle.textContent = labelShow;

    headerEl.classList.add('collapsible-card__header');
    headerEl.appendChild(toggle);
    bindCollapsibleTrigger(toggle, panelEl);
  }

  function initCollapsibleSections() {
    const page = document.body.dataset.page;
    if (page !== 'community' && page !== 'welfare') return;

    if (page === 'welfare') {
      document.querySelectorAll('.welfare-card').forEach((card) => {
        if (card.dataset.collapsibleReady === 'true') return;
        card.dataset.collapsibleReady = 'true';
        card.classList.add('collapsible-card');

        const eyebrow = card.querySelector(':scope > .eyebrow');
        const heading = card.querySelector(':scope > h2');
        if (!heading) return;

        const header = document.createElement('div');
        header.className = 'collapsible-card__header';
        if (eyebrow) header.appendChild(eyebrow);
        header.appendChild(heading);

        const panel = document.createElement('div');
        panel.className = 'collapsible-card__panel';
        panel.hidden = true;

        Array.from(card.children).forEach((child) => {
          if (child !== eyebrow && child !== heading) panel.appendChild(child);
        });

        card.appendChild(header);
        card.appendChild(panel);
        addMainCardToggle(header, panel, 'Read more', 'Show less');
      });
    }

    if (page === 'community') {
      document.querySelectorAll('.community-card:not(.community-enquiry-cta)').forEach((card) => {
        if (card.dataset.collapsibleReady === 'true') return;
        card.dataset.collapsibleReady = 'true';
        card.classList.add('collapsible-card');

        const banner = card.querySelector('.community-section-banner__content, .community-sports__hero-content');
        const inner = card.querySelector('.community-card__inner');
        const programs = card.querySelector('.community-programs');

        if (banner && inner) {
          addMainCardToggle(banner, inner, 'Show program details', 'Hide details');
          wrapAccordionSections(inner.querySelector('.community-card__body'));
          initTopicCards(inner);
          return;
        }

        const sportsHero = card.querySelector('.community-sports__hero-content');
        if (sportsHero) {
          const lead = sportsHero.querySelector('.community-card__lead');
          const panel = document.createElement('div');
          panel.className = 'collapsible-card__panel';
          Array.from(sportsHero.children).forEach((child) => {
            if (child === lead || child.matches('.eyebrow, h2')) return;
            panel.appendChild(child);
          });
          sportsHero.appendChild(panel);
          addMainCardToggle(sportsHero, panel, 'Show more', 'Show less');
          return;
        }

        if (programs) {
          const headerBits = card.querySelectorAll(':scope > .eyebrow, :scope > h2, :scope > .community-card__lead');
          const header = document.createElement('div');
          header.className = 'collapsible-card__header collapsible-card__header--stacked';
          headerBits.forEach((el) => header.appendChild(el));
          card.insertBefore(header, programs);
          addMainCardToggle(header, programs, 'Show groups & programs', 'Hide groups');
          card.querySelectorAll('.community-program').forEach((panel) => {
            wrapAccordionSections(panel);
            initTopicCards(panel);
          });
        }
      });
    }
  }

  function initPageSubnav() {
    const subnav = document.querySelector('.page-subnav');
    if (!subnav) return;

    const links = subnav.querySelectorAll('a[href^="#"]');
    const sections = Array.from(links)
      .map((link) => document.querySelector(link.getAttribute('href')))
      .filter(Boolean);

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          links.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
          });
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );

    sections.forEach((section) => observer.observe(section));
  }

  function initScrollReveal() {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length || prefersReduced) {
      reveals.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    reveals.forEach((el) => observer.observe(el));
  }

  function initScrollProgress() {
    const bar = document.getElementById('scrollProgress');
    if (!bar) return;

    function updateProgress() {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const progress = height > 0 ? (scrollTop / height) * 100 : 0;
      bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
  }

  function initRevealOnScroll() {
    const items = document.querySelectorAll('.reveal-on-scroll');
    if (!items.length) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -30px 0px' }
    );

    items.forEach((el) => observer.observe(el));
  }

  initEventFilters();
  initPastEventsToggle();
  initCommunityPrograms();
  initCollapsibleSections();
  initPageSubnav();
  initScrollReveal();
  initScrollProgress();
  initRevealOnScroll();

  function initFlatMainNav() {
    document.querySelectorAll('.main-nav > ul').forEach((ul) => {
      if (ul.dataset.navFlat === 'true' || !ul.querySelector('.has-dropdown')) return;

      const pathPrefix = (() => {
        const sample = ul.querySelector('a[href*="about"]')?.getAttribute('href') || 'about.html';
        return sample.replace(/about\.html.*$/, '');
      })();

      const flatLinks = [
        { href: `${pathPrefix}index.html`, label: 'Home', nav: 'home' },
        { href: `${pathPrefix}about.html`, label: 'About', nav: 'about' },
        { href: `${pathPrefix}events.html`, label: 'Events', nav: 'events' },
        { href: `${pathPrefix}gallery.html`, label: 'Gallery', nav: 'gallery' },
        { href: `${pathPrefix}community.html`, label: 'Community Hub', nav: 'community' },
        { href: `${pathPrefix}sponsorship.html`, label: 'Sponsorship', nav: 'sponsorship' },
        { href: `${pathPrefix}welfare.html`, label: 'Welfare', nav: 'welfare' },
        { href: `${pathPrefix}membership.html`, label: 'Membership', nav: 'membership' },
        { href: `${pathPrefix}contact.html`, label: 'Contact', nav: 'contact' },
      ];

      ul.innerHTML = flatLinks
        .map(
          ({ href, label, nav }) =>
            `<li><a href="${href}" data-nav="${nav}">${label}</a></li>`
        )
        .join('');
      ul.dataset.navFlat = 'true';
    });
  }

  initFlatMainNav();

  const currentPage = document.body.dataset.page;
  if (currentPage) {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === currentPage);
    });
  }

  const eventStrip = document.querySelector('.event-strip[data-event-date]');
  if (eventStrip) {
    const targetDate = new Date(eventStrip.dataset.eventDate + 'T00:00:00');
    const daysEl = eventStrip.querySelector('[data-days]');

    function updateCountdown() {
      if (!daysEl) return;
      const now = new Date();
      const diff = targetDate - now;
      if (diff <= 0) {
        daysEl.textContent = '0';
        return;
      }
      daysEl.textContent = String(Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }

    updateCountdown();
    setInterval(updateCountdown, 60000);
  }

  function initTribalStrips() {
    document.querySelectorAll('.hero, .page-hero, .site-footer').forEach((el) => {
      if (el.querySelector('.tribal-strip')) return;

      ['top', 'bottom'].forEach((pos) => {
        const strip = document.createElement('div');
        strip.className = `tribal-strip tribal-strip--${pos}`;
        strip.setAttribute('aria-hidden', 'true');
        const track = document.createElement('div');
        track.className = 'tribal-strip__track';
        strip.appendChild(track);
        if (pos === 'top') el.insertBefore(strip, el.firstChild);
        else el.appendChild(strip);
      });
    });
  }

  function getLogoAsset() {
    const headerImg = document.querySelector('.site-header .logo img');
    if (headerImg) {
      return {
        src: headerImg.getAttribute('src') || 'wp-content/uploads/2025/09/taunet_nelel_logo-preview.png',
        alt: headerImg.getAttribute('alt') || 'Taunet Nelel',
      };
    }

    return {
      src: 'wp-content/uploads/2025/09/taunet_nelel_logo-preview.png',
      alt: 'Taunet Nelel',
    };
  }

  function createLogoRingMarkup(logoSrc, alt = '') {
    const safeAlt = alt.replace(/"/g, '&quot;');
    return `
      <div class="hero__logo-ring">
        <div class="hero__orbit hero__orbit--outer" aria-hidden="true"></div>
        <div class="hero__orbit hero__orbit--inner" aria-hidden="true"></div>
        <div class="logo-spinner">
          <img src="${logoSrc}" alt="${safeAlt}" class="logo-spinner__img" width="120" height="105" decoding="async">
        </div>
      </div>`;
  }

  function initHeaderLogo() {
    const logoLink = document.querySelector('.site-header .logo');
    if (!logoLink || logoLink.classList.contains('logo--spinner')) return;

    const img = logoLink.querySelector('img');
    if (!img) return;

    const { src, alt } = getLogoAsset();
    logoLink.classList.add('logo--spinner');
    logoLink.innerHTML = createLogoRingMarkup(src, alt);
  }

  function initPageHeroLayout() {
    if (document.body.dataset.page === 'home') return;

    const { src: logoSrc } = getLogoAsset();

    document.querySelectorAll('.page-hero').forEach((hero) => {
      if (hero.querySelector('.page-hero__layout')) return;

      const container = hero.querySelector('.container');
      if (!container) return;

      const layout = document.createElement('div');
      layout.className = 'page-hero__layout';

      const logoLeft = document.createElement('div');
      logoLeft.className = 'page-hero__logo page-hero__logo--left';
      logoLeft.setAttribute('aria-hidden', 'true');
      logoLeft.innerHTML = createLogoRingMarkup(logoSrc);

      const logoRight = document.createElement('div');
      logoRight.className = 'page-hero__logo page-hero__logo--right';
      logoRight.setAttribute('aria-hidden', 'true');
      logoRight.innerHTML = createLogoRingMarkup(logoSrc);

      container.classList.add('page-hero__content');
      hero.insertBefore(layout, container);
      layout.appendChild(logoLeft);
      layout.appendChild(container);
      layout.appendChild(logoRight);
    });
  }

  function initFooterSocial() {
    document.querySelectorAll('.site-footer .footer-brand .social-links').forEach((social) => {
      const grid = social.closest('.footer-grid');
      if (!grid || social.classList.contains('footer-social')) return;

      social.classList.add('footer-social');
      grid.appendChild(social);
    });
  }

  initTribalStrips();
  initHeaderLogo();
  initPageHeroLayout();
  initFooterSocial();

  function initFloatingSocial() {
    if (document.querySelector('.floating-social-folder')) return;
    if (!document.querySelector('.site-header')) return;

    const base =
      document.querySelector('link[href*="assets/css/main.css"]')?.getAttribute('href')?.replace(/assets\/css\/main\.css.*$/, '') ||
      '';

    const script = document.createElement('script');
    script.src = `${base}assets/floating-social/floating-social.js`;
    script.defer = true;
    document.body.appendChild(script);
  }

  initFloatingSocial();

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox?.querySelector('.lightbox__img');
  const lightboxCaption = lightbox?.querySelector('.lightbox__caption');
  const lightboxClose = lightbox?.querySelector('.lightbox__close');

  function openLightbox(src, caption) {
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightboxImg.alt = caption || 'Community photo preview';
    if (lightboxCaption) lightboxCaption.textContent = caption || '';
    lightbox.hidden = false;
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('nav-open');
    lightboxClose?.focus();
  }

  function closeLightbox() {
    if (!lightbox || !lightboxImg) return;
    lightbox.hidden = true;
    lightbox.setAttribute('aria-hidden', 'true');
    lightboxImg.src = '';
    document.body.classList.remove('nav-open');
  }

  document.querySelectorAll('.photo-strip__item--lightbox').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(item.dataset.lightbox, item.dataset.caption);
    });
  });

  lightboxClose?.addEventListener('click', closeLightbox);
  lightbox?.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lightbox && !lightbox.hidden) closeLightbox();
  });
})();
