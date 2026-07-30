/**
 * Supabase connection settings.
 *
 * 1. Copy this file to supabase-config.js
 * 2. Paste your Project URL and anon public key from Supabase Dashboard > Settings > API
 * 3. Run supabase/migrations/001_initial_schema.sql in the Supabase SQL Editor
 */
window.TAUNET_SUPABASE = {
  url: '',
  anonKey: '',
  // Committee admin portal PIN (/admin/) — separate from members login
  adminPin: 'TaunetAdmin2026',
  // Optional hint only — real live-data access is public.site_admins + migration 011
  adminEmails: []
};
