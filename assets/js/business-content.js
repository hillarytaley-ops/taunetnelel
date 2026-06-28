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

  async function loadBusinessContent(options) {
    const preferStorage = options?.preferStorage === true;
    const basePath = options?.basePath || '';

    if (preferStorage) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return normalizeContent(JSON.parse(stored));
      } catch {
        /* fall through to fetch */
      }
    }

    const response = await fetch(`${basePath}${DATA_URL}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load business content.');
    const data = normalizeContent(await response.json());
    return data;
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
    saveBusinessContent,
    clearStoredBusinessContent,
    downloadBusinessContent,
    formatDisplayDate,
    escapeHtml,
  };
})(window);
