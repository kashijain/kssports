import QRCode from 'qrcode';
import { formatDisplayDate } from '../domain/dates.js';
import { formatInr } from '../domain/money.js';
import { statusLabel } from '../domain/constants.js';
import { brandLogoDataUrl } from './files.js';
import type { InvoiceView } from './invoiceView.js';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function block(value: string): string {
  return esc(value).replace(/\n/g, '<br>');
}

function safeImage(src: string | undefined | null): string {
  if (!src) return '';
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(src)) return '';
  if (src.includes('"') || src.includes('<')) return '';
  return src;
}

function addressBlock(address?: InvoiceView['customer']['billingAddress'] | null): string {
  if (!address) return '';
  const city = [address.city, address.pincode].filter(Boolean).join(' ');
  return [address.line1, address.line2, city]
    .filter(Boolean)
    .map((line) => esc(line))
    .join('<br>');
}

function upiUrl(pa: string, pn: string, amount: number, note: string): string {
  const q = encodeURIComponent;
  return `upi://pay?pa=${q(pa)}&pn=${q(pn.slice(0, 40))}&am=${amount.toFixed(2)}&cu=INR&tn=${q(note.slice(0, 40))}`;
}

function gstCell(item: InvoiceView['items'][number], supply: InvoiceView['supplyType']): string {
  if (item.gstRate === 0) return '0%';
  const rate = `${item.gstRate}%`;
  if (supply === 'intra') {
    return `${rate}<div class="fine">CGST ${esc(formatInr(item.cgst))}<br>SGST ${esc(formatInr(item.sgst))}</div>`;
  }
  return `${rate}<div class="fine">IGST ${esc(formatInr(item.igst))}</div>`;
}

export async function renderInvoiceHtml(invoice: InvoiceView, opts?: { autoPrint?: boolean }): Promise<string> {
  const seller = invoice.seller;
  const customer = invoice.customer;
  const gst = invoice.isGstInvoice;
  const logo = safeImage(seller.logoDataUrl) || safeImage(await brandLogoDataUrl());
  const signature = safeImage(seller.signatureDataUrl);
  const showQr = Boolean(seller.upiId) && invoice.amountDue > 0 && invoice.status !== 'draft' && invoice.status !== 'cancelled';
  let qr = '';
  if (showQr && seller.upiId) {
    try {
      qr = await QRCode.toDataURL(upiUrl(seller.upiId, seller.name || 'Seller', invoice.amountDue, invoice.number), {
        margin: 1,
        width: 180,
        errorCorrectionLevel: 'M',
      });
    } catch {
      qr = '';
    }
  }
  const showHsn = invoice.items.some((item) => item.hsnSac);
  const showDiscount = invoice.items.some((item) => item.discountAmount > 0) || invoice.totals.invoiceDiscount > 0;
  const shipping = customer.shippingAddress;
  const showShip = Boolean(shipping && (shipping.line1 || shipping.city));
  const watermark =
    invoice.status === 'draft' ? 'DRAFT' : invoice.status === 'cancelled' ? 'CANCELLED' : '';

  const rows = invoice.items
    .map((item, index) => {
      const title = `<div class="item-name">${esc(item.name)}</div>${item.description ? `<div class="fine">${esc(item.description)}</div>` : ''}`;
      return `<tr>
        <td class="idx">${index + 1}</td>
        <td>${title}</td>
        ${showHsn ? `<td>${esc(item.hsnSac || '—')}</td>` : ''}
        <td class="num">${item.quantity} ${esc(item.unit || '')}</td>
        <td class="num">${esc(formatInr(item.rate))}</td>
        ${showDiscount ? `<td class="num">${item.discountAmount ? esc(formatInr(item.discountAmount)) : '—'}</td>` : ''}
        <td class="num">${esc(formatInr(item.taxableAmount))}</td>
        ${gst ? `<td>${gstCell(item, invoice.supplyType)}</td>` : ''}
        <td class="num strong">${esc(formatInr(item.total))}</td>
      </tr>`;
    })
    .join('');

  const taxRows = gst
    ? `${invoice.supplyType !== 'inter' ? `<tr><td>CGST</td><td class="num">${esc(formatInr(invoice.totals.cgst))}</td></tr><tr><td>SGST</td><td class="num">${esc(formatInr(invoice.totals.sgst))}</td></tr>` : ''}
       ${invoice.supplyType === 'inter' ? `<tr><td>IGST</td><td class="num">${esc(formatInr(invoice.totals.igst))}</td></tr>` : ''}`
    : '';

  const bucketRows =
    gst && invoice.buckets.length
      ? invoice.buckets
          .map(
            (bucket) => `<tr>
              <td>${esc(bucket.hsnSac || '—')}</td>
              <td class="num">${bucket.gstRate}%</td>
              <td class="num">${esc(formatInr(bucket.taxableAmount))}</td>
              <td class="num">${esc(formatInr(bucket.cgst))}</td>
              <td class="num">${esc(formatInr(bucket.sgst))}</td>
              <td class="num">${esc(formatInr(bucket.igst))}</td>
            </tr>`,
          )
          .join('')
      : '';

  const bank = seller.bank?.bankName
    ? `<div class="pay-block">
        <h3>Bank transfer</h3>
        <p>${esc(seller.bank.bankName)}</p>
        <p>${esc(seller.bank.accountName)}</p>
        <p>A/c ${esc(seller.bank.accountNumber)}</p>
        <p>IFSC ${esc(seller.bank.ifsc)}</p>
      </div>`
    : '';

  const qrBlock =
    qr && seller.upiId
      ? `<div class="pay-block qr">
          <h3>Scan to pay ${esc(formatInr(invoice.amountDue))}</h3>
          <img src="${qr}" alt="UPI QR code" />
          <p>${esc(seller.upiId)}</p>
        </div>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(invoice.number)} · ${esc(seller.name)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #1c1915; }
    body { font-family: Inter, "Liberation Sans", "Noto Sans", sans-serif; font-size: 12px; line-height: 1.45; }
    .sheet { position: relative; }
    .template-classic .sheet-inner { border: 1.5px solid #1c1915; padding: 16px 18px 18px; }
    .template-classic .sheet-inner { outline: 4px solid #fff; box-shadow: 0 0 0 1px #1c1915; }
    .template-modern .band { height: 8px; background: #c24d24; margin: -16px -18px 16px; }
    .template-modern .sheet-inner { padding: 16px 18px 18px; }
    .template-compact { font-size: 11px; }
    .template-compact .sheet-inner { padding: 8px 10px 12px; }
    h1 { font-family: "Liberation Serif", "Noto Serif", Georgia, serif; font-size: 26px; line-height: 1.1; margin: 0; font-weight: 650; }
    .kicker { letter-spacing: 0.16em; text-transform: uppercase; font-size: 11px; margin: 0 0 4px; color: #6f675e; }
    .top, .parties, .summary, .pay, .foot { display: flex; justify-content: space-between; gap: 18px; }
    .top { align-items: flex-start; }
    .brand { display: flex; gap: 12px; align-items: flex-start; max-width: 68%; }
    .brand img.logo { width: 92px; height: 92px; object-fit: cover; border-radius: 50%; }
    .muted, .fine { color: #6f675e; }
    .fine { font-size: 10.5px; margin-top: 2px; }
    .meta { min-width: 210px; }
    .meta div, .totals td { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; }
    .meta span { color: #6f675e; }
    .parties { margin: 16px 0; }
    .party { flex: 1; }
    .party h2, .pay h3, .note h3 { margin: 0 0 4px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6f675e; }
    table.items, table.hsn { width: 100%; border-collapse: collapse; margin-top: 4px; }
    table.items th { text-align: left; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #6f675e; border-bottom: 1px solid #1c1915; padding: 6px 6px; }
    table.items td { border-bottom: 1px solid #e6dfd2; padding: 7px 6px; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    th.num { text-align: right; }
    .idx { width: 24px; color: #6f675e; }
    .item-name { font-weight: 600; }
    .summary { align-items: flex-start; margin-top: 14px; }
    .words { flex: 1; padding-right: 12px; }
    .words strong { display: block; margin-top: 4px; font-size: 13px; }
    table.totals { width: 280px; border-collapse: collapse; }
    table.totals td { border-bottom: 1px solid #e6dfd2; padding: 4px 0; }
    table.totals tr.grand td { border-bottom: 0; border-top: 1.5px solid #1c1915; font-size: 15px; font-weight: 700; padding-top: 8px; }
    table.hsn { margin-top: 16px; }
    table.hsn th, table.hsn td { border: 1px solid #e6dfd2; padding: 4px 6px; font-size: 11px; }
    table.hsn th { background: #f6f3ec; text-align: left; }
    .pay { margin-top: 16px; align-items: flex-start; }
    .pay-block img { width: 108px; height: 108px; }
    .notes { display: flex; gap: 18px; margin-top: 16px; }
    .note { flex: 1; }
    .foot { margin-top: 22px; align-items: flex-end; }
    .sign { text-align: right; min-width: 180px; }
    .sign img { height: 56px; object-fit: contain; }
    .sign .line { margin-top: 8px; border-top: 1px solid #1c1915; padding-top: 4px; }
    .status { display: inline-block; border: 1px solid #1c1915; padding: 2px 8px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
    .watermark { position: absolute; left: 12%; top: 38%; font-size: 72px; letter-spacing: 0.12em; color: rgba(194, 77, 36, 0.12); font-weight: 700; transform: rotate(-18deg); pointer-events: none; }
    .footer-note { margin-top: 16px; color: #6f675e; font-size: 11px; }
    @media screen {
      body { background: #e7e1d6; padding: 24px 12px 48px; }
      .sheet { max-width: 210mm; min-height: 297mm; margin: 0 auto; background: white; padding: 10mm; box-shadow: 0 16px 50px rgba(28, 25, 21, 0.12); }
    }
    @media print {
      body { background: white; }
      .sheet { box-shadow: none; }
    }
  </style>
</head>
<body class="template-${esc(invoice.template)}">
  <article class="sheet">
    ${watermark ? `<div class="watermark">${watermark}</div>` : ''}
    <div class="sheet-inner">
      <div class="band"></div>
      <header class="top">
        <div class="brand">
          ${logo ? `<img class="logo" src="${logo}" alt="" />` : ''}
          <div>
            <p class="kicker">${esc(seller.documentTitle || (gst ? 'Tax Invoice' : 'Invoice'))}</p>
            <h1>${esc(seller.name)}</h1>
            <p>${addressBlock(seller.address)}</p>
            <p>${[seller.mobile, seller.email].filter(Boolean).map(esc).join(' · ')}</p>
            ${gst && seller.gstin ? `<p>GSTIN ${esc(seller.gstin)}</p>` : ''}
            ${seller.pan ? `<p>PAN ${esc(seller.pan)}</p>` : ''}
            ${seller.state ? `<p>${esc(seller.state)} (${esc(seller.stateCode)})</p>` : ''}
          </div>
        </div>
        <div class="meta">
          <div><span>Invoice no.</span><strong>${esc(invoice.number)}</strong></div>
          <div><span>Invoice date</span><strong>${esc(formatDisplayDate(invoice.invoiceDate))}</strong></div>
          <div><span>Due date</span><strong>${invoice.dueDate ? esc(formatDisplayDate(invoice.dueDate)) : '—'}</strong></div>
          <div><span>Place of supply</span><strong>${esc(invoice.placeOfSupply.state)} (${esc(invoice.placeOfSupply.stateCode)})</strong></div>
          <div><span>Status</span><strong class="status">${esc(statusLabel(invoice.status))}</strong></div>
        </div>
      </header>
      <section class="parties">
        <div class="party">
          <h2>Billed to</h2>
          <strong>${esc(customer.name || '—')}</strong>
          <p>${addressBlock(customer.billingAddress)}</p>
          ${customer.mobile || customer.email ? `<p>${[customer.mobile, customer.email].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
          ${customer.gstin ? `<p>GSTIN ${esc(customer.gstin)}</p>` : ''}
          ${customer.state ? `<p>State ${esc(customer.state)} · Code ${esc(customer.stateCode)}</p>` : ''}
        </div>
        ${showShip ? `<div class="party"><h2>Ship to</h2><p>${addressBlock(shipping)}</p>${shipping?.state ? `<p>${esc(shipping.state)} (${esc(shipping.stateCode)})</p>` : ''}</div>` : ''}
      </section>
      <table class="items">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            ${showHsn ? '<th>HSN/SAC</th>' : ''}
            <th class="num">Qty</th>
            <th class="num">Rate</th>
            ${showDiscount ? '<th class="num">Discount</th>' : ''}
            <th class="num">Taxable</th>
            ${gst ? '<th>GST</th>' : ''}
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="8">No items yet.</td></tr>'}</tbody>
      </table>
      <section class="summary">
        <div class="words">
          <span class="muted">Amount in words</span>
          <strong>${esc(invoice.amountInWords)}</strong>
          ${invoice.supplyType === 'intra' ? '<p class="fine">Intra-state supply · CGST + SGST</p>' : ''}
          ${invoice.supplyType === 'inter' ? '<p class="fine">Inter-state supply · IGST</p>' : ''}
          ${invoice.supplyType === 'non_gst' ? '<p class="fine">Bill without GST</p>' : ''}
        </div>
        <table class="totals">
          <tr><td>Taxable amount</td><td class="num">${esc(formatInr(invoice.totals.taxableAmount))}</td></tr>
          ${invoice.totals.itemDiscount ? `<tr><td>Item discount</td><td class="num">− ${esc(formatInr(invoice.totals.itemDiscount))}</td></tr>` : ''}
          ${invoice.totals.invoiceDiscount ? `<tr><td>Invoice discount</td><td class="num">− ${esc(formatInr(invoice.totals.invoiceDiscount))}</td></tr>` : ''}
          ${taxRows}
          <tr><td>Round off</td><td class="num">${esc(formatInr(invoice.totals.roundOff))}</td></tr>
          <tr class="grand"><td>Grand total</td><td class="num">${esc(formatInr(invoice.totals.grandTotal))}</td></tr>
          ${invoice.amountPaid ? `<tr><td>Paid</td><td class="num">${esc(formatInr(invoice.amountPaid))}</td></tr><tr><td>Balance</td><td class="num">${esc(formatInr(invoice.amountDue))}</td></tr>` : ''}
        </table>
      </section>
      ${
        bucketRows
          ? `<table class="hsn"><thead><tr><th>HSN/SAC</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">IGST</th></tr></thead><tbody>${bucketRows}</tbody></table>`
          : ''
      }
      ${bank || qrBlock ? `<section class="pay">${bank}${qrBlock}</section>` : ''}
      ${
        invoice.notes || invoice.terms
          ? `<section class="notes">
              ${invoice.notes ? `<div class="note"><h3>Notes</h3><p>${block(invoice.notes)}</p></div>` : ''}
              ${invoice.terms ? `<div class="note"><h3>Terms</h3><p>${block(invoice.terms)}</p></div>` : ''}
            </section>`
          : ''
      }
      ${invoice.cancelReason ? `<p class="footer-note">Cancelled: ${esc(invoice.cancelReason)}</p>` : ''}
      <footer class="foot">
        <div class="footer-note">${block(invoice.footer || seller.footer || '')}</div>
        <div class="sign">
          ${signature ? `<img src="${signature}" alt="" />` : '<div style="height:48px"></div>'}
          <div class="line">
            <strong>${esc(seller.signatory || seller.ownerName || '')}</strong>
            <div class="fine">Authorised signatory</div>
          </div>
        </div>
      </footer>
    </div>
  </article>
  ${opts?.autoPrint ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 200));</script>' : ''}
</body>
</html>`;
}
