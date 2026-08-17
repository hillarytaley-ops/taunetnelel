/**
 * Branded single-page invoice PDF (Helvetica + optional JPEG logo) — no npm deps.
 */
const fs = require('fs');
const path = require('path');

function escapePdfText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function loadLogoJpeg() {
  const candidates = [
    path.join(process.cwd(), 'assets', 'images', 'taunet-invoice-logo.jpg'),
    path.join(__dirname, '..', '..', 'assets', 'images', 'taunet-invoice-logo.jpg'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file);
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {{
 *   orgName: string,
 *   abn?: string,
 *   invoiceNumber: string,
 *   issuedAt: string,
 *   dueAt: string,
 *   paidAt?: string,
 *   status?: string,
 *   billToName: string,
 *   billToEmail: string,
 *   description: string,
 *   amountLabel: string,
 *   payReference: string,
 *   payid?: string,
 *   bankName?: string,
 *   bankBsb?: string,
 *   bankAccount?: string,
 *   bankAccountName?: string,
 * }} data
 */
function buildInvoicePdf(data) {
  const status = String(data.status || 'pending').toLowerCase();
  const isPaid = status === 'paid';
  const logo = loadLogoJpeg();

  const lines = [];
  lines.push(data.orgName || 'Taunet Nelel Incorporated');
  lines.push(data.abn ? `ABN: ${data.abn}` : 'Association invoice (GST not itemised)');
  lines.push('');
  lines.push(`INVOICE ${data.invoiceNumber}`);
  lines.push(`Status: ${isPaid ? 'PAID' : status.toUpperCase()}`);
  lines.push(`Issued: ${data.issuedAt || '—'}`);
  if (isPaid && data.paidAt) {
    lines.push(`Paid: ${data.paidAt}`);
  } else {
    lines.push(`Due: ${data.dueAt || '—'}`);
  }
  lines.push('');
  lines.push(`Bill to: ${data.billToName || 'Member'}`);
  if (data.billToEmail) lines.push(data.billToEmail);
  lines.push('');
  lines.push('Description');
  lines.push(data.description || 'Membership fee');
  lines.push('');
  lines.push(`Amount: ${data.amountLabel} AUD`);
  lines.push('');
  if (isPaid) {
    lines.push('Payment received. Thank you for supporting Taunet Nelel.');
    lines.push(`Payment reference: ${data.payReference || '—'}`);
  } else {
    lines.push('Pay by bank transfer (EFT)');
    if (data.payid) lines.push(`PayID: ${data.payid}`);
    if (data.bankName) lines.push(`Bank: ${data.bankName}`);
    if (data.bankBsb) lines.push(`BSB: ${data.bankBsb}`);
    if (data.bankAccount) lines.push(`Account: ${data.bankAccount}`);
    if (data.bankAccountName) lines.push(`Account name: ${data.bankAccountName}`);
    lines.push(`Payment reference: ${data.payReference || '—'}`);
    lines.push('');
    lines.push('Please use the payment reference so we can match your deposit.');
  }
  lines.push('');
  lines.push('Questions: info@taunetnelel.org');
  lines.push('www.taunetnelel.org');

  // Content stream: optional logo image then text
  const content = [];
  let textStartY = 780;
  if (logo) {
    // Draw logo at top (display ~120pt wide, ~52pt tall)
    content.push('q');
    content.push('120 0 0 52 50 770 cm');
    content.push('/Im1 Do');
    content.push('Q');
    textStartY = 740;
  }

  content.push('BT');
  content.push('/F1 12 Tf');
  content.push(`50 ${textStartY} Td`);
  content.push('15 TL');
  lines.forEach((line, idx) => {
    if (idx === 0) {
      content.push('/F2 16 Tf');
      content.push(`(${escapePdfText(line)}) Tj`);
      content.push('/F1 11 Tf');
    } else if (line.startsWith('INVOICE ') || line.startsWith('Amount:')) {
      content.push('T*');
      content.push('/F2 13 Tf');
      content.push(`(${escapePdfText(line)}) Tj`);
      content.push('/F1 11 Tf');
    } else if (line.startsWith('Status: PAID')) {
      content.push('T*');
      content.push('/F2 12 Tf');
      content.push(`(${escapePdfText(line)}) Tj`);
      content.push('/F1 11 Tf');
    } else {
      content.push('T*');
      content.push(`(${escapePdfText(line)}) Tj`);
    }
  });
  content.push('ET');
  const stream = content.join('\n');
  const streamLen = Buffer.byteLength(stream, 'utf8');

  const objects = [];
  // 1 Catalog
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  // 2 Pages
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');

  if (logo) {
    // 3 Page with image resource
    objects.push(
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R >> >> >>endobj\n'
    );
    objects.push(
      `4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`
    );
    objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');
    objects.push('6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n');
    // JPEG image — assume ~320x~N; use generic width/height from JPEG SOF if possible
    const dims = readJpegSize(logo) || { w: 320, h: 140 };
    objects.push(
      `7 0 obj<< /Type /XObject /Subtype /Image /Width ${dims.w} /Height ${dims.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.length} >>stream\n`
    );
    // binary appended later — mark placeholder
  } else {
    objects.push(
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>endobj\n'
    );
    objects.push(
      `4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`
    );
    objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');
    objects.push('6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n');
  }

  if (!logo) {
    return assemblePdf(objects);
  }

  // Assemble with binary JPEG object carefully using Buffers
  return assemblePdfWithJpeg(objects, logo, readJpegSize(logo) || { w: 320, h: 140 }, stream, streamLen);
}

function readJpegSize(buf) {
  // Find SOF0/SOF2 marker
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      return { w, h };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return null;
}

function assemblePdf(objects) {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function assemblePdfWithJpeg(textObjects, jpegBuf, dims, stream, streamLen) {
  // Rebuild objects list as buffers for binary safety
  const parts = [];
  const add = (s) => parts.push(Buffer.from(s, 'utf8'));

  add('%PDF-1.4\n');
  const offsets = [0];
  const mark = () => {
    offsets.push(parts.reduce((n, b) => n + b.length, 0));
  };

  mark();
  add('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  mark();
  add('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  mark();
  add(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im1 7 0 R >> >> >>endobj\n'
  );
  mark();
  add(`4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`);
  mark();
  add('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');
  mark();
  add('6 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n');
  mark();
  add(
    `7 0 obj<< /Type /XObject /Subtype /Image /Width ${dims.w} /Height ${dims.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuf.length} >>stream\n`
  );
  parts.push(jpegBuf);
  add('\nendstream\nendobj\n');

  const body = Buffer.concat(parts);
  const xrefPos = body.length;
  let xref = `xref\n0 8\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= 7; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer<< /Size 8 /Root 1 0 R >>\n`;
  xref += `startxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.concat([body, Buffer.from(xref, 'utf8')]);
}

module.exports = { buildInvoicePdf };
