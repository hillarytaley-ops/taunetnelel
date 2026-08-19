/**
 * Member dashboard + My Events: event booking status, screenshot upload,
 * receipt and ticket downloads after Treasurer confirms payment.
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function metaOf(row) {
    return row?.meta && typeof row.meta === 'object' ? row.meta : {};
  }

  function statusInfo(row) {
    const paid = String(row.status || '') === 'paid';
    const proofAt = metaOf(row).proof_uploaded_at;
    if (paid) {
      return {
        label: 'Paid — ticket ready',
        cls: 'is-paid',
        next:
          'Payment is confirmed. Download your receipt and event ticket below. The same files were emailed to you in this order: payment confirmed, receipt, ticket.',
      };
    }
    if (proofAt) {
      return {
        label: 'Transfer on file',
        cls: 'is-pending',
        next:
          'We have your payment screenshot and emailed you to confirm the transfer is on file. Receipt and ticket are issued after the Treasurer confirms the money in the Taunet account.',
      };
    }
    return {
      label: 'Upload screenshot',
      cls: 'is-pending',
      next:
        'Pay by bank transfer using your reference, then upload a screenshot of the receipt here. We email you straight away. Pay at least 5 days before the event — transfers can take a few days to appear.',
    };
  }

  function renderCard(row, invoices) {
    const info = statusInfo(row);
    const paid = String(row.status || '') === 'paid';
    const proofAt = metaOf(row).proof_uploaded_at;
    const title = metaOf(row).event_title || row.description || 'Event booking';
    const ticket = metaOf(row).ticket_label || 'Ticket';
    const amount = invoices.formatAud(row.amount_cents);
    let actions = '';
    if (paid) {
      actions =
        '<button type="button" class="btn btn--primary btn--sm" data-event-download-receipt="' +
        escapeHtml(row.id) +
        '">Download receipt</button>' +
        '<button type="button" class="btn btn--ghost btn--sm" data-event-download-ticket="' +
        escapeHtml(row.id) +
        '">Download ticket</button>';
    } else if (!proofAt) {
      actions =
        '<label class="member-event-booking__file">' +
        '<span>Receipt screenshot</span>' +
        '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-event-proof-file="' +
        escapeHtml(row.id) +
        '">' +
        '</label>' +
        '<button type="button" class="btn btn--primary btn--sm" data-event-proof-upload="' +
        escapeHtml(row.id) +
        '" data-event-proof-email="' +
        escapeHtml(row.email || '') +
        '">Upload screenshot</button>';
    }

    return (
      '<article class="member-invoice member-event-booking" data-event-booking="' +
      escapeHtml(row.id) +
      '">' +
      '<header class="member-invoice__head">' +
      '<div class="member-invoice__brand">' +
      '<strong>' +
      escapeHtml(title) +
      '</strong>' +
      '<span>' +
      escapeHtml(ticket) +
      '</span>' +
      '</div>' +
      '<span class="member-invoice__status ' +
      info.cls +
      '">' +
      escapeHtml(info.label) +
      '</span>' +
      '</header>' +
      '<div class="member-invoice__meta">' +
      '<div><span>Invoice</span><strong>' +
      escapeHtml(row.invoice_number || '—') +
      '</strong></div>' +
      '<div><span>Reference</span><strong>' +
      escapeHtml(row.pay_reference || '—') +
      '</strong></div>' +
      '<div><span>Amount</span><strong>' +
      escapeHtml(amount) +
      '</strong></div>' +
      '</div>' +
      '<p class="member-event-booking__next">' +
      escapeHtml(info.next) +
      '</p>' +
      (actions ? '<div class="member-invoice__actions">' + actions + '</div>' : '') +
      '<p class="member-event-booking__status" data-event-booking-status hidden></p>' +
      '</article>'
    );
  }

  function bindDownloads(root, invoices, setStatus) {
    root.querySelectorAll('[data-event-download-receipt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-event-download-receipt');
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparing…';
        try {
          await invoices.downloadPdf(id);
        } catch (err) {
          setStatus(btn, err.message || 'Could not download receipt.', true);
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    });
    root.querySelectorAll('[data-event-download-ticket]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-event-download-ticket');
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Preparing…';
        try {
          await invoices.downloadPdf(id, 'ticket');
        } catch (err) {
          setStatus(btn, err.message || 'Could not download ticket.', true);
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    });
  }

  async function init(member) {
    const hosts = document.querySelectorAll('[data-member-event-bookings]');
    if (!hosts.length) return;
    const invoices = global.taunetInvoices;
    if (!invoices?.listMyInvoices) {
      hosts.forEach((host) => {
        host.innerHTML =
          '<p class="muted">Event bookings appear here after you sign in.</p>';
      });
      return;
    }

    let rows = [];
    try {
      rows = (await invoices.listMyInvoices()).filter(
        (row) => row.kind === 'event' && String(row.status || '') !== 'void'
      );
    } catch (err) {
      hosts.forEach((host) => {
        host.innerHTML =
          '<p class="muted">Could not load event bookings yet.</p>';
      });
      return;
    }

    const advice =
      '<p class="member-event-booking__advice">Bank transfers can take a few days to appear on the Taunet account. Pay at least <strong>5 days before the event</strong>. After you pay, upload a screenshot here. We email you immediately. Receipt and ticket are issued after the Treasurer confirms the deposit.</p>';

    hosts.forEach((host) => {
      if (!rows.length) {
        host.innerHTML =
          advice +
          '<p class="muted">No event bookings yet. Book from Events, then return here to upload your receipt screenshot and collect your ticket.</p>';
        return;
      }
      host.innerHTML =
        advice +
        '<div class="member-invoice-list">' +
        rows.map((row) => renderCard(row, invoices)).join('') +
        '</div>';

      const setStatus = (fromEl, message, isError) => {
        const card = fromEl.closest('[data-event-booking]');
        const el = card?.querySelector('[data-event-booking-status]');
        if (!el) return;
        el.hidden = false;
        el.textContent = message;
        el.classList.toggle('is-error', Boolean(isError));
      };

      bindDownloads(host, invoices, setStatus);

      host.querySelectorAll('[data-event-proof-upload]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-event-proof-upload');
          const email =
            btn.getAttribute('data-event-proof-email') || member?.email || '';
          const card = btn.closest('[data-event-booking]');
          const file = card?.querySelector('[data-event-proof-file]')?.files?.[0];
          if (!file) {
            setStatus(btn, 'Please choose a screenshot of your bank receipt.', true);
            return;
          }
          const label = btn.textContent;
          btn.disabled = true;
          btn.textContent = 'Uploading…';
          try {
            const result = await invoices.uploadEventProof(id, email, file);
            setStatus(
              btn,
              result.message ||
                'Screenshot received. Check your email — we have confirmed your transfer is on file.',
              false
            );
            btn.textContent = 'Uploaded';
            window.setTimeout(() => init(member), 600);
          } catch (err) {
            setStatus(btn, err.message || 'Could not upload the screenshot.', true);
            btn.disabled = false;
            btn.textContent = label;
          }
        });
      });
    });
  }

  global.taunetMemberEventBookings = { init };
})(window);
