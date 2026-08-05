(function (global) {
  'use strict';

  const RECENT_DELAY_DAYS = 0;
  const RECENT_MONTHS = 2;

  function escapeHtml(value) {
    return global.TaunetSecurity?.escapeHtml
      ? global.TaunetSecurity.escapeHtml(value)
      : String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
  }

  function safeUrl(value) {
    return global.TaunetSecurity?.safeUrl
      ? global.TaunetSecurity.safeUrl(value)
      : String(value ?? '').replace(/^(javascript|data|vbscript):/i, '');
  }

  let EVENTS = [
    {
      id: 'men-s-camp-2026-08-01',
      title: "Men's Camp",
      start: '2026-08-01T21:00:00+00:00',
      end: '2026-08-02T21:00:00+00:00',
      image: 'wp-content/uploads/2025/09/Celebration.jpg',
      location: 'Springbrook',
      summary: 'All States Men’s Camp — book and pay by PayID or bank transfer ($100 single / $150 two people).',
      meta: '1–2 August 2026 · Springbrook',
      badge: 'Recently ended',
      featured: true,
      bookingUrl: 'pay/event.html?event=men-s-camp-2026-08-01',
      feeCents: 10000,
      galleryUrl: 'gallery.html#men-s-camp-2026-08-01',
      registrationOpen: true
    },
    {
      id: 'cultural-week-2026',
      title: 'Winter Cultural Week',
      start: '2026-07-01T10:00:00+10:00',
      end: '2026-07-05T18:00:00+10:00',
      image: 'wp-content/uploads/2025/09/Celebration.jpg',
      location: 'Victoria · multiple venues',
      summary: 'A week of language, culture, and community activities across Victoria.',
      meta: '1–5 July 2026 · daily sessions',
      badge: 'Culture week',
      featured: true,
      galleryUrl: 'gallery.html#agm-2025',
      registrationOpen: false
    },
    {
      id: 'community-picnic-2026',
      title: 'Taunet Community Picnic',
      start: '2025-08-10T11:00:00+10:00',
      end: '2025-08-10T16:00:00+10:00',
      image: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
      location: 'Victoria',
      summary: 'Family picnic with food, games, and music. Alcohol-free and open to all ages.',
      meta: 'Saturday, 10 August 2025 · 11am–4pm',
      badge: 'Family day',
      featured: false,
      galleryUrl: 'gallery.html',
      registrationOpen: false
    },
    {
      id: 'language-festival-2026',
      title: 'Kalenjin Language Festival',
      start: '2025-09-21T10:00:00+10:00',
      end: '2025-09-21T15:00:00+10:00',
      image: 'wp-content/uploads/2025/09/Celebration.jpg',
      location: 'Melbourne',
      summary: 'Celebrate Kalenjin language through workshops, performances, and youth activities.',
      meta: 'Sunday, 21 September 2025 · 10am–3pm',
      badge: 'Culture',
      featured: false,
      galleryUrl: 'gallery.html',
      registrationOpen: false
    },
    {
      id: 'midyear-social-2026',
      title: 'Mid-Year Community Social',
      start: '2026-06-28T14:00:00+10:00',
      end: '2026-06-28T20:00:00+10:00',
      image: 'wp-content/uploads/2025/09/Celebration.jpg',
      location: 'Almas Receptions',
      summary: 'An evening social bringing members together for food, music, and community updates.',
      meta: 'Saturday, 28 June 2026 · 2pm–8pm',
      badge: 'Recently ended',
      galleryUrl: 'gallery.html#gala-2026',
      registrationOpen: false
    },
    {
      id: 'gala-2026',
      title: 'Taunet Nelel Gala 2026',
      start: '2026-04-18T14:00:00+10:00',
      end: '2026-04-18T23:00:00+10:00',
      image: 'wp-content/uploads/2026/01/Taunet-Nelel-Galla.jpg',
      location: 'Almas Receptions, Victoria',
      summary: 'Celebrate five years of Taunet Nelel with music, dancing, and delicious food.',
      meta: 'Saturday, 18 April 2026 · 2pm–11pm · Almas Receptions, Victoria',
      badge: 'Featured',
      featured: true,
      bookingUrl: 'https://www.eventbrite.com.au/e/taunet-nelel-2026-gala-tickets-1980043622777',
      calendarUrl: 'assets/events/taunet-nelel-gala-2026.ics',
      galleryUrl: 'gallery.html#gala-2026',
      registrationOpen: false
    },
    {
      id: 'sports-day-2026',
      title: 'Sports Day',
      start: '2026-04-19T09:00:00+10:00',
      end: '2026-04-19T17:00:00+10:00',
      image: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
      location: 'Victoria · family sports day',
      summary: 'A fun-filled family sports day for all ages.',
      meta: 'Sunday, 19 April 2026 · Victoria',
      badge: 'Family day',
      galleryUrl: 'gallery.html#sports-day',
      registrationOpen: false
    },
    {
      id: 'agm-2025',
      title: 'Annual General Meeting',
      start: '2025-11-29T10:00:00+11:00',
      end: '2025-11-29T17:00:00+11:00',
      image: 'wp-content/uploads/2025/09/Celebration.jpg',
      location: 'Zoom',
      summary: 'Annual general meeting for Taunet Nelel members.',
      meta: 'Zoom · 10am – 5pm',
      galleryUrl: 'gallery.html#agm-2025',
      registrationOpen: false
    },
    {
      id: 'pageant-2025',
      title: 'Mr & Miss Taunet 2025',
      start: '2025-11-08T14:00:00+11:00',
      end: '2025-11-08T17:00:00+11:00',
      image: 'wp-content/uploads/2025/11/TN-beauty-peagant.jpg',
      location: 'Almas Reception',
      summary: 'Taunet beauty pageant celebrating culture and community.',
      meta: 'Almas Reception · 2pm – 5pm',
      galleryUrl: 'gallery.html#pageant-2025',
      registrationOpen: false
    },
    {
      id: 'volleyball-2025',
      title: 'Volleyball Tournament',
      start: '2025-10-19T14:00:00+11:00',
      end: '2025-10-19T17:00:00+11:00',
      image: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
      location: 'Dandenong Stadium',
      summary: 'Community volleyball tournament.',
      meta: 'Dandenong Stadium · 2pm – 5pm',
      galleryUrl: 'gallery.html#volleyball-2025',
      registrationOpen: false
    },
    {
      id: 'gala-2025',
      title: 'Taunet Nelel Gala',
      start: '2025-04-26T14:00:00+10:00',
      end: '2025-04-26T23:00:00+10:00',
      image: 'wp-content/uploads/2025/10/TAUNET-NELE-GALA.jpg',
      location: 'Dandenong Stadium',
      summary: 'Annual gala celebration.',
      meta: 'Dandenong Stadium · 2pm – 11pm',
      galleryUrl: 'gallery.html#gala-2025',
      registrationOpen: false
    }
  ];

  const PHASE_META = {
    upcoming: { label: 'Upcoming Events', icon: '◷', hint: 'Empty until new dates are published', mod: 'upcoming' },
    present: { label: 'Present Events', icon: '●', hint: 'Live now until the event end time', mod: 'present', live: true },
    'most-recent': { label: 'Most Recent', icon: '✦', hint: 'The latest event that has finished', mod: 'recent' },
    past: { label: 'Past Events', icon: '◷', hint: 'Earlier events · newest first', mod: 'past' }
  };

  const PHASE_ORDER = ['upcoming', 'present', 'most-recent', 'past'];

  function phaseLabel(phase) {
    return PHASE_META[phase]?.label || phase;
  }

  function renderPhaseFlowStrip() {
    return `
      <div class="events-phase-flow" aria-hidden="true">
        <div class="events-phase-flow__track">
          ${PHASE_ORDER.map((phase, i) => {
            const meta = PHASE_META[phase];
            const arrow = i < PHASE_ORDER.length - 1 ? '<span class="events-phase-flow__arrow">→</span>' : '';
            return `
              <span class="events-phase-flow__step events-phase-flow__step--${meta.mod}${meta.live ? ' events-phase-flow__step--live' : ''}">
                <span class="events-phase-flow__dot"></span>${meta.short || meta.label.split(' ')[0]}
              </span>${arrow}`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function renderPhaseHeader(phase, count) {
    const meta = PHASE_META[phase];
    return `
      <header class="events-phase-column__head events-phase-column__head--${meta.mod}">
        <div class="events-phase-column__title-wrap">
          <span class="events-phase-column__icon${meta.live ? ' events-phase-column__icon--live' : ''}" aria-hidden="true">${meta.icon}</span>
          <div>
            <h3>${meta.label}</h3>
            <p class="events-phase-column__hint">${meta.hint}</p>
          </div>
        </div>
        <span class="events-phase-column__count">${count}</span>
      </header>
    `;
  }

  function renderPhaseBlockHeader(phase, count) {
    const meta = PHASE_META[phase];
    return `
      <header class="event-phase-block__head event-phase-block__head--${meta.mod}">
        <div class="event-phase-block__title-wrap">
          <span class="events-phase-column__icon${meta.live ? ' events-phase-column__icon--live' : ''}" aria-hidden="true">${meta.icon}</span>
          <div>
            <h3 class="event-phase-block__title">${meta.label}</h3>
            <p class="events-phase-column__hint">${meta.hint}</p>
          </div>
        </div>
        <span class="event-phase-count">${count}</span>
      </header>
    `;
  }

  function parseDate(value) {
    return new Date(value);
  }

  function getEventPhase(event, now) {
    const override = String(event.phaseOverride || event.phase_override || '').trim();
    if (override && override !== 'auto' && ['upcoming', 'present', 'most-recent', 'past'].includes(override)) {
      return override;
    }

    const current = now || new Date();
    const start = parseDate(event.start);
    const end = parseDate(event.end || event.start);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return 'past';
    }

    const currentMs = current.getTime();
    const startMs = start.getTime();
    const endMs = end.getTime();

    // Upcoming until the event starts.
    if (currentMs < startMs) return 'upcoming';

    // Present only while the event is in progress (inclusive of end time).
    if (currentMs <= endMs) return 'present';

    // Ended events default to Past; categorizeEvents promotes only the newest one to Most Recent.
    return 'past';
  }

  function hasPhaseOverride(event) {
    const override = String(event.phaseOverride || event.phase_override || '').trim();
    if (!override || override === 'auto') return '';
    if (['upcoming', 'present', 'most-recent', 'past'].includes(override)) return override;
    return '';
  }

  function categorizeEvents(now) {
    const current = now || new Date();
    const groups = {
      upcoming: [],
      present: [],
      'most-recent': [],
      past: []
    };

    EVENTS.forEach((event) => {
      const phase = getEventPhase(event, current);
      groups[phase].push(event);
    });

    // Safety net: never leave an auto-dated ended event in Upcoming.
    groups.upcoming = groups.upcoming.filter((event) => {
      if (hasPhaseOverride(event)) return true;
      const end = parseDate(event.end || event.start);
      return !Number.isNaN(end.getTime()) && end.getTime() >= current.getTime();
    });

    const byStart = (a, b) => parseDate(a.start) - parseDate(b.start);
    const byEndDesc = (a, b) => parseDate(b.end || b.start) - parseDate(a.end || a.start);

    // Most Recent = only the single newest ended event (e.g. Men's Camp).
    // Everything else that has ended stays in Past, newest first.
    const endedPool = [...groups['most-recent'], ...groups.past];
    const lockedPast = [];
    const candidates = [];

    endedPool.forEach((event) => {
      const override = hasPhaseOverride(event);
      if (override === 'past') {
        lockedPast.push(event);
        return;
      }
      const end = parseDate(event.end || event.start);
      if (Number.isNaN(end.getTime()) || end.getTime() >= current.getTime()) {
        lockedPast.push(event);
        return;
      }
      candidates.push(event);
    });

    candidates.sort(byEndDesc);
    const newest = candidates[0] || null;
    groups['most-recent'] = newest ? [newest] : [];
    groups.past = [...lockedPast, ...candidates.filter((event) => event !== newest)].sort(byEndDesc);

    groups.upcoming.sort(byStart);
    groups.present.sort(byStart);

    return groups;
  }

  function dateBadge(event) {
    const start = parseDate(event.start);
    if (Number.isNaN(start.getTime())) {
      return { day: '—', month: '', monthLong: '', short: '—', year: '' };
    }
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatToParts(start);
    const day = parts.find((p) => p.type === 'day')?.value || '';
    const month = parts.find((p) => p.type === 'month')?.value || '';
    const year = parts.find((p) => p.type === 'year')?.value || '';
    // Always include the year so 2025 past events are not mistaken for current dates
    const short = `${day} ${month} ${year}`;
    return {
      day,
      month,
      monthLong: `${month} ${year}`,
      short,
      year: String(year),
    };
  }

  function assetPath(path, prefix) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${prefix || ''}${path}`;
  }

  function phaseBadge(event, phase) {
    if (phase === 'present') return 'Live now';
    if (phase === 'most-recent') return 'Recently ended';
    return event.badge || '';
  }

  function emptyMessage(phase) {
    const messages = {
      upcoming: 'No upcoming events yet — this column stays empty until the committee publishes new dates.',
      present: 'No events are running right now.',
      'most-recent': 'No recently finished event to show yet.',
      past: 'No past events to display yet.'
    };
    return messages[phase] || 'No events in this category.';
  }

  function renderUpcomingCard(event, prefix, featured) {
    const badge = dateBadge(event);
    const cls = featured ? 'upcoming-event upcoming-event--featured' : 'upcoming-event upcoming-event--secondary';
    const mediaCls = featured ? 'upcoming-event__poster' : 'upcoming-event__thumb';
    const img = escapeHtml(safeUrl(assetPath(event.image, prefix)));
    const title = escapeHtml(event.title);
    const booking = safeUrl(event.bookingUrl);
    const calendar = safeUrl(assetPath(event.calendarUrl, prefix));

    let actions = '';
    if (booking) {
      actions += `<a href="${escapeHtml(booking)}" class="btn btn--accent"${booking.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>Booking</a>`;
    }
    if (calendar) {
      actions += `<a href="${escapeHtml(calendar)}" class="btn btn--outline" download>Add to calendar</a>`;
    }

    return `
      <article class="${cls}">
        <figure class="${mediaCls}">
          <img src="${img}" alt="${title}" width="480" height="320" loading="lazy">
          <div class="upcoming-event__date-badge">
            <span class="day">${escapeHtml(badge.day)}</span>
            <span class="month">${escapeHtml(badge.month)}</span>
          </div>
        </figure>
        <div class="upcoming-event__details">
          ${event.badge ? `<div class="upcoming-event__badges"><span class="event-card__badge">${escapeHtml(event.badge)}</span></div>` : ''}
          <h3>${title}</h3>
          <p class="upcoming-event__meta">${escapeHtml(event.meta || event.location)}</p>
          ${event.summary ? `<p class="upcoming-event__desc">${escapeHtml(event.summary)}</p>` : ''}
          ${actions ? `<div class="upcoming-event__actions">${actions}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderPresentCard(event, prefix) {
    const badge = dateBadge(event);
    const img = escapeHtml(safeUrl(assetPath(event.image, prefix)));
    const title = escapeHtml(event.title);

    return `
      <article class="upcoming-event upcoming-event--featured upcoming-event--present">
        <figure class="upcoming-event__poster">
          <img src="${img}" alt="${title}" width="480" height="320" loading="lazy">
          <div class="upcoming-event__date-badge">
            <span class="day">${escapeHtml(badge.day)}</span>
            <span class="month">${escapeHtml(badge.month)}</span>
          </div>
        </figure>
        <div class="upcoming-event__details">
          <div class="upcoming-event__badges">
            <span class="event-card__badge event-card__badge--live">Live now</span>
          </div>
          <h3>${title}</h3>
          <p class="upcoming-event__meta">${escapeHtml(event.meta || event.location)}</p>
          ${event.summary ? `<p class="upcoming-event__desc">${escapeHtml(event.summary)}</p>` : ''}
        </div>
      </article>
    `;
  }

  function renderGridCard(event, prefix, phase) {
    const badge = dateBadge(event);
    const img = escapeHtml(safeUrl(assetPath(event.image, prefix)));
    const href = escapeHtml(safeUrl(event.galleryUrl ? assetPath(event.galleryUrl, prefix) : '#') || '#');
    const phaseBadgeText = phaseBadge(event, phase);
    const title = escapeHtml(event.title);

    return `
      <article class="past-event-card past-event-card--${escapeHtml(phase)}">
        <a href="${href}" class="past-event-card__media">
          <img src="${img}" alt="${title}" width="320" height="200" loading="lazy">
          <div class="past-event-card__date"><span class="day">${escapeHtml(badge.day)}</span><span class="month">${escapeHtml(badge.monthLong)}</span></div>
        </a>
        <div class="past-event-card__body">
          ${phaseBadgeText ? `<span class="event-card__badge event-card__badge--phase">${escapeHtml(phaseBadgeText)}</span>` : ''}
          <h3>${title}</h3>
          <p>${escapeHtml(event.meta || event.location)}</p>
        </div>
      </article>
    `;
  }

  function renderCompactEventItem(event, prefix, phase) {
    const badge = dateBadge(event);
    const img = escapeHtml(safeUrl(assetPath(event.image, prefix)));
    const rawHref = event.galleryUrl
      ? assetPath(event.galleryUrl, prefix)
      : event.bookingUrl || '#';
    const href = escapeHtml(safeUrl(rawHref) || '#');
    const booking = safeUrl(
      event.bookingUrl?.startsWith('http') ? event.bookingUrl : assetPath(event.bookingUrl, prefix)
    );
    const linkAttrs = booking?.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
    const meta = PHASE_META[phase];
    const phaseLabelText = phase === 'present' ? 'Live now' : phase === 'most-recent' ? 'Recent' : phase === 'upcoming' ? 'Upcoming' : '';
    const title = escapeHtml(event.title);

    const bookHref = booking
      ? escapeHtml(booking)
      : event.feeCents > 0
        ? escapeHtml(safeUrl(assetPath(`pay/event.html?event=${encodeURIComponent(event.id)}`, prefix)) || '')
        : '';
    const bookAttrs = booking?.startsWith('http') ? ' target="_blank" rel="noopener"' : '';

    let action = '';
    if (bookHref && (phase === 'upcoming' || phase === 'present' || phase === 'most-recent')) {
      action = `<a href="${bookHref}" class="events-phase-item__action events-phase-item__action--book"${bookAttrs}>Book &amp; pay →</a>`;
    }
    if ((phase === 'past' || phase === 'most-recent') && event.galleryUrl) {
      const galleryAction = `<a href="${href}" class="events-phase-item__action events-phase-item__action--gallery">Gallery →</a>`;
      action = action ? `${action}${galleryAction}` : galleryAction;
    } else if (!action && phase === 'present') {
      action = `<span class="events-phase-item__action events-phase-item__action--live">Join us today</span>`;
    }

    return `
      <article class="events-phase-item events-phase-item--${meta.mod}">
        <a href="${href}" class="events-phase-item__media"${event.galleryUrl ? '' : linkAttrs}>
          <img src="${img}" alt="${title}" width="120" height="80" loading="lazy">
          <span class="events-phase-item__overlay"></span>
          <span class="events-phase-item__date">${escapeHtml(badge.short)}</span>
        </a>
        <div class="events-phase-item__body">
          ${phaseLabelText ? `<span class="events-phase-item__badge events-phase-item__badge--${meta.mod}">${phaseLabelText}</span>` : ''}
          <h4>${title}</h4>
          <p>${escapeHtml(event.meta || event.location)}</p>
          ${action}
        </div>
      </article>
    `;
  }

  function renderPhaseSection(phase, events, prefix, compact) {
    if (compact) {
      if (!events.length) {
        const icon = PHASE_META[phase]?.icon || '◷';
        return `<div class="events-phase-empty"><span class="events-phase-empty__icon" aria-hidden="true">${icon}</span><p>${emptyMessage(phase)}</p></div>`;
      }
      return `<div class="events-phase-list">${events.map((e) => renderCompactEventItem(e, prefix, phase)).join('')}</div>`;
    }

    let body = '';

    if (!events.length) {
      body = `<div class="events-upcoming-empty"><p>${emptyMessage(phase)}${phase === 'upcoming' ? ' <a href="#inquiry">Send an enquiry</a>.' : ''}</p></div>`;
    } else if (phase === 'upcoming') {
      body = '<div class="events-upcoming-stack">';
      events.forEach((event, index) => {
        if (index === 1) body += '<p class="events-upcoming-stack__note">Also coming up</p>';
        body += renderUpcomingCard(event, prefix, index === 0 || event.featured);
      });
      body += '</div>';
    } else if (phase === 'present') {
      body = `<div class="events-upcoming-stack">${events.map((e) => renderPresentCard(e, prefix)).join('')}</div>`;
    } else {
      body = `<div class="past-events-grid past-events-grid--compact">${events.map((e) => renderGridCard(e, prefix, phase)).join('')}</div>`;
    }

    return body;
  }

  function renderPublicPage() {
    const groups = categorizeEvents();
    const row = document.querySelector('.events-phases-row');
    const flowMount = document.querySelector('[data-events-phase-flow]');

    // Public page: skip the phase-flow legend (column headers already explain phases).
    if (flowMount) flowMount.innerHTML = '';

    if (row) {
      const visiblePhases = PHASE_ORDER.filter(
        (phase) => phase !== 'present' || groups.present.length > 0
      );
      row.classList.toggle('events-phases-row--three', visiblePhases.length === 3);
      row.classList.toggle('events-phases-row--four', visiblePhases.length === 4);
      row.innerHTML = visiblePhases.map((phase) => {
        const meta = PHASE_META[phase];
        const sectionId = phase === 'most-recent' ? 'most-recent' : phase;
        return `
          <section class="events-phase-column events-phase-column--${meta.mod}" id="${sectionId}" aria-labelledby="${sectionId}-heading">
            ${renderPhaseHeader(phase, groups[phase].length).replace(`<h3>`, `<h3 id="${sectionId}-heading">`)}
            <div id="events-${phase}-root" class="events-phase-column__body" aria-live="polite">
              ${renderPhaseSection(phase, groups[phase], '', true)}
            </div>
          </section>
        `;
      }).join('');

      // Compact live status when nothing is running (instead of an empty column).
      row.parentElement?.querySelectorAll('.events-live-status').forEach((el) => el.remove());
      if (!groups.present.length) {
        const status = document.createElement('p');
        status.className = 'events-live-status';
        status.innerHTML = '<span class="events-live-status__dot" aria-hidden="true"></span> No events are live right now';
        row.insertAdjacentElement('beforebegin', status);
      }
    } else {
      PHASE_ORDER.forEach((phase) => {
        const root = document.getElementById(`events-${phase}-root`);
        if (root) root.innerHTML = renderPhaseSection(phase, groups[phase], '', true);
        const countEl = document.querySelector(`[data-events-count="${phase}"]`);
        if (countEl) countEl.textContent = String(groups[phase].length);
      });
    }
  }

  function formatShortDate(event) {
    const start = parseDate(event.start);
    if (Number.isNaN(start.getTime())) return '—';
    return start.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Australia/Melbourne',
    });
  }

  function renderDashboardList(events, phase) {
    if (!events.length) {
      return `<li><span class="meta">${emptyMessage(phase)}</span></li>`;
    }
    return events.slice(0, 4).map((event) => {
      const chip = phase === 'present'
        ? '<span class="status-chip status-chip--active">Live</span>'
        : phase === 'most-recent'
          ? '<span class="status-chip status-chip--pending">Recent</span>'
          : `<span class="meta">${formatShortDate(event)}</span>`;
      return `<li><span>${escapeHtml(event.title)}</span>${chip}</li>`;
    }).join('');
  }

  function renderMemberDashboard() {
    const root = document.querySelector('[data-events-dashboard]');
    const flowMount = document.querySelector('[data-events-phase-flow-dashboard]');
    if (flowMount) flowMount.innerHTML = renderPhaseFlowStrip();
    if (!root) return;

    const groups = categorizeEvents();
    const prefix = '../';

    root.innerHTML = PHASE_ORDER.map((phase) => {
      const events = groups[phase];
      const meta = PHASE_META[phase];
      return `
        <section class="event-phase-block event-phase-block--member event-phase-block--${meta.mod}" id="dashboard-phase-${phase}">
          ${renderPhaseBlockHeader(phase, events.length)}
          <div class="events-phase-list events-phase-list--member events-phase-list--dashboard">
            ${events.length
              ? events.map((event) => renderCompactEventItem(event, prefix, phase)).join('')
              : `<div class="events-phase-empty"><span class="events-phase-empty__icon" aria-hidden="true">${meta.icon}</span><p>${emptyMessage(phase)}</p></div>`}
          </div>
        </section>
      `;
    }).join('');
  }

  function isRegistered(event, member) {
    if (!member?.registrations?.length) return false;
    return member.registrations.some((r) => r.eventId === event.id || r.event === event.title);
  }

  function renderMemberEventCard(event, prefix, phase, registered) {
    const badge = dateBadge(event);
    const img = escapeHtml(safeUrl(assetPath(event.image, prefix)));
    const title = escapeHtml(event.title);
    const phaseLabel = phase === 'present' ? 'Live now' : phase === 'most-recent' ? 'Recent' : phase === 'upcoming' ? 'Upcoming' : 'Past';
    const booking = safeUrl(
      event.bookingUrl?.startsWith('http') ? event.bookingUrl : assetPath(event.bookingUrl, prefix)
    );
    const gallery = safeUrl(assetPath(event.galleryUrl, prefix));
    const eventId = escapeHtml(event.id);

    const feeCents = Number(event.feeCents || event.fee_cents || 0);
    const feeLabel = feeCents > 0 ? `$${(feeCents / 100).toFixed(2)}` : '';

    let action = '';
    if (registered && booking?.startsWith('http')) {
      action = `<a href="${escapeHtml(booking)}" class="btn btn--accent" target="_blank" rel="noopener">View Ticket</a>`;
    } else if (phase === 'upcoming' && event.registrationOpen) {
      action = booking
        ? `<a href="${escapeHtml(booking)}" class="btn btn--primary">Booking</a>`
        : `<button type="button" class="btn btn--primary" data-register-interest="${eventId}">Register Interest</button>`;
    } else if (gallery && (phase === 'past' || phase === 'most-recent')) {
      action = `<a href="${escapeHtml(gallery)}" class="btn btn--ghost">View gallery</a>`;
    }
    if (feeCents > 0 && (phase === 'upcoming' || phase === 'present')) {
      action +=
        `<button type="button" class="btn btn--ghost" data-event-invoice="${eventId}" data-event-fee="${feeCents}">` +
        `Email ${escapeHtml(feeLabel)} invoice</button>`;
    }

    return `
      <article class="event-card">
        <div class="event-card__date"><span class="day">${escapeHtml(badge.day)}</span><span class="month">${escapeHtml(badge.month)}</span></div>
        <div class="event-card__inner">
          <img class="event-card__thumb" src="${img}" alt="${title}">
          <div class="event-card__info">
            <div class="event-card__badges">
              ${registered ? '<span class="event-card__badge event-card__badge--member">Registered</span>' : ''}
              <span class="event-card__badge event-card__badge--phase">${phaseLabel}</span>
              ${feeLabel ? `<span class="event-card__badge">${escapeHtml(feeLabel)}</span>` : ''}
            </div>
            <h3>${title}</h3>
            <div class="event-card__meta"><span>${escapeHtml(event.meta || event.location)}</span></div>
            ${action}
          </div>
        </div>
      </article>
    `;
  }

  function renderMemberEventsPage(member) {
    const root = document.querySelector('[data-events-member-page]');
    if (!root) return;

    const groups = categorizeEvents();
    const prefix = '../';

    const registered = [];
    const available = [];

    groups.upcoming.forEach((event) => {
      if (isRegistered(event, member)) registered.push({ event, phase: 'upcoming' });
      else if (event.registrationOpen) available.push({ event, phase: 'upcoming' });
    });

    ['present', 'most-recent', 'past'].forEach((phase) => {
      groups[phase].forEach((event) => {
        if (isRegistered(event, member)) registered.push({ event, phase });
      });
    });

    const phaseSections = PHASE_ORDER.map((phase) => {
      const events = groups[phase];
      const meta = PHASE_META[phase];
      return `
        <section class="event-phase-block event-phase-block--member event-phase-block--${meta.mod}" id="member-phase-${phase}">
          ${renderPhaseBlockHeader(phase, events.length)}
          <div class="events-phase-list events-phase-list--member">
            ${events.length
              ? events.map((event) => renderCompactEventItem(event, prefix, phase)).join('')
              : `<div class="events-phase-empty"><span class="events-phase-empty__icon" aria-hidden="true">${meta.icon}</span><p>${emptyMessage(phase)}</p></div>`}
          </div>
        </section>
      `;
    }).join('');

    root.innerHTML = `
      <div class="dash-card dash-card--full dash-card--registrations-highlight">
        <h2>My Registrations</h2>
        <div class="events-grid" style="margin-top:1rem;">
          ${registered.length
            ? registered.map(({ event, phase }) => renderMemberEventCard(event, prefix, phase, true)).join('')
            : '<p class="meta">You have no registered events yet.</p>'}
        </div>
      </div>
      <div class="dash-card dash-card--full dash-card--events-by-phase">
        <h2>All Events by Phase</h2>
        <p class="event-phases-dashboard__intro">Events flow automatically through each stage — watch them move from left to right over time.</p>
        <div data-events-phase-flow></div>
        <div class="event-phases-dashboard event-phases-dashboard--member">${phaseSections}</div>
      </div>
    `;

    const flowMount = root.querySelector('[data-events-phase-flow]');
    if (flowMount) flowMount.innerHTML = renderPhaseFlowStrip();

    root.querySelectorAll('[data-register-interest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        alert('You will be notified when event details are confirmed.');
      });
    });

    root.querySelectorAll('[data-event-invoice]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!global.taunetInvoices?.createInvoice) {
          alert('Invoices are not ready. Refresh the page or contact IT.');
          return;
        }
        const eventId = btn.getAttribute('data-event-invoice');
        const fee = Number(btn.getAttribute('data-event-fee') || 0);
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sending…';
        try {
          const result = await global.taunetInvoices.createInvoice({
            kind: 'event',
            event_id: eventId,
            amount_cents: fee,
          });
          alert(result.message || 'Invoice emailed to you.');
        } catch (err) {
          alert(err.message || 'Could not create event invoice.');
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    });
  }

  function pickHomeFeaturedEvent() {
    const groups = categorizeEvents(new Date());
    if (groups.present.length) {
      return { event: groups.present[0], phase: 'present' };
    }
    if (groups.upcoming.length) {
      const featured = groups.upcoming.find((item) => item.featured) || groups.upcoming[0];
      return { event: featured, phase: 'upcoming' };
    }
    if (groups['most-recent'].length) {
      const featured =
        groups['most-recent'].find((item) => item.featured) || groups['most-recent'][0];
      return { event: featured, phase: 'most-recent' };
    }
    return null;
  }

  function renderHomeTeaser() {
    const root = document.querySelector('[data-home-events-teaser]');
    if (!root) return;

    const picked = pickHomeFeaturedEvent();
    if (!picked?.event) return;

    const { event, phase } = picked;
    const img = document.getElementById('home-events-image');
    const dateEl = document.getElementById('home-events-date');
    const heading = document.getElementById('home-events-heading');
    const blurb = document.getElementById('home-events-blurb');
    const cta = document.getElementById('home-events-cta');
    const badge = dateBadge(event);
    const imageSrc = safeUrl(assetPath(event.image, ''));

    if (img && imageSrc) {
      img.src = imageSrc;
      img.alt = event.title || 'Upcoming event';
    }
    if (dateEl) {
      dateEl.hidden = false;
      dateEl.textContent = `${badge.day} ${badge.month}`;
    }
    if (heading) {
      heading.textContent = phase === 'present' ? 'Happening now' : phase === 'upcoming' ? 'Upcoming event' : 'Recent event';
    }
    if (blurb) {
      const detail = event.meta || event.summary || event.location || '';
      blurb.textContent = detail
        ? `${event.title} — ${detail}`
        : event.title || 'See what is on for the Taunet Nelel community.';
    }
    if (cta) {
      cta.textContent =
        phase === 'present'
          ? 'View live event'
          : phase === 'upcoming'
            ? 'See upcoming events'
            : 'Browse events';
    }
    root.setAttribute('href', 'events.html');
    root.dataset.eventId = event.id || '';
  }

  function init() {
    if (document.body.dataset.page === 'events') {
      renderPublicPage();
    }
    renderHomeTeaser();
    renderMemberDashboard();
  }

  let lastMember = null;

  function initMemberEvents(member) {
    lastMember = member || null;
    renderMemberDashboard();
    renderMemberEventsPage(lastMember);
  }

  function setEvents(next) {
    if (!Array.isArray(next) || !next.length) return false;
    EVENTS = next.slice();
    global.TaunetEventsPhases.EVENTS = EVENTS;
    return true;
  }

  function refresh() {
    if (document.body.dataset.page === 'events') {
      renderPublicPage();
    }
    renderHomeTeaser();
    renderMemberDashboard();
    if (document.querySelector('[data-events-member-page]')) {
      renderMemberEventsPage(lastMember);
    }
  }

  global.TaunetEventsPhases = {
    RECENT_DELAY_DAYS,
    RECENT_MONTHS,
    EVENTS,
    getEventPhase,
    categorizeEvents,
    setEvents,
    refresh,
    init,
    initMemberEvents,
    renderPublicPage,
    renderHomeTeaser,
    pickHomeFeaturedEvent,
    renderMemberDashboard,
    renderMemberEventsPage
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
