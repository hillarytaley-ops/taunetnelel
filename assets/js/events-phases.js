(function (global) {
  'use strict';

  const RECENT_DAYS = 30;

  const EVENTS = [
    {
      id: 'cultural-week-2026',
      title: 'Winter Cultural Week',
      start: '2026-07-01T10:00:00+10:00',
      end: '2026-07-05T18:00:00+10:00',
      image: 'wp-content/uploads/2025/09/Celebration.jpg',
      location: 'Victoria · multiple venues',
      summary: 'A week of language, culture, and community activities across Victoria.',
      meta: '1–5 July 2026 · daily sessions',
      badge: 'Live now',
      featured: true,
      galleryUrl: 'gallery.html#agm-2025',
      registrationOpen: false
    },
    {
      id: 'community-picnic-2026',
      title: 'Taunet Community Picnic',
      start: '2026-08-15T11:00:00+10:00',
      end: '2026-08-15T16:00:00+10:00',
      image: 'wp-content/uploads/2025/10/WhatsApp-Image-2025-10-02-at-14.04.38.jpeg',
      location: 'Victoria · venue TBC',
      summary: 'Family picnic with food, games, and music. Alcohol-free and open to all ages.',
      meta: 'Saturday, 15 August 2026 · 11am–4pm',
      badge: 'Family day',
      featured: true,
      bookingUrl: 'events.html#inquiry',
      registrationOpen: true
    },
    {
      id: 'language-festival-2026',
      title: 'Kalenjin Language Festival',
      start: '2026-09-20T10:00:00+10:00',
      end: '2026-09-20T15:00:00+10:00',
      image: 'wp-content/uploads/2025/09/Celebration.jpg',
      location: 'Melbourne · venue TBC',
      summary: 'Celebrate Kalenjin language through workshops, performances, and youth activities.',
      meta: 'Sunday, 20 September 2026 · 10am–3pm',
      badge: 'Culture',
      featured: false,
      bookingUrl: 'events.html#inquiry',
      registrationOpen: true
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

  const PHASE_LABELS = {
    upcoming: 'Upcoming Events',
    present: 'Present Events',
    'most-recent': 'Most Recent Events',
    past: 'Past Events'
  };

  const PHASE_EYEBROWS = {
    upcoming: 'On the horizon',
    present: 'Happening now',
    'most-recent': 'Just finished',
    past: 'Archive'
  };

  function parseDate(value) {
    return new Date(value);
  }

  function getEventPhase(event, now) {
    const current = now || new Date();
    const start = parseDate(event.start);
    const end = parseDate(event.end);

    if (current < start) return 'upcoming';
    if (current >= start && current <= end) return 'present';

    const recentUntil = new Date(end);
    recentUntil.setDate(recentUntil.getDate() + RECENT_DAYS);

    if (current <= recentUntil) return 'most-recent';
    return 'past';
  }

  function categorizeEvents(now) {
    const groups = {
      upcoming: [],
      present: [],
      'most-recent': [],
      past: []
    };

    EVENTS.forEach((event) => {
      const phase = getEventPhase(event, now);
      groups[phase].push(event);
    });

    const byStart = (a, b) => parseDate(a.start) - parseDate(b.start);
    const byEndDesc = (a, b) => parseDate(b.end) - parseDate(a.end);

    groups.upcoming.sort(byStart);
    groups.present.sort(byStart);
    groups['most-recent'].sort(byEndDesc);
    groups.past.sort(byEndDesc);

    return groups;
  }

  function dateBadge(event) {
    const start = parseDate(event.start);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return {
      day: String(start.getDate()),
      month: months[start.getMonth()],
      monthLong: `${months[start.getMonth()]} ${start.getFullYear()}`
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
      upcoming: 'No upcoming events at the moment. Check back soon or send an enquiry.',
      present: 'No events are running right now.',
      'most-recent': 'No events have finished recently.',
      past: 'No past events to display yet.'
    };
    return messages[phase] || 'No events in this category.';
  }

  function renderUpcomingCard(event, prefix, featured) {
    const badge = dateBadge(event);
    const cls = featured ? 'upcoming-event upcoming-event--featured' : 'upcoming-event upcoming-event--secondary';
    const mediaCls = featured ? 'upcoming-event__poster' : 'upcoming-event__thumb';
    const img = assetPath(event.image, prefix);

    let actions = '';
    if (event.bookingUrl) {
      actions += `<a href="${event.bookingUrl}" class="btn btn--accent"${event.bookingUrl.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>Booking</a>`;
    }
    if (event.calendarUrl) {
      actions += `<a href="${assetPath(event.calendarUrl, prefix)}" class="btn btn--outline" download>Add to calendar</a>`;
    }

    return `
      <article class="${cls}">
        <figure class="${mediaCls}">
          <img src="${img}" alt="${event.title}" width="480" height="320" loading="lazy">
          <div class="upcoming-event__date-badge">
            <span class="day">${badge.day}</span>
            <span class="month">${badge.month}</span>
          </div>
        </figure>
        <div class="upcoming-event__details">
          ${event.badge ? `<div class="upcoming-event__badges"><span class="event-card__badge">${event.badge}</span></div>` : ''}
          <h3>${event.title}</h3>
          <p class="upcoming-event__meta">${event.meta || event.location}</p>
          ${event.summary ? `<p class="upcoming-event__desc">${event.summary}</p>` : ''}
          ${actions ? `<div class="upcoming-event__actions">${actions}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderPresentCard(event, prefix) {
    const badge = dateBadge(event);
    const img = assetPath(event.image, prefix);

    return `
      <article class="upcoming-event upcoming-event--featured upcoming-event--present">
        <figure class="upcoming-event__poster">
          <img src="${img}" alt="${event.title}" width="480" height="320" loading="lazy">
          <div class="upcoming-event__date-badge">
            <span class="day">${badge.day}</span>
            <span class="month">${badge.month}</span>
          </div>
        </figure>
        <div class="upcoming-event__details">
          <div class="upcoming-event__badges">
            <span class="event-card__badge event-card__badge--live">Live now</span>
          </div>
          <h3>${event.title}</h3>
          <p class="upcoming-event__meta">${event.meta || event.location}</p>
          ${event.summary ? `<p class="upcoming-event__desc">${event.summary}</p>` : ''}
        </div>
      </article>
    `;
  }

  function renderGridCard(event, prefix, phase) {
    const badge = dateBadge(event);
    const img = assetPath(event.image, prefix);
    const href = event.galleryUrl ? assetPath(event.galleryUrl, prefix) : '#';
    const phaseBadgeText = phaseBadge(event, phase);

    return `
      <article class="past-event-card past-event-card--${phase}">
        <a href="${href}" class="past-event-card__media">
          <img src="${img}" alt="${event.title}" width="320" height="200" loading="lazy">
          <div class="past-event-card__date"><span class="day">${badge.day}</span><span class="month">${badge.monthLong}</span></div>
        </a>
        <div class="past-event-card__body">
          ${phaseBadgeText ? `<span class="event-card__badge event-card__badge--phase">${phaseBadgeText}</span>` : ''}
          <h3>${event.title}</h3>
          <p>${event.meta || event.location}</p>
        </div>
      </article>
    `;
  }

  function renderCompactEventItem(event, prefix, phase) {
    const badge = dateBadge(event);
    const img = assetPath(event.image, prefix);
    const href = event.galleryUrl ? assetPath(event.galleryUrl, prefix) : (event.bookingUrl || '#');
    const linkAttrs = event.bookingUrl?.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
    const phaseLabel = phase === 'present' ? 'Live now' : phase === 'most-recent' ? 'Recent' : phase === 'upcoming' ? 'Upcoming' : '';

    let action = '';
    if (phase === 'upcoming' && event.bookingUrl) {
      action = `<a href="${event.bookingUrl.startsWith('http') ? event.bookingUrl : assetPath(event.bookingUrl, prefix)}" class="events-phase-item__link"${linkAttrs}>Booking</a>`;
    } else if ((phase === 'past' || phase === 'most-recent') && event.galleryUrl) {
      action = `<a href="${href}" class="events-phase-item__link">Gallery</a>`;
    }

    return `
      <article class="events-phase-item events-phase-item--${phase}">
        <a href="${href}" class="events-phase-item__media"${event.galleryUrl ? '' : linkAttrs}>
          <img src="${img}" alt="${event.title}" width="120" height="80" loading="lazy">
          <span class="events-phase-item__date">${badge.day} ${badge.month}</span>
        </a>
        <div class="events-phase-item__body">
          ${phaseLabel ? `<span class="events-phase-item__badge">${phaseLabel}</span>` : ''}
          <h4>${event.title}</h4>
          <p>${event.meta || event.location}</p>
          ${action}
        </div>
      </article>
    `;
  }

  function renderPhaseSection(phase, events, prefix, compact) {
    if (compact) {
      if (!events.length) {
        return `<div class="events-phase-empty"><p>${emptyMessage(phase)}</p></div>`;
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
    const phases = ['upcoming', 'present', 'most-recent', 'past'];

    phases.forEach((phase) => {
      const root = document.getElementById(`events-${phase}-root`);
      if (root) {
        root.innerHTML = renderPhaseSection(phase, groups[phase], '', true);
      }

      const countEl = document.querySelector(`[data-events-count="${phase}"]`);
      if (countEl) countEl.textContent = String(groups[phase].length);
    });
  }

  function formatShortDate(event) {
    const start = parseDate(event.start);
    return start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
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
      return `<li><span>${event.title}</span>${chip}</li>`;
    }).join('');
  }

  function renderMemberDashboard() {
    const root = document.querySelector('[data-events-dashboard]');
    if (!root) return;

    const groups = categorizeEvents();
    const phases = ['upcoming', 'present', 'most-recent', 'past'];

    root.innerHTML = phases.map((phase) => `
      <section class="event-phase-block" id="dashboard-phase-${phase}">
        <h3 class="event-phase-block__title">
          ${PHASE_LABELS[phase]}
          <span class="event-phase-count">${groups[phase].length}</span>
        </h3>
        <ul class="dash-list">${renderDashboardList(groups[phase], phase)}</ul>
      </section>
    `).join('');
  }

  function isRegistered(event, member) {
    if (!member?.registrations?.length) return false;
    return member.registrations.some((r) => r.eventId === event.id || r.event === event.title);
  }

  function renderMemberEventCard(event, prefix, phase, registered) {
    const badge = dateBadge(event);
    const img = assetPath(event.image, prefix);
    const phaseLabel = phase === 'present' ? 'Live now' : phase === 'most-recent' ? 'Recent' : phase === 'upcoming' ? 'Upcoming' : 'Past';

    let action = '';
    if (registered && event.bookingUrl?.startsWith('http')) {
      action = `<a href="${event.bookingUrl}" class="btn btn--accent" target="_blank" rel="noopener">View Ticket</a>`;
    } else if (phase === 'upcoming' && event.registrationOpen) {
      action = event.bookingUrl
        ? `<a href="${assetPath(event.bookingUrl, prefix)}" class="btn btn--primary">Booking</a>`
        : `<button type="button" class="btn btn--primary" data-register-interest="${event.id}">Register Interest</button>`;
    } else if (event.galleryUrl && (phase === 'past' || phase === 'most-recent')) {
      action = `<a href="${assetPath(event.galleryUrl, prefix)}" class="btn btn--ghost">View gallery</a>`;
    }

    return `
      <article class="event-card">
        <div class="event-card__date"><span class="day">${badge.day}</span><span class="month">${badge.month}</span></div>
        <div class="event-card__inner">
          <img class="event-card__thumb" src="${img}" alt="${event.title}">
          <div class="event-card__info">
            <div class="event-card__badges">
              ${registered ? '<span class="event-card__badge event-card__badge--member">Registered</span>' : ''}
              <span class="event-card__badge event-card__badge--phase">${phaseLabel}</span>
            </div>
            <h3>${event.title}</h3>
            <div class="event-card__meta"><span>${event.meta || event.location}</span></div>
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

    const phaseSections = ['upcoming', 'present', 'most-recent', 'past'].map((phase) => {
      const events = groups[phase];
      return `
        <section class="event-phase-block event-phase-block--member" id="member-phase-${phase}">
          <h3 class="event-phase-block__title">
            ${PHASE_LABELS[phase]}
            <span class="event-phase-count">${events.length}</span>
          </h3>
          <div class="events-phase-list events-phase-list--member">
            ${events.length
              ? events.map((event) => renderCompactEventItem(event, prefix, phase)).join('')
              : `<div class="events-phase-empty"><p>${emptyMessage(phase)}</p></div>`}
          </div>
        </section>
      `;
    }).join('');

    root.innerHTML = `
      <div class="dash-card dash-card--full">
        <h2>My Registrations</h2>
        <div class="events-grid" style="margin-top:1rem;">
          ${registered.length
            ? registered.map(({ event, phase }) => renderMemberEventCard(event, prefix, phase, true)).join('')
            : '<p class="meta">You have no registered events yet.</p>'}
        </div>
      </div>
      <div class="dash-card dash-card--full">
        <h2>All Events by Phase</h2>
        <div class="event-phases-dashboard event-phases-dashboard--member">${phaseSections}</div>
      </div>
    `;

    root.querySelectorAll('[data-register-interest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        alert('You will be notified when event details are confirmed.');
      });
    });
  }

  function init() {
    if (document.body.dataset.page === 'events') {
      renderPublicPage();
    }
    renderMemberDashboard();
  }

  function initMemberEvents(member) {
    renderMemberDashboard();
    renderMemberEventsPage(member);
  }

  global.TaunetEventsPhases = {
    RECENT_DAYS,
    EVENTS,
    getEventPhase,
    categorizeEvents,
    init,
    initMemberEvents,
    renderPublicPage,
    renderMemberDashboard,
    renderMemberEventsPage
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
