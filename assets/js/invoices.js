/**
 * Member invoice helpers — create invoice via API, list via Supabase RLS, download PDF.
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
        'id,invoice_number,kind,description,amount_cents,status,pay_reference,issued_at,due_at,paid_at,full_name,email'
      )
      .order('issued_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  }

  async function downloadPdf(invoiceId) {
    const token = await getAccessToken();
    const resp = await fetch(
      '/api/invoices/download?id=' + encodeURIComponent(invoiceId),
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || 'Could not download invoice PDF.');
    }
    const blob = await resp.blob();
    const disposition = resp.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/i.exec(disposition);
    const filename = match ? match[1] : 'invoice.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function formatAud(cents) {
    return `$${(Number(cents || 0) / 100).toFixed(2)}`;
  }

  const MELBOURNE_TZ = 'Australia/Melbourne';

  function formatDateTime(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('en-AU', {
        timeZone: MELBOURNE_TZ,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(value);
    }
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('en-AU', {
        timeZone: MELBOURNE_TZ,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return String(value);
    }
  }

  global.taunetInvoices = {
    createInvoice,
    listMyInvoices,
    downloadPdf,
    formatAud,
    formatDateTime,
    formatDate,
  };
})(window);
