import { formatMoney } from '../../common/http/money.js';

export type OrderConfirmationItem = {
  name: string;
  quantity: number;
  unitPriceAmount: number;
};

export function orderConfirmationHtml(input: {
  orderNumber: string;
  items: OrderConfirmationItem[];
  totalAmount: number;
  currency: string;
}): string {
  const rows = input.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.name)}</td><td>${item.quantity}</td><td>${formatMoney(item.unitPriceAmount, input.currency)}</td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html><body>
<p>Thank you for your order ${escapeHtml(input.orderNumber)}.</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
<tbody>${rows}</tbody></table>
<p>Total: ${formatMoney(input.totalAmount, input.currency)}</p>
</body></html>`;
}

export function orderConfirmationText(input: {
  orderNumber: string;
  items: OrderConfirmationItem[];
  totalAmount: number;
  currency: string;
}): string {
  const lines = input.items.map(
    (item) =>
      `- ${item.name} x${item.quantity} ${formatMoney(item.unitPriceAmount, input.currency)}`,
  );
  return [
    `Order ${input.orderNumber}`,
    ...lines,
    `Total ${formatMoney(input.totalAmount, input.currency)}`,
  ].join('\n');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}
