/**
 * Load published sponsors from Supabase and render the sponsorship page grids.
 * Keeps static HTML as fallback when Supabase is empty/unavailable.
 */
(function (global) {
  'use strict';

  const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze'];
  const TIER_LABEL = {
    platinum: 'Platinum Sponsors',
    gold: 'Gold Sponsors',
    silver: 'Silver Sponsors',
    bronze: 'Bronze Sponsors'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 3)
      .toUpperCase() || '?';
  }

  function renderCard(sponsor) {
    const tier = sponsor.tier || 'bronze';
    const name = escapeHtml(sponsor.name);
    const email = sponsor.contact_email || 'info@taunetnelel.org';
    const phone = sponsor.contact_phone || '';
    const website = sponsor.website || '';
    const subject = encodeURIComponent(`${sponsor.name} sponsor contact`);
    const logo = sponsor.logo_url
      ? `<div class="sponsor-card__logo">
            <img src="${escapeHtml(sponsor.logo_url)}" alt="${name} logo" width="160" height="80" loading="lazy">
         </div>`
      : `<div class="sponsor-card__logo sponsor-card__logo--placeholder" aria-hidden="true"><span>${escapeHtml(initials(sponsor.name))}</span></div>`;

    const contactBits = [
      `<div><dt>Email</dt><dd><a href="mailto:${escapeHtml(email)}?subject=${subject}">${escapeHtml(email)}</a></dd></div>`
    ];
    if (phone) {
      contactBits.push(
        `<div><dt>Phone</dt><dd><a href="tel:${escapeHtml(phone.replace(/\s+/g, ''))}">${escapeHtml(phone)}</a></dd></div>`
      );
    }
    if (website) {
      contactBits.push(
        `<div><dt>Website</dt><dd><a href="${escapeHtml(website)}" target="_blank" rel="noopener">${escapeHtml(website.replace(/^https?:\/\//, ''))}</a></dd></div>`
      );
    }

    return `<article class="sponsor-card">
      <span class="sponsor-card__badge sponsor-card__badge--${escapeHtml(tier)}">${escapeHtml(tier.charAt(0).toUpperCase() + tier.slice(1))}</span>
      ${logo}
      <h4 class="sponsor-card__name">${name}</h4>
      <dl class="sponsor-card__contact">${contactBits.join('')}</dl>
    </article>`;
  }

  function renderTiers(sponsors) {
    return TIER_ORDER.map((tier) => {
      const rows = sponsors.filter((s) => s.tier === tier);
      if (!rows.length) return '';
      return `<div class="sponsor-tier-group">
        <h3 class="sponsor-tier-group__title">${TIER_LABEL[tier]}</h3>
        <div class="sponsor-grid">${rows.map(renderCard).join('')}</div>
      </div>`;
    }).join('');
  }

  async function loadFromSupabase() {
    const api = global.taunetSupabaseApi;
    if (!api || !api.isConfigured()) return null;

    const client = await api.ensureClient();
    if (!client) return null;

    const { data, error } = await client
      .from('sponsors')
      .select('id,name,tier,logo_url,contact_email,contact_phone,website,sort_order,is_published')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error || !data || !data.length) return null;
    return data;
  }

  async function init() {
    const root = document.querySelector('[data-sponsors-root]');
    if (!root) return;

    try {
      const sponsors = await loadFromSupabase();
      if (!sponsors || !sponsors.length) return;
      root.innerHTML = renderTiers(sponsors);
    } catch (error) {
      console.warn('Sponsors Supabase load skipped:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
