/**
 * Minimal single-page PDF (Helvetica) for invoice attachment — no npm deps.
 */

function escapePdfText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * @param {{
 *   orgName: string,
 *   abn?: string,
 *   invoiceNumber: string,
 *   issuedAt: string,
 *   dueAt: string,
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
  const lines = [
    data.orgName || 'Taunet Nelel',
    data.abn ? `ABN: ${data.abn}` : 'Invoice / payment request (GST not itemised)',
    '',
    `Invoice: ${data.invoiceNumber}`,
    `Issued: ${data.issuedAt}`,
    `Due: ${data.dueAt}`,
    '',
    `Bill to: ${data.billToName}`,
    data.billToEmail,
    '',
    'Description',
    data.description,
    '',
    `Amount due: ${data.amountLabel} AUD`,
    '',
    'Pay by PayID / bank transfer',
    data.payid ? `PayID: ${data.payid}` : '',
    data.bankName ? `Bank: ${data.bankName}` : '',
    data.bankBsb ? `BSB: ${data.bankBsb}` : '',
    data.bankAccount ? `Account: ${data.bankAccount}` : '',
    data.bankAccountName ? `Account name: ${data.bankAccountName}` : '',
    `Payment reference: ${data.payReference}`,
    '',
    'Please use the payment reference so we can match your deposit.',
    'Questions: info@taunetnelel.org',
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));

  const contentParts = ['BT', '/F1 11 Tf', '50 780 Td', '14 TL'];
  lines.forEach((line, idx) => {
    if (idx === 0) {
      contentParts.push(`(${escapePdfText(line)}) Tj`);
    } else {
      contentParts.push('T*');
      contentParts.push(`(${escapePdfText(line)}) Tj`);
    }
  });
  contentParts.push('ET');
  const stream = contentParts.join('\n');
  const streamLen = Buffer.byteLength(stream, 'utf8');

  const objects = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n'
  );
  objects.push(
    `4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj\n`
  );
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

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

module.exports = { buildInvoicePdf };
