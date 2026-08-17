/**
 * Event booking PayID portal — PayID and bank details shown together after book.
 */
(function () {
  'use strict';

  const form = document.getElementById('pay-event-form');
  const statusEl = document.getElementById('pay-form-status');
  const stepForm = document.getElementById('pay-step-form');
  const stepInstructions = document.getElementById('pay-step-instructions');
  const submitBtn = document.getElementById('pay-submit');
  const eventIdInput = document.getElementById('pay-event-id');

  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('event') || eventIdInput?.value || 'men-s-camp-2026-08-01';
  if (eventIdInput) eventIdInput.value = eventId;

  if (params.get('email') && form?.email) form.email.value = params.get('email');
  if (params.get('name') && form?.full_name) form.full_name.value = params.get('name');
  if (params.get('phone') && form?.phone) form.phone.value = params.get('phone');
  if (params.get('ticket') && form?.ticket) {
    const match = form.querySelector(`input[name="ticket"][value="${params.get('ticket')}"]`);
    if (match) match.checked = true;
  }

  function showStatus(message, isError) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', Boolean(isError));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function copyText(text) {
    const value = String(text || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  function selectedTicket() {
    return form?.querySelector('input[name="ticket"]:checked')?.value || 'member';
  }

  function syncSummaryFromCatalog(data) {
    const event = data.event || {};
    const tickets = Array.isArray(data.tickets) ? data.tickets : [];
    const titleEl = document.getElementById('pay-event-title');
    const eyebrowEl = document.getElementById('pay-event-eyebrow');
    const ledeEl = document.getElementById('pay-event-lede');
    const fromAmount = document.getElementById('pay-event-from-amount');
    const fromMeta = document.getElementById('pay-event-from-meta');

    if (titleEl && event.title) titleEl.textContent = event.title;
    if (eyebrowEl) eyebrowEl.textContent = event.subtitle || 'Event booking';
    if (ledeEl && event.location) {
      ledeEl.innerHTML =
        'Book your place at <strong>' +
        escapeHtml(event.location) +
        '</strong>. Pay by <strong>bank transfer</strong> — account details appear after you book.';
    }

    const paid = tickets.filter((t) => Number(t.amount_cents) > 0);
    const showcase =
      tickets.find((t) => t.id === 'non_member') ||
      tickets.find((t) => t.id === 'member') ||
      paid[0] ||
      tickets[0];
    if (showcase && fromAmount) {
      fromAmount.textContent =
        Number(showcase.amount_cents) === 0
          ? 'Free'
          : showcase.amount_label || '$0';
    }
    if (showcase && fromMeta) {
      fromMeta.textContent = (showcase.label || 'ticket') + ' · AUD';
    }

    if (form && tickets.length) {
      const fieldset = form.querySelector('.pay-portal__tickets');
      if (fieldset) {
        const preferred = selectedTicket();
        fieldset.innerHTML =
          '<legend>Ticket</legend>' +
          tickets
            .map((ticket, index) => {
              const checked =
                ticket.id === preferred || (!preferred && index === 0) ? ' checked' : '';
              const priceLabel =
                Number(ticket.amount_cents) === 0
                  ? 'Free'
                  : escapeHtml(ticket.amount_label || '') + ' AUD';
              return (
                '<label class="pay-portal__ticket">' +
                '<input type="radio" name="ticket" value="' +
                escapeHtml(ticket.id) +
                '"' +
                checked +
                '>' +
                '<span><strong>' +
                escapeHtml(ticket.label) +
                '</strong><em>' +
                priceLabel +
                '</em></span></label>'
              );
            })
            .join('');
      }
    }
  }

  function renderInstructions(data) {
    const invoice = data.invoice || {};
    const payment = data.payment || {};
    const ticket = data.ticket || {};
    const event = data.event || {};
    const isFree = Boolean(data.free) || Number(ticket.amount_cents) === 0;

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value || '—';
    };

    setText('pay-out-event', event.title || 'Event');
    setText('pay-out-ticket', ticket.label || '—');
    setText(
      'pay-out-amount',
      isFree ? 'Free' : (invoice.amount_label || ticket.amount_label || '') + ' AUD'
    );
    setText('pay-out-invoice', isFree ? 'Not required' : invoice.invoice_number);
    setText('pay-out-ref', isFree ? 'Not required' : invoice.pay_reference);
    setText(
      'pay-out-payid',
      isFree ? 'No payment needed' : payment.payid || '—'
    );
    const payidBlock = document.getElementById('pay-payid-block');
    if (payidBlock) payidBlock.hidden = isFree || !payment.payid;

    const heading = document.getElementById('pay-out-heading');
    if (heading) {
      heading.textContent = isFree
        ? 'Free place confirmed'
        : 'Pay ' + (invoice.amount_label || '') + ' by bank transfer';
    }

    const emailNote = document.getElementById('pay-email-note');
    if (emailNote) {
      emailNote.textContent = isFree
        ? data.message ||
          'This ticket is free. No bank payment is required.'
        : (data.message || 'Bank transfer details are shown above.') +
          ' A paid receipt PDF is emailed only after Admin confirms your payment.';
    }

    const bankBlock = document.getElementById('pay-bank-block');
    const bankList = document.getElementById('pay-out-bank');
    if (isFree) {
      if (bankBlock) bankBlock.hidden = true;
      if (bankList) bankList.innerHTML = '';
    } else {
      const bankLines = [];
      if (payment.bank_name) bankLines.push('Bank: ' + payment.bank_name);
      if (payment.bank_bsb) bankLines.push('BSB: ' + payment.bank_bsb);
      if (payment.bank_account_number) bankLines.push('Account: ' + payment.bank_account_number);
      if (payment.bank_account_name) bankLines.push('Account name: ' + payment.bank_account_name);

      if (bankBlock && bankList) {
        if (bankLines.length) {
          bankBlock.hidden = false;
          bankList.innerHTML = bankLines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('');
        } else {
          bankBlock.hidden = true;
          bankList.innerHTML = '';
        }
      }
    }

    if (stepForm) stepForm.hidden = true;
    if (stepInstructions) {
      stepInstructions.hidden = false;
      stepInstructions.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function loadCatalog() {
    try {
      const resp = await fetch('/api/pay/event?event=' + encodeURIComponent(eventId));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Could not load event booking.');
      syncSummaryFromCatalog(data);
      if (data.payment && data.payment.configured === false) {
        showStatus(
          'PayID / bank details are not configured yet. Please contact info@taunetnelel.org.',
          true
        );
      }
    } catch (err) {
      showStatus(err.message || 'Could not load event booking.', true);
    }
  }

  document.getElementById('pay-copy-ref')?.addEventListener('click', () => {
    const ref = document.getElementById('pay-out-ref')?.textContent || '';
    copyText(ref).then(() => {
      const btn = document.getElementById('pay-copy-ref');
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    });
  });

  document.getElementById('pay-copy-payid')?.addEventListener('click', () => {
    const payid = document.getElementById('pay-out-payid')?.textContent || '';
    copyText(payid).then(() => {
      const btn = document.getElementById('pay-copy-payid');
      if (!btn) return;
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    });
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = String(form.full_name?.value || '').trim();
    const email = String(form.email?.value || '').trim();
    const phone = String(form.phone?.value || '').trim();
    const ticket = selectedTicket();

    if (!fullName || fullName.length < 2) {
      showStatus('Please enter your full name.', true);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus('Please enter a valid email address.', true);
      return;
    }

    const original = submitBtn?.textContent || 'Book';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Preparing…';
    }
    showStatus('Creating your booking payment…', false);

    try {
      const resp = await fetch('/api/pay/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          ticket,
          full_name: fullName,
          email,
          phone: phone || undefined,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || 'Could not start event payment.');
      }
      renderInstructions(data);
    } catch (err) {
      showStatus(err.message || 'Could not start event payment.', true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    }
  });

  loadCatalog();
})();
