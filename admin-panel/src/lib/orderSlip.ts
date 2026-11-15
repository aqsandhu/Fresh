// Order slip printing for the admin Orders page (moved out of pages/Orders.tsx
// so it can be tested on its own). Every customer-controlled value is escaped.
import type { Order } from '@/types';
import { esc } from '@/lib/escape';
import { unitLabelShort } from '@/lib/unitLabels';
import { formatOrderStatus, formatPhoneNumber } from '@/utils/formatters';

const SLIP_PRINT_STYLES = `
  body { font-family: Arial, sans-serif; margin: 0; padding: 16px; font-size: 12px; color: #000; }
  .slip-page { page-break-after: always; }
  .slip-page:last-child { page-break-after: auto; }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .header h1 { font-size: 18px; margin: 0 0 4px; }
  .header p { margin: 2px 0; font-size: 11px; color: #555; }
  .section { margin-bottom: 10px; }
  .section-title { font-weight: bold; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 6px; }
  .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .items-table th, .items-table td { text-align: left; padding: 4px 2px; border-bottom: 1px solid #eee; }
  .items-table th { font-size: 11px; font-weight: bold; }
  .items-table td.right, .items-table th.right { text-align: right; }
  .total-section { border-top: 2px dashed #000; padding-top: 6px; margin-top: 6px; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
  .grand-total { font-size: 16px; font-weight: bold; }
  .footer { text-align: center; border-top: 2px dashed #000; padding-top: 8px; margin-top: 10px; font-size: 11px; color: #555; }
  @media print {
    .slip-page { page-break-after: always; }
    .slip-page:last-child { page-break-after: auto; }
  }
`;

/**
 * HTML-escape every customer-controlled string before it is interpolated into
 * the print-slip markup. Without this, a customer named `<img onerror=...>`
 * would execute script in the admin's print window (stored XSS).
 */
/** Format a kg decimal as "5 kg 300 g" (5.3 → 5 kg 300 g). */
export function formatKgGrams(kg: number): string {
  if (!Number.isFinite(kg) || kg < 0) return '';
  const whole = Math.floor(kg);
  const grams = Math.round((kg - whole) * 1000);
  if (grams === 0) return `${whole} kg`;
  if (whole === 0) return `${grams} g`;
  return `${whole} kg ${grams} g`;
}

export function buildOrderSlipHtml(order: Order): string {
  const phoneLine = order.showCustomerPhone
    ? `<div class="row"><span>${esc(formatPhoneNumber(order.customerPhone))}</span></div>`
    : `<div class="row"><span style="font-style:italic;color:#666;">Phone Number is Hidden</span></div>`;

  return `
    <div class="header">
      <h1>FreshBazar</h1>
      <p>Fresh Grocery Delivery</p>
      <p style="font-weight:bold;font-size:13px;">Order: ${esc(order.orderNumber)}</p>
      <p>${esc(new Date(order.placedAt).toLocaleString('en-PK'))}</p>
    </div>
    <div class="section">
      <div class="section-title">Customer</div>
      <div class="row"><span>${esc(order.customerName)}</span></div>
      ${phoneLine}
      ${order.customerEmail ? `<div class="row"><span>${esc(order.customerEmail)}</span></div>` : ''}
    </div>
    ${order.deliveryAddressSnapshot ? `
    <div class="section">
      <div class="section-title">Delivery Address</div>
      ${order.deliveryAddressSnapshot.houseNumber ? `<div><strong>House #: ${esc(order.deliveryAddressSnapshot.houseNumber)}</strong></div>` : ''}
      <div>${esc(order.deliveryAddressSnapshot.writtenAddress || '')}</div>
      ${order.deliveryAddressSnapshot.landmark ? `<div>Landmark: ${esc(order.deliveryAddressSnapshot.landmark)}</div>` : ''}
      <div>${esc([order.deliveryAddressSnapshot.areaName, order.deliveryAddressSnapshot.city].filter(Boolean).join(', '))}</div>
    </div>` : ''}
    ${order.slotName ? `
    <div class="section">
      <div class="section-title">Delivery Time Slot</div>
      <div>${esc(order.slotName)}</div>
    </div>` : ''}
    <div class="section">
      <div class="section-title">Items</div>
      <table class="items-table">
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
        <tbody>
          ${(order.items || []).map(item => {
            const unitSuffix = item.unit && item.unit !== 'full' ? ` (${esc(unitLabelShort(item.unit))})` : '';
            return `<tr><td>${esc(item.productName)}${unitSuffix}</td><td class="right">${Number(item.quantity)}</td><td class="right">Rs.${Number(item.unitPrice).toFixed(0)}</td><td class="right">Rs.${Number(item.totalPrice).toFixed(0)}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="total-section">
      <div class="total-row"><span>Subtotal</span><span>Rs.${Number(order.subtotal).toFixed(0)}</span></div>
      ${Number(order.discountAmount) > 0 ? `<div class="total-row"><span>Discount</span><span>-Rs.${Number(order.discountAmount).toFixed(0)}</span></div>` : ''}
      ${Number(order.couponDiscount) > 0 ? `<div class="total-row"><span>Coupon${order.couponCode ? ` (${esc(order.couponCode)})` : ''}</span><span>-Rs.${Number(order.couponDiscount).toFixed(0)}</span></div>` : ''}
      <div class="total-row"><span>Delivery</span><span>Rs.${Number(order.deliveryCharge).toFixed(0)}</span></div>
      <div class="total-row grand-total"><span>Total</span><span>Rs.${Number(order.totalAmount).toFixed(0)}</span></div>
    </div>
    <div class="section" style="margin-top:8px;">
      <div class="total-row"><span>Payment</span><span>${esc(order.paymentMethod === 'cash_on_delivery' ? 'Cash on Delivery' : order.paymentMethod)}</span></div>
      <div class="total-row"><span>Status</span><span>${esc(formatOrderStatus(order.status))}</span></div>
    </div>
    ${order.customerNotes ? `<div class="section"><div class="section-title">Customer Notes</div><div>${esc(order.customerNotes)}</div></div>` : ''}
    <div class="footer">
      <p>Thank you for shopping with FreshBazar!</p>
    </div>
  `;
}

export function printOrderSlips(orders: Order[]) {
  if (orders.length === 0) return;
  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) return;
  const slips = orders.map((o) => `<div class="slip-page">${buildOrderSlipHtml(o)}</div>`).join('');
  win.document.write(`
    <html><head><title>Order Slips</title>
    <style>${SLIP_PRINT_STYLES}</style></head><body>${slips}</body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
