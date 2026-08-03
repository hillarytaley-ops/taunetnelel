/**
 * Welfare Plus PayID portal — full $300 or 3 × $100 installments.
 */
(function () {
  'use strict';

  const form = document.getElementById('pay-welfare-form');
  const statusEl = document.getElementById('pay-form-status');
  const stepForm = document.getElementById('pay-step-form');
  const stepInstructions = document.getElementById('pay-step-instructions');
  const submitBtn = document.getElementById('pay-submit');

  const params = new URLSearchParams(window.location.search);
  const prefillEmail = params.get('email');
  const prefillName = params.get('name');
  const prefillPhone = params.get('phone');
  const prefillPlan = params.get('plan');

  if (prefillEmail && form?.email) form.email.value = prefillEmail;
  if (prefillName && form?.full_name) form.full_name.value = prefillName;
  if (prefillPhone && form?.phone) form.phone.value = prefillPhone;
  if (prefillPlan === 'installments' || prefillPlan === 'full') {
    const radio = form?.querySelector(`input[name="plan"][value="${prefillPlan}"]`);
    if (radio) radio.checked = true;
  }

  function showStatus(message, isError) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', Boolean(isError));
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDue(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return String(iso || '—');
    }
  }

  function renderInstructions(data) {
    const invoice = data.invoice || {};
    const payment = data.payment || {};
    const plan = data.plan || 'full';
    const schedule = Array.isArray(data.schedule) ? data.schedule : [];

    const amountEl = document.getElementById('pay-out-amount');
    const planEl = document.getElementById('pay-out-plan');
    const invoiceEl = document.getElementById('pay-out-invoice');
    const refEl = document.getElementById('pay-out-ref');
    const payidEl = document.getElementById('pay-out-payid');
    const emailNote = document.getElementById('pay-email-note');
    const bankBlock = document.getElementById('pay-bank-block');
    const bankList = document.getElementById('pay-out-bank');
    const badge = document.getElementById('pay-out-badge');
    const title = document.getElementById('pay-out-title');
    const scheduleBlock = document.getElementById('pay-schedule-block');
    const scheduleList = document.getElementById('pay-out-schedule');

    if (amountEl) {
      amountEl.textContent = (invoice.amount_label || '$300.00') + ' AUD';
    }
    if (planEl) {
      planEl.textContent =
        plan === 'installments'
          ? `Installment ${invoice.installment || 1} of ${invoice.of || 3}`
          : 'Full year — single payment';
    }
    if (invoiceEl) invoiceEl.textContent = invoice.invoice_number || '—';
    if (refEl) refEl.textContent = invoice.pay_reference || '—';
    if (payidEl) {
      payidEl.textContent = payment.payid || 'PayID will appear on your emailed invoice';
    }
    if (badge) {
      badge.textContent =
        plan === 'installments'
          ? 'Invoice ready · installment 1 of 3'
          : 'Invoice ready · full $300';
    }
    if (title) {
      title.textContent =
        plan === 'installments' ? 'Pay $100 via PayID (installment 1)' : 'Pay $300 via PayID';
    }

    if (scheduleBlock && scheduleList && plan === 'installments' && schedule.length) {
      scheduleBlock.hidden = false;
      scheduleList.innerHTML = schedule
        .map((row, i) => {
          const due = formatDue(row.due_at);
          const nowLabel = i === 0 ? ' — pay now' : ' — reminder by email';
          return `<li><strong>${escapeHtml(row.amount_label || '$100.00')}</strong> · due ${escapeHtml(due)}${nowLabel}<br><span class="meta">${escapeHtml(row.invoice_number || '')} · ref ${escapeHtml(row.pay_reference || '')}</span></li>`;
        })
        .join('');
    } else if (scheduleBlock) {
      scheduleBlock.hidden = true;
    }

    if (emailNote) {
      emailNote.textContent =
        data.message ||
        'A PDF invoice was emailed to you with the same PayID details.';
    }

    const joinBtn = document.getElementById('pay-create-login');
    if (joinBtn) {
      const joinParams = new URLSearchParams({ tab: 'join' });
      if (form?.email?.value) joinParams.set('email', form.email.value.trim());
      if (form?.full_name?.value) joinParams.set('name', form.full_name.value.trim());
      joinBtn.href = '../members/auth.html?' + joinParams.toString();
    }

    const bankLines = [];
    if (payment.bank_name) bankLines.push('Bank: ' + payment.bank_name);
    if (payment.bank_bsb) bankLines.push('BSB: ' + payment.bank_bsb);
    if (payment.bank_account_number) {
      bankLines.push('Account: ' + payment.bank_account_number);
    }
    if (payment.bank_account_name) {
      bankLines.push('Account name: ' + payment.bank_account_name);
    }

    if (bankBlock && bankList) {
      if (bankLines.length) {
        bankBlock.hidden = false;
        bankList.innerHTML = bankLines.map((line) => '<li>' + escapeHtml(line) + '</li>').join('');
      } else {
        bankBlock.hidden = true;
        bankList.innerHTML = '';
      }
    }

    if (stepForm) stepForm.hidden = true;
    if (stepInstructions) {
      stepInstructions.hidden = false;
      stepInstructions.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  document.getElementById('pay-copy-ref')?.addEventListener('click', () => {
    const ref = document.getElementById('pay-out-ref')?.textContent || '';
    copyText(ref).then(() => {
      const btn = document.getElementById('pay-copy-ref');
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1500);
      }
    });
  });

  document.getElementById('pay-copy-payid')?.addEventListener('click', () => {
    const payid = document.getElementById('pay-out-payid')?.textContent || '';
    copyText(payid).then(() => {
      const btn = document.getElementById('pay-copy-payid');
      if (btn) {
        const prev = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = prev;
        }, 1500);
      }
    });
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fullName = String(form.full_name?.value || '').trim();
    const email = String(form.email?.value || '').trim();
    const phone = String(form.phone?.value || '').trim();
    const plan =
      form.querySelector('input[name="plan"]:checked')?.value === 'installments'
        ? 'installments'
        : 'full';

    if (!fullName || fullName.length < 2) {
      showStatus('Please enter your full name.', true);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus('Please enter a valid email address.', true);
      return;
    }

    const original = submitBtn?.textContent || 'Get PayID details';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Preparing…';
    }
    showStatus(
      plan === 'installments'
        ? 'Creating your 3 × $100 installment invoices…'
        : 'Creating your $300 invoice…',
      false
    );

    try {
      const resp = await fetch('/api/pay/welfare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone || undefined,
          plan,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || 'Could not start PayID payment.');
      }
      renderInstructions(data);
    } catch (err) {
      showStatus(err.message || 'Could not start PayID payment.', true);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = original;
      }
    }
  });
})();
