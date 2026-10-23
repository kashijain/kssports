import QRCode from 'qrcode';
import { statusLabel } from '../domain/constants.js';
import { formatDisplayDate } from '../domain/dates.js';
import { formatInr } from '../domain/money.js';
import { HttpError } from '../http.js';
import { Business, BusinessSettings } from '../models.js';
import { brandLogoDataUrl, readDataUrl } from './files.js';
import type { InvoiceView } from './invoiceView.js';
import { renderPdf } from './pdf.js';

const INK = '#1c1915';
const MUTED = '#6f675e';
const LINE = '#e6dfd2';
const GREEN = '#1d6b58';
const PAPER = '#f6f3ec';

type PdfDoc = PDFKit.PDFDocument;
type CatalogCard = {
  name: string;
  meta: string;
  description: string;
  specs: string;
  retail: string;
  wholesale: string;
  gst: string;
  photo: Buffer | null;
};

function money(value: number): string {
  return formatInr(Number(value) || 0).replace(/\u202f|\u00a0/g, ' ');
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function pngOrJpeg(dataUrl: string): Buffer | null {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || '');
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

function paintImage(doc: PdfDoc, image: Buffer | null, x: number, y: number, w: number, h: number): void {
  if (!image) return;
  try {
    doc.image(image, x, y, { fit: [w, h], align: 'center', valign: 'center' });
  } catch {
    // A photo the PDF writer cannot draw is left as an empty frame.
  }
}

function contentWidth(doc: PdfDoc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pageBottom(doc: PdfDoc): number {
  return doc.page.height - doc.page.margins.bottom;
}

function say(doc: PdfDoc, text: string, x: number, y: number, w: number, font: 'Body' | 'Strong', size: number, color = INK, align: 'left' | 'right' | 'center' = 'left'): number {
  doc.font(font).fontSize(size).fillColor(color);
  const height = doc.heightOfString(text || ' ', { width: w, align });
  doc.text(text || ' ', x, y, { width: w, align });
  return height;
}

function upiUrl(pa: string, pn: string, amount: number, note: string): string {
  const q = encodeURIComponent;
  return `upi://pay?pa=${q(pa)}&pn=${q(pn.slice(0, 40))}&am=${amount.toFixed(2)}&cu=INR&tn=${q(note.slice(0, 40))}`;
}

export async function renderCatalogPdf(
  businessId: string,
  products: {
    name: string;
    sku?: string;
    description?: string;
    specifications?: { label?: string; value?: string }[];
    sellingPrice: number;
    wholesalePrice?: number | null;
    gstRate?: number;
    hsnSac?: string;
    unit?: string;
    images?: { path?: string }[];
    brand?: string;
    category?: string;
  }[],
  priceMode?: 'retail' | 'wholesale' | '',
): Promise<Buffer> {
  const business = await Business.findById(businessId);
  const settings = await BusinessSettings.findOne({ businessId });
  if (!business) throw new HttpError(404, 'Business profile not found.');
  const showRetail = priceMode === 'wholesale' ? false : priceMode === 'retail' ? true : settings?.catalog?.showRetail !== false;
  const showWholesale = priceMode === 'retail' ? false : priceMode === 'wholesale' ? true : settings?.catalog?.showWholesale !== false;
  const showGst = Boolean(settings?.catalog?.showGst);
  const layout = settings?.catalog?.layout === 'list' ? 'list' : 'grid';
  const perPage = Math.min(12, Math.max(1, Number(settings?.catalog?.perPage) || 6));
  const logo = pngOrJpeg((await readDataUrl(business.logoPath || '')) || (await brandLogoDataUrl()));
  const title = priceMode === 'wholesale' ? 'Wholesale price list' : priceMode === 'retail' ? 'Retail price list' : 'Sports equipment and accessories';
  const address = [business.address?.line1, business.address?.city, business.state, business.pincode].filter(Boolean).join(', ');
  const contact = [business.mobile, business.email, business.gstin ? `GSTIN ${business.gstin}` : ''].filter(Boolean).join(' · ');
  const cards: CatalogCard[] = await Promise.all(
    products.map(async (product) => {
      const specs = (product.specifications || [])
        .filter((row) => row.label && row.value)
        .map((row) => `${clean(row.label)}: ${clean(row.value)}`)
        .join('  ·  ');
      return {
        name: clean(product.name) || 'Product',
        meta: [product.sku ? `SKU ${clean(product.sku)}` : '', clean(product.brand), clean(product.category)].filter(Boolean).join(' · '),
        description: clean(product.description),
        specs,
        retail: showRetail ? `Retail price: ${money(product.sellingPrice)}` : '',
        wholesale: showWholesale && product.wholesalePrice != null ? `Wholesale price: ${money(product.wholesalePrice)}` : '',
        gst: showGst ? `GST ${product.gstRate || 0}%${product.hsnSac ? ` · HSN/SAC ${clean(product.hsnSac)}` : ''}` : '',
        photo: pngOrJpeg(product.images?.[0]?.path ? await readDataUrl(product.images[0].path) : ''),
      };
    }),
  );

  return renderPdf((doc) => {
    const drawHeader = (continued: boolean) => {
      let y = doc.page.margins.top;
      if (!continued && logo) paintImage(doc, logo, doc.page.margins.left, y, 58, 58);
      const textX = doc.page.margins.left + (!continued && logo ? 70 : 0);
      const textW = contentWidth(doc) - (!continued && logo ? 70 : 0);
      say(doc, continued ? `KS Sports · ${title}` : 'KS SPORTS', textX, y, textW, 'Strong', continued ? 11 : 22);
      if (!continued) {
        y = Math.max(doc.y + 2, doc.page.margins.top + 28);
        y += say(doc, title, textX, y, textW, 'Body', 11, MUTED);
        y += say(doc, clean(business.name) + (address ? ` · ${address}` : ''), textX, y + 2, textW, 'Body', 9, MUTED) + 2;
        if (contact) y += say(doc, contact, textX, y + 2, textW, 'Body', 9, MUTED);
        y = Math.max(y, doc.page.margins.top + 58) + 10;
      } else {
        y = doc.y + 8;
      }
      doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.margins.left + contentWidth(doc), y).strokeColor(GREEN).lineWidth(continued ? 1 : 2).stroke();
      return y + 12;
    };

    const cols = layout === 'list' ? 1 : 2;
    const gap = 10;
    const cardW = (contentWidth(doc) - gap * (cols - 1)) / cols;
    const inner = cardW - 16;

    const measure = (card: CatalogCard) => {
      let h = 12 + 86;
      doc.font('Strong').fontSize(11);
      h += 6 + doc.heightOfString(card.name, { width: inner });
      doc.font('Body').fontSize(8);
      for (const line of [card.meta, card.description, card.specs, card.gst]) {
        if (line) h += 3 + doc.heightOfString(line, { width: inner });
      }
      doc.font('Strong').fontSize(10);
      if (card.retail) h += 5 + doc.heightOfString(card.retail, { width: inner });
      if (card.wholesale) h += 2 + doc.heightOfString(card.wholesale, { width: inner });
      return h + 8;
    };

    const drawCard = (card: CatalogCard, x: number, y: number, h: number) => {
      doc.roundedRect(x, y, cardW, h, 8).lineWidth(1).strokeColor(LINE).stroke();
      doc.save();
      doc.rect(x + 8, y + 8, inner, 86).fillColor(PAPER).fill();
      doc.restore();
      if (card.photo) paintImage(doc, card.photo, x + 8, y + 8, inner, 86);
      else say(doc, 'KS', x + 8, y + 40, inner, 'Strong', 16, GREEN, 'center');
      let cursor = y + 100;
      cursor += say(doc, card.name, x + 8, cursor, inner, 'Strong', 11);
      doc.font('Body').fontSize(8).fillColor(MUTED);
      for (const line of [card.meta, card.description, card.specs]) {
        if (!line) continue;
        cursor += 3;
        cursor += say(doc, line, x + 8, cursor, inner, 'Body', 8, MUTED);
      }
      if (card.retail) {
        cursor += 5;
        cursor += say(doc, card.retail, x + 8, cursor, inner, 'Strong', 10, INK);
      }
      if (card.wholesale) {
        cursor += 2;
        cursor += say(doc, card.wholesale, x + 8, cursor, inner, 'Strong', 10, GREEN);
      }
      if (card.gst) say(doc, card.gst, x + 8, cursor + 2, inner, 'Body', 8, MUTED);
    };

    let y = drawHeader(false);
    if (!cards.length) {
      say(doc, 'No products match this catalog.', doc.page.margins.left, y, contentWidth(doc), 'Body', 12);
      return;
    }
    let col = 0;
    let rowTop = y;
    let rowHeight = 0;
    let onPage = 0;
    cards.forEach((card) => {
      const h = measure(card);
      const needsPage = onPage >= perPage || (col === 0 && rowTop + h > pageBottom(doc));
      if (needsPage) {
        doc.addPage();
        y = drawHeader(true);
        col = 0;
        rowTop = y;
        rowHeight = 0;
        onPage = 0;
      }
      drawCard(card, doc.page.margins.left + col * (cardW + gap), rowTop, h);
      rowHeight = Math.max(rowHeight, h);
      col += 1;
      onPage += 1;
      if (col >= cols) {
        col = 0;
        rowTop += rowHeight + gap;
        rowHeight = 0;
      }
    });
  });
}

export async function invoiceToPdf(invoice: InvoiceView): Promise<Buffer> {
  const seller = invoice.seller;
  const customer = invoice.customer;
  const gst = invoice.isGstInvoice;
  const logo = pngOrJpeg(seller.logoDataUrl || (await brandLogoDataUrl()));
  const signature = pngOrJpeg(seller.signatureDataUrl || '');
  const showQr = Boolean(seller.upiId) && invoice.amountDue > 0 && invoice.status !== 'draft' && invoice.status !== 'cancelled';
  let qr: Buffer | null = null;
  if (showQr && seller.upiId) {
    try {
      qr = await QRCode.toBuffer(upiUrl(seller.upiId, seller.name || 'KS Sports', invoice.amountDue, invoice.number), {
        type: 'png',
        margin: 1,
        width: 180,
      });
    } catch {
      qr = null;
    }
  }
  const showHsn = invoice.items.some((item) => item.hsnSac);
  const showDiscount = invoice.items.some((item) => item.discountAmount > 0) || invoice.totals.invoiceDiscount > 0;
  const address = [seller.address?.line1, seller.address?.line2, [seller.address?.city, seller.address?.pincode || seller.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const billed = [customer.billingAddress?.line1, customer.billingAddress?.line2, [customer.billingAddress?.city, customer.billingAddress?.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const shipping = customer.shippingAddress;
  const ship = shipping ? [shipping.line1, shipping.line2, [shipping.city, shipping.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';

  return renderPdf((doc) => {
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    let y = doc.page.margins.top;
    if (logo) paintImage(doc, logo, left, y, 52, 52);
    const textX = left + (logo ? 62 : 0);
    say(doc, clean(seller.documentTitle || (gst ? 'Tax Invoice' : 'Invoice')).toUpperCase(), textX, y, width * 0.55, 'Body', 9, MUTED);
    say(doc, clean(seller.name) || 'KS Sports', textX, y + 14, width * 0.55, 'Strong', 18);
    let infoY = y + 38;
    if (address) infoY += say(doc, address, textX, infoY, width * 0.55, 'Body', 8, MUTED);
    const contact = [seller.mobile, seller.email].filter(Boolean).join(' · ');
    if (contact) infoY += say(doc, contact, textX, infoY + 1, width * 0.55, 'Body', 8, MUTED);
    if (gst && seller.gstin) infoY += say(doc, `GSTIN ${seller.gstin}`, textX, infoY + 1, width * 0.55, 'Body', 8, MUTED);
    if (seller.state) infoY += say(doc, `${seller.state}${seller.stateCode ? ` (${seller.stateCode})` : ''}`, textX, infoY + 1, width * 0.55, 'Body', 8, MUTED);

    const metaX = left + width * 0.62;
    const metaW = width * 0.38;
    const meta: Array<[string, string]> = [
      ['Invoice no.', invoice.number],
      ['Invoice date', invoice.invoiceDate ? formatDisplayDate(invoice.invoiceDate) : '—'],
      ['Due date', invoice.dueDate ? formatDisplayDate(invoice.dueDate) : '—'],
      ['Place of supply', `${invoice.placeOfSupply?.state || '—'} (${invoice.placeOfSupply?.stateCode || '—'})`],
      ['Status', statusLabel(invoice.status)],
    ];
    let metaY = y;
    for (const [label, value] of meta) {
      say(doc, label, metaX, metaY, metaW * 0.48, 'Body', 8, MUTED);
      say(doc, clean(value), metaX + metaW * 0.48, metaY, metaW * 0.52, 'Strong', 8, INK, 'right');
      metaY += 14;
    }
    y = Math.max(infoY, metaY, y + 56) + 14;

    const partyW = ship ? width / 2 - 8 : width;
    say(doc, 'BILLED TO', left, y, partyW, 'Body', 8, MUTED);
    say(doc, clean(customer.name) || '—', left, y + 12, partyW, 'Strong', 11);
    let partyBottom = y + 26;
    if (billed) partyBottom += say(doc, billed, left, partyBottom, partyW, 'Body', 8, MUTED);
    const buyerContact = [customer.mobile, customer.email].filter(Boolean).join(' · ');
    if (buyerContact) partyBottom += say(doc, buyerContact, left, partyBottom + 1, partyW, 'Body', 8, MUTED);
    if (customer.gstin) partyBottom += say(doc, `GSTIN ${customer.gstin}`, left, partyBottom + 1, partyW, 'Body', 8, MUTED);
    if (ship) {
      const shipX = left + width / 2 + 8;
      say(doc, 'SHIP TO', shipX, y, partyW, 'Body', 8, MUTED);
      say(doc, ship, shipX, y + 12, partyW, 'Body', 9);
    }
    y = partyBottom + 12;

    const columns: Array<{ key: string; label: string; width: number; align?: 'left' | 'right' }> = [
      { key: 'idx', label: '#', width: 18 },
      { key: 'item', label: 'Item', width: 0 },
      ...(showHsn ? [{ key: 'hsn', label: 'HSN/SAC', width: 52 }] : []),
      { key: 'qty', label: 'Qty', width: 46, align: 'right' as const },
      { key: 'rate', label: 'Rate', width: 58, align: 'right' as const },
      ...(showDiscount ? [{ key: 'discount', label: 'Discount', width: 54, align: 'right' as const }] : []),
      { key: 'taxable', label: 'Taxable', width: 62, align: 'right' as const },
      ...(gst ? [{ key: 'gst', label: 'GST', width: 78, align: 'right' as const }] : []),
      { key: 'total', label: 'Total', width: 62, align: 'right' as const },
    ];
    const fixed = columns.reduce((sum, column) => sum + column.width, 0);
    const itemColumn = columns.find((column) => column.key === 'item');
    if (itemColumn) itemColumn.width = Math.max(70, width - fixed);

    const header = () => {
      y = y + 2 > pageBottom(doc) - 40 ? (doc.addPage(), doc.page.margins.top) : y;
      let x = left;
      doc.font('Body').fontSize(8).fillColor(MUTED);
      for (const column of columns) {
        say(doc, column.label, x, y, column.width - 3, 'Body', 8, MUTED, column.align || 'left');
        x += column.width;
      }
      y += 12;
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor(INK).lineWidth(1).stroke();
      y += 4;
    };

    const cell = (item: InvoiceView['items'][number], index: number, key: string): string => {
      if (key === 'idx') return String(index + 1);
      if (key === 'item') return item.description ? `${clean(item.name)}\n${clean(item.description)}` : clean(item.name);
      if (key === 'hsn') return clean(item.hsnSac) || '—';
      if (key === 'qty') return `${item.quantity} ${clean(item.unit)}`.trim();
      if (key === 'rate') return money(item.rate);
      if (key === 'discount') return item.discountAmount ? money(item.discountAmount) : '—';
      if (key === 'taxable') return money(item.taxableAmount);
      if (key === 'gst') {
        if (!item.gstRate) return '0%';
        if (invoice.supplyType === 'inter') return `${item.gstRate}%\nIGST ${money(item.igst)}`;
        return `${item.gstRate}%\nCGST ${money(item.cgst)}\nSGST ${money(item.sgst)}`;
      }
      return money(item.total);
    };

    header();
    const items = invoice.items.length ? invoice.items : [];
    if (!items.length) {
      say(doc, 'No items yet.', left, y, width, 'Body', 9, MUTED);
      y += 18;
    }
    items.forEach((item, index) => {
      doc.font('Body').fontSize(8);
      const values = columns.map((column) => cell(item, index, column.key));
      const rowH = Math.max(...values.map((value, valueIndex) => doc.heightOfString(value || ' ', { width: columns[valueIndex].width - 4 }))) + 8;
      if (y + rowH > pageBottom(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
        header();
      }
      let x = left;
      values.forEach((value, valueIndex) => {
        const column = columns[valueIndex];
        say(doc, value, x, y, column.width - 4, column.key === 'item' || column.key === 'total' ? 'Strong' : 'Body', 8, INK, column.align || 'left');
        x += column.width;
      });
      y += rowH;
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor(LINE).lineWidth(0.5).stroke();
      y += 4;
    });

    y += 8;
    const totals: Array<[string, string, boolean]> = [
      ['Taxable amount', money(invoice.totals.taxableAmount), false],
      ...(invoice.totals.itemDiscount ? [['Item discount', `− ${money(invoice.totals.itemDiscount)}`, false] as [string, string, boolean]] : []),
      ...(invoice.totals.invoiceDiscount ? [['Invoice discount', `− ${money(invoice.totals.invoiceDiscount)}`, false] as [string, string, boolean]] : []),
      ...(gst && invoice.supplyType !== 'inter' ? [['CGST', money(invoice.totals.cgst), false] as [string, string, boolean], ['SGST', money(invoice.totals.sgst), false] as [string, string, boolean]] : []),
      ...(gst && invoice.supplyType === 'inter' ? [['IGST', money(invoice.totals.igst), false] as [string, string, boolean]] : []),
      ['Round off', money(invoice.totals.roundOff), false],
      ['Grand total', money(invoice.totals.grandTotal), true],
      ...(invoice.amountPaid ? [['Paid', money(invoice.amountPaid), false] as [string, string, boolean], ['Balance', money(invoice.amountDue), false] as [string, string, boolean]] : []),
    ];
    const totalsH = 16 + totals.length * 16 + 36;
    if (y + totalsH > pageBottom(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const wordsW = width * 0.55;
    say(doc, 'Amount in words', left, y, wordsW, 'Body', 8, MUTED);
    say(doc, invoice.amountInWords || '', left, y + 12, wordsW, 'Strong', 10);
    const supply = invoice.supplyType === 'intra' ? 'Intra-state supply · CGST + SGST' : invoice.supplyType === 'inter' ? 'Inter-state supply · IGST' : 'Bill without GST';
    say(doc, supply, left, y + 28, wordsW, 'Body', 8, MUTED);
    let totalY = y;
    const totalX = left + width * 0.58;
    const totalW = width * 0.42;
    for (const [label, value, grand] of totals) {
      if (grand) {
        doc.moveTo(totalX, totalY).lineTo(left + width, totalY).strokeColor(INK).lineWidth(1).stroke();
        totalY += 4;
      }
      say(doc, label, totalX, totalY, totalW * 0.5, grand ? 'Strong' : 'Body', grand ? 11 : 8);
      say(doc, value, totalX + totalW * 0.45, totalY, totalW * 0.55, 'Strong', grand ? 11 : 8, INK, 'right');
      totalY += grand ? 18 : 14;
    }
    y = Math.max(y + 48, totalY) + 8;

    if (gst && invoice.buckets.length) {
      if (y + 40 > pageBottom(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const hsnCols = [90, 50, 90, 70, 70, width - 370];
      const hsnHeads = ['HSN/SAC', 'Rate', 'Taxable', 'CGST', 'SGST', 'IGST'];
      let x = left;
      hsnHeads.forEach((head, index) => {
        say(doc, head, x, y, hsnCols[index] - 4, 'Body', 8, MUTED, index === 0 ? 'left' : 'right');
        x += hsnCols[index];
      });
      y += 12;
      for (const bucket of invoice.buckets) {
        const values = [bucket.hsnSac || '—', `${bucket.gstRate}%`, money(bucket.taxableAmount), money(bucket.cgst), money(bucket.sgst), money(bucket.igst)];
        x = left;
        values.forEach((value, index) => {
          say(doc, clean(value), x, y, hsnCols[index] - 4, 'Body', 8, INK, index === 0 ? 'left' : 'right');
          x += hsnCols[index];
        });
        y += 13;
      }
      y += 6;
    }

    if (seller.bank?.bankName || qr) {
      if (y + 110 > pageBottom(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      if (seller.bank?.bankName) {
        say(doc, 'BANK TRANSFER', left, y, width / 2, 'Body', 8, MUTED);
        say(doc, [seller.bank.bankName, seller.bank.accountName, seller.bank.accountNumber ? `A/c ${seller.bank.accountNumber}` : '', seller.bank.ifsc ? `IFSC ${seller.bank.ifsc}` : ''].filter(Boolean).join('\n'), left, y + 12, width / 2 - 12, 'Body', 9);
      }
      if (qr) {
        const qrX = left + width - 120;
        say(doc, `SCAN TO PAY ${money(invoice.amountDue)}`, qrX, y, 120, 'Body', 8, MUTED);
        paintImage(doc, qr, qrX, y + 14, 72, 72);
        if (seller.upiId) say(doc, seller.upiId, qrX, y + 90, 120, 'Body', 7, MUTED);
      }
      y += 110;
    }

    if (invoice.notes || invoice.terms) {
      if (y + 50 > pageBottom(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      const columnW = invoice.notes && invoice.terms ? width / 2 - 8 : width;
      let notesH = 0;
      let termsH = 0;
      if (invoice.notes) {
        say(doc, 'NOTES', left, y, columnW, 'Body', 8, MUTED);
        notesH = 12 + say(doc, invoice.notes, left, y + 12, columnW, 'Body', 8);
      }
      if (invoice.terms) {
        const termsX = invoice.notes ? left + width / 2 + 8 : left;
        say(doc, 'TERMS', termsX, y, columnW, 'Body', 8, MUTED);
        termsH = 12 + say(doc, invoice.terms, termsX, y + 12, columnW, 'Body', 8);
      }
      y += Math.max(notesH, termsH) + 8;
    }

    if (invoice.cancelReason) {
      y += 8;
      y += say(doc, `Cancelled: ${clean(invoice.cancelReason)}`, left, y, width, 'Body', 8, MUTED);
    }
    if (y + 80 > pageBottom(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 12;
    if (invoice.footer || seller.footer) say(doc, invoice.footer || seller.footer, left, y, width * 0.6, 'Body', 8, MUTED);
    const signX = left + width * 0.62;
    if (signature) paintImage(doc, signature, signX, y, 120, 36);
    say(doc, clean(seller.signatory || seller.ownerName), signX, y + 42, width * 0.38, 'Strong', 9, INK, 'right');
    say(doc, 'Authorised signatory', signX, y + 56, width * 0.38, 'Body', 8, MUTED, 'right');
  });
}

export function purchaseRegisterPdf(
  shop: string,
  rows: { number: string; supplier: string; invoice: string; date: string; total: number; due: number; status: string }[],
): Promise<Buffer> {
  return renderPdf((doc) => {
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    const weights = [78, 110, 78, 78, 80, 70, 70];
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const cols = weights.map((weight) => (weight / weightSum) * width);
    const headers = ['Purchase', 'Supplier', 'Their invoice', 'Date', 'Total', 'Due', 'Status'];
    const aligns: Array<'left' | 'right'> = ['left', 'left', 'left', 'left', 'right', 'right', 'right'];

    const paintHead = (y: number) => {
      headers.forEach((header, index) => {
        const x = left + cols.slice(0, index).reduce((sum, width) => sum + width, 0);
        say(doc, header, x, y, cols[index] - 4, 'Body', 8, MUTED, aligns[index]);
      });
      const line = y + 12;
      doc.moveTo(left, line).lineTo(left + width, line).strokeColor(GREEN).lineWidth(1.5).stroke();
      return line + 6;
    };

    let y = doc.page.margins.top;
    say(doc, clean(shop) || 'KS Sports', left, y, width, 'Strong', 18);
    y = doc.y + 2;
    y += say(doc, 'Wholesale purchases', left, y, width, 'Body', 11, MUTED);
    y += 8;
    y = paintHead(y);

    const valuesFor = (row: (typeof rows)[number]) => [
      row.number,
      clean(row.supplier),
      clean(row.invoice),
      row.date ? formatDisplayDate(row.date) : '—',
      money(row.total),
      money(row.due),
      statusLabel(row.status),
    ];

    if (!rows.length) {
      say(doc, 'No wholesale purchases yet.', left, y, width, 'Body', 11);
    }
    for (const row of rows) {
      const values = valuesFor(row);
      doc.font('Body').fontSize(8);
      const rowH = Math.max(...values.map((value, index) => doc.heightOfString(value || ' ', { width: cols[index] - 4 }))) + 8;
      if (y + rowH > pageBottom(doc)) {
        doc.addPage();
        y = paintHead(doc.page.margins.top);
      }
      values.forEach((value, index) => {
        const x = left + cols.slice(0, index).reduce((sum, width) => sum + width, 0);
        say(doc, value, x, y, cols[index] - 4, index === 0 ? 'Strong' : 'Body', 8, INK, aligns[index]);
      });
      y += rowH;
      doc.moveTo(left, y - 3).lineTo(left + width, y - 3).strokeColor(LINE).lineWidth(0.4).stroke();
    }

    const total = rows.reduce((sum, row) => sum + (row.total || 0), 0);
    const due = rows.reduce((sum, row) => sum + (row.due || 0), 0);
    if (y + 56 > pageBottom(doc)) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 8;
    say(doc, `Total ${money(total)}`, left, y, width / 2, 'Strong', 11);
    say(doc, `Still due ${money(due)}`, left + width / 2, y, width / 2, 'Strong', 11, INK, 'right');
    y += 22;
    say(
      doc,
      'Total profit is not this purchase total. It is counted when the goods are sold: taxable sale amount minus the purchase cost on that bill. Shop expenses are subtracted after that.',
      left,
      y,
      width,
      'Body',
      8,
      MUTED,
    );
  });
}

export function purchaseBillsPdf(
  shop: string,
  purchases: {
    number: string;
    supplier: string;
    company?: string;
    invoice: string;
    date: string;
    status: string;
    total: number;
    paid: number;
    due: number;
    items: { name: string; quantity: number; rate: number; gstRate: number; total: number }[];
  }[],
): Promise<Buffer> {
  return renderPdf((doc) => {
    const left = doc.page.margins.left;
    const width = contentWidth(doc);
    const bills = purchases.length ? purchases : [];
    if (!bills.length) {
      say(doc, clean(shop) || 'KS Sports', left, doc.page.margins.top, width, 'Strong', 18);
      say(doc, 'No wholesale purchases yet.', left, doc.y + 8, width, 'Body', 11);
      return;
    }
    bills.forEach((purchase, index) => {
      if (index > 0) doc.addPage();
      let y = doc.page.margins.top;
      say(doc, clean(shop) || 'KS Sports', left, y, width * 0.62, 'Strong', 16);
      say(doc, 'Purchase bill', left + width * 0.62, y, width * 0.38, 'Body', 10, MUTED, 'right');
      y = doc.y + 4;
      y += say(doc, purchase.number, left, y, width, 'Strong', 18);
      const supplier = [clean(purchase.supplier), clean(purchase.company)].filter(Boolean).join(' · ');
      const meta = [
        supplier ? `Supplier: ${supplier}` : '',
        purchase.invoice ? `Their invoice: ${clean(purchase.invoice)}` : '',
        purchase.date ? `Date: ${formatDisplayDate(purchase.date)}` : '',
        `Status: ${statusLabel(purchase.status)}`,
      ].filter(Boolean);
      for (const line of meta) y += say(doc, line, left, y + 2, width, 'Body', 10, MUTED) + 2;
      y += 8;
      const weights = [220, 50, 80, 50, 80];
      const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
      const cols = weights.map((weight) => (weight / weightSum) * width);
      const headers = ['Item', 'Qty', 'Rate', 'GST', 'Amount'];
      const aligns: Array<'left' | 'right'> = ['left', 'right', 'right', 'right', 'right'];
      headers.forEach((header, headerIndex) => {
        const x = left + cols.slice(0, headerIndex).reduce((sum, column) => sum + column, 0);
        say(doc, header, x, y, cols[headerIndex] - 4, 'Body', 8, MUTED, aligns[headerIndex]);
      });
      y += 14;
      doc.moveTo(left, y).lineTo(left + width, y).strokeColor(GREEN).lineWidth(1.5).stroke();
      y += 6;
      const lines = purchase.items.length ? purchase.items : [];
      if (!lines.length) {
        y += say(doc, 'No lines on this purchase.', left, y, width, 'Body', 10, MUTED);
        y += 8;
      }
      for (const item of lines) {
        const values = [clean(item.name) || 'Item', String(item.quantity), money(item.rate), `${item.gstRate || 0}%`, money(item.total)];
        doc.font('Body').fontSize(9);
        const rowH = Math.max(...values.map((value, valueIndex) => doc.heightOfString(value || ' ', { width: cols[valueIndex] - 4 }))) + 6;
        if (y + rowH > pageBottom(doc)) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        values.forEach((value, valueIndex) => {
          const x = left + cols.slice(0, valueIndex).reduce((sum, column) => sum + column, 0);
          say(doc, value, x, y, cols[valueIndex] - 4, valueIndex === 0 ? 'Strong' : 'Body', 9, INK, aligns[valueIndex]);
        });
        y += rowH;
        doc.moveTo(left, y - 2).lineTo(left + width, y - 2).strokeColor(LINE).lineWidth(0.4).stroke();
      }
      if (y + 48 > pageBottom(doc)) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      y += 10;
      say(doc, `Total ${money(purchase.total)}`, left, y, width, 'Strong', 12, INK, 'right');
      y = doc.y + 2;
      say(doc, `Paid ${money(purchase.paid)}`, left, y, width, 'Body', 10, INK, 'right');
      y = doc.y + 2;
      say(doc, `Due ${money(purchase.due)}`, left, y, width, 'Strong', 11, INK, 'right');
    });
  });
}

export function textPdf(title: string, lines: string[]): Promise<Buffer> {
  return renderPdf((doc) => {
    const width = contentWidth(doc);
    doc.font('Strong').fontSize(18).fillColor(INK).text(title, { width });
    doc.moveDown(0.4);
    doc.font('Body').fontSize(9).fillColor(INK);
    const rows = lines.map((line) => line.replace(/\u202f|\u00a0/g, ' ')).filter((line) => line.length);
    for (const line of rows.length ? rows : ['Nothing to show for this report.']) {
      doc.text(line, { width });
    }
  });
}
