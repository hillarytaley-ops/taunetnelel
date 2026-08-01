(function (global) {
  'use strict';

  const DATA_URL = 'assets/data/business-content.json';
  const STORAGE_KEY = 'taunet_business_content';

  function normalizeContent(data) {
    return {
      updatedAt: data.updatedAt || new Date().toISOString(),
      businesses: Array.isArray(data.businesses) ? data.businesses : [],
      news: Array.isArray(data.news) ? data.news : [],
      blog: Array.isArray(data.blog) ? data.blog : [],
    };
  }

  function sortByDateDesc(items) {
    return [...items].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }

  async function loadFromSupabase() {
    const api = global.taunetSupabaseApi;
    if (!api?.isConfigured()) return null;
    const client = await api.ensureClient();
    if (!client) return null;

    const [bizRes, newsRes, blogRes] = await Promise.all([
      client.from('businesses').select('*').eq('is_published', true).order('name'),
      client.from('business_news').select('*').eq('is_published', true).order('published_date', { ascending: false }),
      client.from('business_blog').select('*').eq('is_published', true).order('published_date', { ascending: false })
    ]);

    if (bizRes.error && newsRes.error) return null;

    const businesses = (bizRes.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category || '',
      description: row.description || '',
      contactName: row.contact_name || '',
      phone: row.phone || '',
      email: row.email || '',
      website: row.website || '',
      location: row.location || ''
    }));
    const news = (newsRes.data || []).map((row) => ({
      id: row.id,
      title: row.title,
      date: row.published_date || '',
      summary: row.summary || '',
      body: row.body || ''
    }));
    const blog = (blogRes.error ? [] : blogRes.data || []).map((row) => ({
      id: row.id,
      title: row.title,
      date: row.published_date || '',
      author: row.author || 'Taunet Nelel Team',
      summary: row.summary || '',
      body: row.body || ''
    }));

    if (!businesses.length && !news.length && !blog.length) return null;

    return normalizeContent({
      updatedAt: new Date().toISOString(),
      businesses,
      news,
      blog
    });
  }

  async function loadBusinessContent(options) {
    const preferStorage = options?.preferStorage === true;
    const basePath = options?.basePath || '';

    if (preferStorage) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return normalizeContent(JSON.parse(stored));
      } catch {
        /* fall through */
      }
    }

    try {
      const remote = await loadFromSupabase();
      if (remote) return remote;
    } catch (err) {
      console.warn('Business Hub Supabase load skipped:', err);
    }

    const response = await fetch(`${basePath}${DATA_URL}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load business content.');
    return normalizeContent(await response.json());
  }

  function saveBusinessContent(data) {
    const normalized = normalizeContent(data);
    normalized.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function clearStoredBusinessContent() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function downloadBusinessContent(data, filename) {
    const normalized = normalizeContent(data);
    const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'business-content.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function formatDisplayDate(value) {
    if (!value) return '';
    const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  global.TaunetBusinessContent = {
    DATA_URL,
    STORAGE_KEY,
    normalizeContent,
    sortByDateDesc,
    loadBusinessContent,
    loadFromSupabase,
    saveBusinessContent,
    clearStoredBusinessContent,
    downloadBusinessContent,
    formatDisplayDate,
    escapeHtml,
  };
})(window);
