/**
 * Load gallery albums/photos from Supabase and merge into TAUNET_GALLERY.
 * Falls back to static gallery-data.js if Supabase is unavailable.
 */
(function (global) {
  'use strict';

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
      .map((album) => mapAlbum(album, byAlbum[album.id] || []))
      .filter((album) => album.photos.length > 0);
  }

  function mergeAlbums(remoteAlbums) {
    const current = global.TAUNET_GALLERY || [];
    const remoteIds = new Set(remoteAlbums.map((a) => a.id));
    const kept = current.filter((a) => !remoteIds.has(a.id));
    global.TAUNET_GALLERY = kept.concat(remoteAlbums);
  }

  async function init() {
    try {
      const remote = await loadFromSupabase();
      if (!remote || !remote.length) return;
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
