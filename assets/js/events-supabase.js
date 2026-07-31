/**
 * Load published events from Supabase into TaunetEventsPhases.
 * Falls back to the static EVENTS array in events-phases.js when empty/unavailable.
 */
(function (global) {
  'use strict';

  function mapEvent(row) {
    return {
      id: row.id,
      title: row.title,
      start: row.start_at,
      end: row.end_at || row.start_at,
      image: row.image_path || 'wp-content/uploads/2025/09/Celebration.jpg',
      location: row.location || '',
      summary: row.summary || '',
      meta: row.meta || '',
      badge: row.badge || '',
      featured: Boolean(row.featured),
      bookingUrl: row.booking_url || undefined,
      galleryUrl: row.gallery_url || undefined,
      registrationOpen: Boolean(row.registration_open),
      phaseOverride: row.phase_override || null
    };
  }

  async function loadFromSupabase() {
    const api = global.taunetSupabaseApi;
    if (!api || !api.isConfigured()) return null;

    const client = await api.ensureClient();
    if (!client) return null;

    let query = client
      .from('events')
      .select(
        'id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published,phase_override'
      )
      .eq('is_published', true)
      .order('start_at', { ascending: false });

    let { data, error } = await query;
    if (error && String(error.message || '').includes('phase_override')) {
      ({ data, error } = await client
        .from('events')
        .select(
          'id,title,summary,location,meta,badge,image_path,booking_url,gallery_url,start_at,end_at,featured,registration_open,is_published'
        )
        .eq('is_published', true)
        .order('start_at', { ascending: false }));
    }

    if (error || !data || !data.length) return null;
    return data.map(mapEvent);
  }

  function enrichFromStatic(remote, staticEvents) {
    const byId = new Map((staticEvents || []).map((event) => [event.id, event]));
    return remote.map((event) => {
      const local = byId.get(event.id);
      if (!local) return event;
      return {
        ...event,
        calendarUrl: event.calendarUrl || local.calendarUrl
      };
    });
  }

  async function init() {
    try {
      const api = global.TaunetEventsPhases;
      if (!api?.setEvents) return;

      const staticSnapshot = Array.isArray(api.EVENTS) ? api.EVENTS.slice() : [];
      const remote = await loadFromSupabase();
      if (!remote || !remote.length) return;

      const next = enrichFromStatic(remote, staticSnapshot);
      if (api.setEvents(next)) api.refresh();
    } catch (error) {
      console.warn('Events Supabase load skipped:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
