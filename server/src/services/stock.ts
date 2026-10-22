import { todayKey } from '../domain/dates.js';
import { HttpError } from '../http.js';
import { BusinessSettings, Product, StockMovement } from '../models.js';

export interface StockLine {
  productId: string;
  quantity: number;
  type: 'purchase' | 'sale' | 'sale_reversal' | 'adjustment' | 'opening';
  direction: 'in' | 'out';
  reference: string;
  dateKey: string;
  note?: string;
}

function roundQty(value: number) {
  return Math.round(value * 1000) / 1000;
}

export async function commitStock(businessId: string, lines: StockLine[]) {
  const relevant = lines.filter((line) => line.productId && line.quantity > 0);
  if (!relevant.length) return;
  const settings = await BusinessSettings.findOne({ businessId });
  const allowNegative = Boolean(settings?.inventory?.allowNegativeStock);
  const products = await Product.find({ _id: { $in: relevant.map((line) => line.productId) }, businessId });
  const byId = new Map(products.map((product) => [String(product._id), product]));
  const running = new Map<string, number>();
  const planned: { productId: string; next: number; line: StockLine }[] = [];

  for (const line of relevant) {
    const product = byId.get(line.productId);
    if (!product?.trackStock) continue;
    const current = running.has(line.productId) ? running.get(line.productId)! : product.stockQuantity ?? 0;
    const delta = line.direction === 'in' ? line.quantity : -line.quantity;
    const next = roundQty(current + delta);
    if (next < -0.0001 && !allowNegative) {
      throw new HttpError(
        400,
        `${product.name} would go to ${next} ${product.unit}. Reduce the quantity, or turn on “Allow negative stock” in Settings.`,
      );
    }
    running.set(line.productId, next);
    planned.push({ productId: line.productId, next, line });
  }

  for (const step of planned) {
    const product = byId.get(step.productId)!;
    product.stockQuantity = step.next;
    await StockMovement.create({
      businessId,
      productId: product._id,
      type: step.line.type,
      reference: step.line.reference,
      dateKey: step.line.dateKey,
      qtyIn: step.line.direction === 'in' ? step.line.quantity : 0,
      qtyOut: step.line.direction === 'out' ? step.line.quantity : 0,
      balance: step.next,
      note: step.line.note || '',
    });
  }
  await Promise.all([...byId.values()].filter((product) => product.trackStock).map((product) => product.save()));
}

export async function noteOpening(businessId: string, productId: string, quantity: number, date = todayKey('Asia/Kolkata')) {
  if (quantity <= 0) return;
  await StockMovement.create({
    businessId,
    productId,
    type: 'opening',
    reference: 'Opening stock',
    dateKey: date,
    qtyIn: quantity,
    qtyOut: 0,
    balance: quantity,
    note: '',
  });
}
