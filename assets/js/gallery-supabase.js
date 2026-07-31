/**
 * Load gallery albums/photos from Supabase.
 * Curated static gallery-data.js stays the public source of truth —
 * Supabase may enrich matching album IDs but must not add dump/extra albums.
 */
(function (global) {
  'use strict';

  const BLOCKED_ALBUM_IDS = new Set(['leadership-team']);

  function isDumpAlbumId(id) {
    const value = String(id || '');
    return (
      value.startsWith('wp-archive-') ||
      value.startsWith('wp-202') ||
      BLOCKED_ALBUM_IDS.has(value)
    );
  }

  function mapAlbum(album, photos) {
    const group = album.group_id === 'recent' ? 'recent' : 'past';
    return {
      id: album.id,
      nav: album.title,
      group: group,
      sortDate: album.sort_date || album.event_date || '0000',
      previewLimit: album.preview_limit || 8,
      title: album.title,
      date: album.event_date || '',
      description: album.description || '',
      photos: (photos || []).map((photo) => ({
        src: photo.storage_path,
        alt: photo.alt_text || album.title,
        downloadName: photo.download_name || 'photo.jpg'
      }))
    };
  }

  async function loadFromSupabase() {
    const api = global.taunetSupabaseApi;
    if (!api || !api.isConfigured()) return null;

    const client = await api.ensureClient();
    if (!client) return null;

    const { data: albums, error: albumError } = await client
      .from('gallery_albums')
      .select('id,title,description,event_date,group_id,sort_date,preview_limit,is_published')
      .eq('is_published', true)
      .order('sort_date', { ascending: false });

    if (albumError || !albums || !albums.length) return null;

    const { data: photos, error: photoError } = await client
      .from('gallery_photos')
      .select('album_id,storage_path,alt_text,download_name,sort_order,is_member_only')
      .eq('is_member_only', false)
      .order('sort_order', { ascending: true });

    if (photoError) return null;

    const byAlbum = {};
    (photos || []).forEach((photo) => {
      if (!byAlbum[photo.album_id]) byAlbum[photo.album_id] = [];
      byAlbum[photo.album_id].push(photo);
    });

    return albums
      .filter((album) => !isDumpAlbumId(album.id))
      .map((album) => mapAlbum(album, byAlbum[album.id] || []))
      .filter((album) => album.photos.length > 0);
  }

  function mergeAlbums(remoteAlbums) {
    const current = (global.TAUNET_GALLERY || []).filter((a) => !isDumpAlbumId(a.id));
    const curatedIds = new Set(current.map((a) => a.id));
    const remoteById = new Map(
      remoteAlbums.filter((a) => curatedIds.has(a.id)).map((a) => [a.id, a])
    );

    // Prefer curated static albums; take remote when it has more photos.
    const mergedCurated = current.map((album) => {
      const remote = remoteById.get(album.id);
      if (remote && remote.photos.length > album.photos.length) return remote;
      return album;
    });

    // Append committee-uploaded albums (e.g. event-* from admin photo uploads).
    const extras = remoteAlbums
      .filter((album) => !curatedIds.has(album.id) && !isDumpAlbumId(album.id) && album.photos.length)
      .sort((a, b) => String(b.sortDate || '').localeCompare(String(a.sortDate || '')));

    global.TAUNET_GALLERY = [...extras, ...mergedCurated];
  }

  async function init() {
    try {
      const remote = await loadFromSupabase();
      if (!remote || !remote.length) {
        global.TAUNET_GALLERY = (global.TAUNET_GALLERY || []).filter((a) => !isDumpAlbumId(a.id));
        return;
      }
      mergeAlbums(remote);
      if (typeof global.taunetGalleryRefresh === 'function') {
        global.taunetGalleryRefresh();
      }
    } catch (error) {
      console.warn('Gallery Supabase load skipped:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
