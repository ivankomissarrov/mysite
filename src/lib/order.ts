export type ProductKind = 'hours' | 'options' | 'custom';

export interface ProductOption {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  kind: ProductKind;
  basePrice?: number;
  hourlyRate?: number;
  hoursMin?: number;
  hoursMax?: number;
  options?: ProductOption[];
}

export interface Discount {
  from: number;
  percent: number;
}

export interface OrderCatalog {
  endpoint: string;
  currency: string;
  variancePercent: number;
  varianceNote: string;
  negotiableLabel: string;
  discounts: Discount[];
  products: Product[];
}

export interface OrderLineInput {
  productId: string;
  hours?: number;
  optionIds?: string[];
}

export interface QuotedLine {
  product: Product;
  hours: number;
  options: ProductOption[];
  total: number;
}

export interface OrderQuote {
  lines: QuotedLine[];
  subtotal: number;
  discount: Discount | null;
  discountAmount: number;
  total: number;
  negotiable: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function findProduct(catalog: OrderCatalog, id: string): Product | undefined {
  return catalog.products.find((product) => product.id === id);
}

export function lineHours(product: Product, hours?: number): number {
  const min = product.hoursMin ?? 1;
  const max = product.hoursMax ?? 10;
  return clamp(Math.round(hours ?? min), min, max);
}

export function lineTotal(product: Product, input: OrderLineInput): number {
  if (product.kind === 'hours') {
    return (product.hourlyRate ?? 0) * lineHours(product, input.hours);
  }
  if (product.kind === 'custom') {
    return 0;
  }
  const selected = new Set(input.optionIds ?? []);
  const extras = (product.options ?? [])
    .filter((option) => selected.has(option.id))
    .reduce((sum, option) => sum + option.price, 0);
  return (product.basePrice ?? 0) + extras;
}

export function bestDiscount(subtotal: number, discounts: Discount[]): Discount | null {
  return (
    discounts
      .filter((discount) => subtotal >= discount.from)
      .sort((a, b) => b.percent - a.percent || b.from - a.from)[0] ?? null
  );
}

export function quoteOrder(catalog: OrderCatalog, inputs: OrderLineInput[]): OrderQuote {
  const lines: QuotedLine[] = [];

  for (const input of inputs) {
    const product = findProduct(catalog, input.productId);
    if (!product) continue;
    const selected = new Set(input.optionIds ?? []);
    lines.push({
      product,
      hours: lineHours(product, input.hours),
      options: (product.options ?? []).filter((option) => selected.has(option.id)),
      total: lineTotal(product, input),
    });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const discount = bestDiscount(subtotal, catalog.discounts);
  const discountAmount = discount ? Math.round((subtotal * discount.percent) / 100) : 0;
  const total = subtotal - discountAmount;

  return {
    lines,
    subtotal,
    discount,
    discountAmount,
    total,
    negotiable: total <= 0,
  };
}

export function formatRub(value: number): string {
  const grouped = Math.round(value)
    .toLocaleString('ru-RU')
    .replace(/[\u00A0\u202F]/g, ' ');
  return `${grouped} ₽`;
}

export function formatRubFrom(value: number): string {
  return `от ${formatRub(value)}`;
}

export function formatLineDetail(line: QuotedLine): string {
  if (line.product.kind === 'hours') {
    return `${line.hours} ч`;
  }
  return '';
}

export function buildOrderMessage(
  catalog: OrderCatalog,
  quote: OrderQuote,
  contacts: { phone: string; messenger: string; comment: string },
): string {
  const blocks = quote.lines.map((line, index) => {
    const n = index + 1;
    const detail = formatLineDetail(line);
    const title = detail ? `${line.product.name} — ${detail}` : line.product.name;
    const extras = line.options.map((option) => `   + ${option.name}`).join('\n');
    const price = line.total > 0 ? formatRub(line.total) : catalog.negotiableLabel;
    if (extras) {
      return `${n}. ${title}\n${extras}\n   = ${price}`;
    }
    return `${n}. ${title} — ${price}`;
  });

  const totalLine = quote.negotiable
    ? `Итого: ${catalog.negotiableLabel}`
    : `Итого: ${formatRubFrom(quote.total)}`;

  const discountLine = quote.discount
    ? `Скидка ${quote.discount.percent}%: −${formatRub(quote.discountAmount)}`
    : '';

  return [
    'Новый заказ с сайта',
    '',
    ...blocks,
    '',
    quote.subtotal > 0 ? `Сумма: ${formatRub(quote.subtotal)}` : null,
    discountLine || null,
    totalLine,
    `(ориентировочно, ±${catalog.variancePercent}%)`,
    '',
    `Телефон: ${contacts.phone}`,
    `Мессенджер: ${contacts.messenger || '—'}`,
    `Комментарий: ${contacts.comment || '—'}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidPhone(value: string): boolean {
  const digits = digitsOnly(value);
  return digits.length >= 10 && digits.length <= 15;
}
