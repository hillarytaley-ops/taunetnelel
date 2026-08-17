/**
 * Shared CRM custom-field renderer for Admin records and the member Welfare tab.
 */
(function (global) {
  'use strict';

  const GROUP_LABELS = {
    contact: 'Contact',
    personal: 'Personal',
    welfare: 'Welfare membership',
    beneficiary: 'Next of kin & beneficiary',
    employment: 'Employment',
    financial: 'Bank & identification',
    communications: 'Communications',
    committee: 'Committee only'
  };

  const GROUP_HINTS = {
    contact: 'Address and emergency contact details.',
    personal: 'Household and community details used for welfare cover.',
    welfare: 'Cover, contributions, and claim status.',
    beneficiary: 'Required by the Welfare Association constitution for bereavement support.',
    employment: 'Work details. Income and employer are committee-only.',
    financial: 'Sensitive. Visible to committee admins only — never on the member Welfare tab.',
    communications: 'How this member wants to be contacted. Used later for email/SMS campaigns.',
    committee: 'Internal notes. Members cannot see this group.'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseOptions(field) {
    const raw = field?.options;
    if (Array.isArray(raw)) return raw.map((item) => String(item));
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item));
      } catch (_) {
        return raw.split(',').map((item) => item.trim()).filter(Boolean);
      }
    }
    return [];
  }

  function groupFields(fields) {
    const order = Object.keys(GROUP_LABELS);
    const map = new Map();
    (fields || []).forEach((field) => {
      const key = field.field_group || 'contact';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(field);
    });
    return order
      .filter((key) => map.has(key) && map.get(key).length)
      .map((key) => [key, map.get(key)]);
  }

  function isChecked(value) {
    const text = String(value || '').trim().toLowerCase();
    return text === 'true' || text === '1' || text === 'yes' || text === 'on';
  }

  function renderField(field, value, opts) {
    const prefix = opts.namePrefix || 'crm';
    const name = `${prefix}.${field.field_key}`;
    const id = `${prefix}-${field.field_key}`;
    const current = value == null ? '' : String(value);
    const editable = opts.forceReadOnly ? false : field.member_editable !== false || opts.admin;
    const sensitive = Boolean(field.is_sensitive);
    const type = field.field_type || 'text';
    const help = field.help_text
      ? `<p class="crm-field__help">${escapeHtml(field.help_text)}</p>`
      : '';
    const badges = [
      sensitive ? '<span class="crm-badge crm-badge--sensitive">Sensitive</span>' : '',
      field.visibility === 'admin' ? '<span class="crm-badge">Admin only</span>' : '',
      !editable ? '<span class="crm-badge">Read only</span>' : ''
    ].join('');

    let control = '';
    if (type === 'textarea') {
      control = `<textarea id="${escapeHtml(id)}" name="${escapeHtml(name)}" rows="3" ${editable ? '' : 'disabled'}>${escapeHtml(current)}</textarea>`;
    } else if (type === 'select') {
      const options = parseOptions(field);
      const optsHtml = ['<option value="">Select…</option>']
        .concat(
          options.map((option) => {
            const selected = option === current ? ' selected' : '';
            return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
          })
        )
        .join('');
      control = `<select id="${escapeHtml(id)}" name="${escapeHtml(name)}" ${editable ? '' : 'disabled'}>${optsHtml}</select>`;
    } else if (type === 'toggle') {
      control = `<label class="crm-toggle"><input type="checkbox" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="true" ${isChecked(current) ? 'checked' : ''} ${editable ? '' : 'disabled'}><span>Yes</span></label>`;
    } else {
      const inputType =
        type === 'date' ? 'date'
          : type === 'number' || type === 'money' ? 'number'
            : type === 'email' ? 'email'
              : type === 'phone' ? 'tel'
                : 'text';
      const extra = type === 'money' ? ' step="0.01" min="0"' : type === 'number' ? ' step="1"' : '';
      const sensitiveAttr = sensitive && opts.admin ? ' data-crm-sensitive="1"' : '';
      control = `<input type="${inputType}" id="${escapeHtml(id)}" name="${escapeHtml(name)}" value="${escapeHtml(current)}"${extra}${sensitiveAttr} ${editable ? '' : 'disabled'}>`;
    }

    const span = type === 'textarea' ? ' crm-field--wide' : '';
    return `<div class="form-group crm-field${span}${sensitive ? ' crm-field--sensitive' : ''}">
      <label for="${escapeHtml(id)}">${escapeHtml(field.label)} ${badges}</label>
      ${control}
      ${help}
    </div>`;
  }

  function renderForm(fields, values, opts) {
    const options = opts || {};
    const valueMap = values || {};
    const groups = groupFields(fields);
    if (!groups.length) {
      return '<p class="crm-empty">No fields in this library yet.</p>';
    }
    return groups
      .map(([group, list]) => {
        const sensitive = list.some((field) => field.is_sensitive);
        return `<fieldset class="crm-group${sensitive ? ' crm-group--sensitive' : ''}">
          <legend>${escapeHtml(GROUP_LABELS[group] || group)}</legend>
          ${GROUP_HINTS[group] ? `<p class="crm-group__hint">${escapeHtml(GROUP_HINTS[group])}</p>` : ''}
          <div class="crm-group__grid">${list.map((field) => renderField(field, valueMap[field.field_key], options)).join('')}</div>
        </fieldset>`;
      })
      .join('');
  }

  function readFormValues(form, fields, namePrefix) {
    const prefix = namePrefix || 'crm';
    const out = {};
    (fields || []).forEach((field) => {
      if (field.member_editable === false && !form.querySelector(`[name="${prefix}.${field.field_key}"]:not([disabled])`)) {
        const disabled = form.querySelector(`[name="${prefix}.${field.field_key}"]`);
        if (disabled && disabled.disabled) return;
      }
      const el = form.querySelector(`[name="${prefix}.${field.field_key}"]`);
      if (!el || el.disabled) return;
      if (field.field_type === 'toggle') {
        out[field.field_key] = el.checked ? 'true' : 'false';
        return;
      }
      out[field.field_key] = String(el.value || '').trim();
    });
    return out;
  }

  global.taunetCrmFields = {
    GROUP_LABELS,
    GROUP_HINTS,
    escapeHtml,
    parseOptions,
    groupFields,
    renderForm,
    readFormValues
  };
})(window);
