/**
 * Basic Plan PayID portal — single $50 installment.
 */
(function () {
  'use strict';

  const form = document.getElementById('pay-basic-form');
  const statusEl = document.getElementById('pay-form-status');
  const stepForm = document.getElementById('pay-step-form');
  const stepInstructions = document.getElementById('pay-step-instructions');
  const submitBtn = document.getElementById('pay-submit');

  const params = new URLSearchParams(window.location.search);
  const prefillEmail = params.get('email');
  const prefillName = params.get('name');
  const prefillPhone = params.get('phone');
  if (prefillEmail && form?.email) {
    form.email.value = prefillEmail;
  }
  if (prefillName && form?.full_name) {
    form.full_name.value = prefillName;
  }
  if (prefillPhone && form?.phone) {
    form.phone.value = prefillPhone;
  }
  if (params.get('joined') === '1' && statusEl && stepForm && !stepForm.hidden) {
    statusEl.hidden = false;
    statusEl.classList.remove('is-error');
    statusEl.textContent =
      'Account created. Enter the same details below to get your $50 PayID invoice. Confirm your email if you received a confirmation link.';
  } else if (params.get('reason') === 'membership' && statusEl && stepForm && !stepForm.hidden) {
    statusEl.hidden = false;
    statusEl.classList.remove('is-error');
    statusEl.textContent =
      'Pay the $50 Basic Plan via PayID to unlock your member dashboard. Use the same email you registered with.';
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

  function renderInstructions(data) {
    const invoice = data.invoice || {};
    const payment = data.payment || {};

    const amountEl = document.getElementById('pay-out-amount');
    const invoiceEl = document.getElementById('pay-out-invoice');
    const refEl = document.getElementById('pay-out-ref');
    const payidEl = document.getElementById('pay-out-payid');
    const emailNote = document.getElementById('pay-email-note');
    const bankBlock = document.getElementById('pay-bank-block');
    const bankList = document.getElementById('pay-out-bank');

    if (amountEl) {
      amountEl.textContent = (invoice.amount_label || '$50.00') + ' AUD';
    }
    if (invoiceEl) invoiceEl.textContent = invoice.invoice_number || '—';
    if (refEl) refEl.textContent = invoice.pay_reference || '—';
    if (payidEl) {
      payidEl.textContent = payment.payid || 'PayID will appear above once ready';
    }
    if (emailNote) {
      const alreadyJoined = params.get('joined') === '1';
      emailNote.textContent =
        (data.message ||
          'PayID details are shown above. Keep your payment reference.') +
        ' A paid receipt PDF is emailed only after Admin confirms your payment.' +
        (alreadyJoined
          ? ' After confirmation, sign in to open the member dashboard.'
          : ' Next: create your member login with this same email.');
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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
    showStatus('Creating your $50 invoice…', false);

    try {
      const resp = await fetch('/api/pay/basic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone: phone || undefined,
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
