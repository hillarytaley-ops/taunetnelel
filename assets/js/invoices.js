/**
 * Member invoice helpers — create invoice via API, list via Supabase RLS.
 */
(function (global) {
  'use strict';

  async function getAccessToken() {
    const auth = global.taunetMembersAuth;
    const client = auth ? await auth.getClient() : null;
    if (!client) throw new Error('Sign in required.');
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sign in required.');
    return token;
  }

  async function createInvoice(payload) {
    const token = await getAccessToken();
    const resp = await fetch('/api/invoices/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || 'Could not create invoice.');
    }
    return data;
  }

  async function listMyInvoices() {
    const auth = global.taunetMembersAuth;
    const client = auth ? await auth.getClient() : null;
    if (!client) return [];
    const { data, error } = await client
      .from('invoices')
      .select(
        'id,invoice_number,kind,description,amount_cents,status,pay_reference,issued_at,due_at,paid_at'
      )
      .order('issued_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  }

  function formatAud(cents) {
    return `$${(Number(cents || 0) / 100).toFixed(2)}`;
  }

  global.taunetInvoices = {
    createInvoice,
    listMyInvoices,
    formatAud,
  };
})(window);
