// Print slip for the OCP portal — byte-for-byte the same layout as the admin
// order slip (admin-panel/src/pages/Orders.tsx), fed by the OCP order-detail
// shape. Customer phone is shown only when the admin revealed it.

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
`

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function unitLabelShort(unit?: string | null): string {
  switch (unit) {
    case 'half_kg': return '½ kg'
    case 'quarter_kg': return '¼ kg'
    case 'half_dozen': return '½ dozen'
    default: return ''
  }
}

export function formatOrderStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown'
  return status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '-'
  if (phone.startsWith('92')) return `+${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8)}`
  if (phone.startsWith('0')) return `+92 ${phone.slice(1, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`
  return phone
}

/** Build the slip HTML for one OCP order-detail object. */
export function buildOcpSlipHtml(o: any): string {
  const phoneLine = !o.phone_hidden && o.customer_phone
    ? `<div class="row"><span>${esc(formatPhoneNumber(o.customer_phone))}</span></div>`
    : `<div class="row"><span style="font-style:italic;color:#666;">Phone Number is Hidden</span></div>`

  const hasAddr = o.address || o.house_number || o.area_name || o.city
  const placed = o.placed_at || o.created_at

  return `
    <div class="header">
      <h1>FreshBazar</h1>
      <p>Fresh Grocery Delivery</p>
      <p style="font-weight:bold;font-size:13px;">Order: ${esc(o.order_number)}</p>
      <p>${esc(placed ? new Date(placed).toLocaleString('en-PK') : '')}</p>
    </div>
    <div class="section">
      <div class="section-title">Customer</div>
      <div class="row"><span>${esc(o.customer_name || 'Customer')}</span></div>
      ${phoneLine}
      ${!o.phone_hidden && o.customer_email ? `<div class="row"><span>${esc(o.customer_email)}</span></div>` : ''}
    </div>
    ${hasAddr ? `
    <div class="section">
      <div class="section-title">Delivery Address</div>
      ${o.house_number ? `<div><strong>House #: ${esc(o.house_number)}</strong></div>` : ''}
      <div>${esc(o.address || '')}</div>
      ${o.landmark ? `<div>Landmark: ${esc(o.landmark)}</div>` : ''}
      <div>${esc([o.area_name, o.city].filter(Boolean).join(', '))}</div>
    </div>` : ''}
    ${o.slot_name ? `
    <div class="section">
      <div class="section-title">Delivery Time Slot</div>
      <div>${esc(o.slot_name)}</div>
    </div>` : ''}
    <div class="section">
      <div class="section-title">Items</div>
      <table class="items-table">
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Total</th></tr></thead>
        <tbody>
          ${(o.items || []).map((item: any) => {
            const unitSuffix = item.unit && item.unit !== 'full' ? ` (${esc(unitLabelShort(item.unit))})` : ''
            const qLabel = item.quality && item.quality !== 'A' ? ` [Q${esc(item.quality)}]` : ''
            return `<tr><td>${esc(item.product_name)}${unitSuffix}${qLabel}</td><td class="right">${Number(item.quantity)}</td><td class="right">Rs.${Number(item.unit_price).toFixed(0)}</td><td class="right">Rs.${Number(item.total_price).toFixed(0)}</td></tr>`
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="total-section">
      <div class="total-row"><span>Subtotal</span><span>Rs.${Number(o.subtotal).toFixed(0)}</span></div>
      ${Number(o.discount_amount) > 0 ? `<div class="total-row"><span>Discount</span><span>-Rs.${Number(o.discount_amount).toFixed(0)}</span></div>` : ''}
      ${Number(o.coupon_discount) > 0 ? `<div class="total-row"><span>Coupon${o.coupon_code ? ` (${esc(o.coupon_code)})` : ''}</span><span>-Rs.${Number(o.coupon_discount).toFixed(0)}</span></div>` : ''}
      <div class="total-row"><span>Delivery</span><span>Rs.${Number(o.delivery_charge).toFixed(0)}</span></div>
      <div class="total-row grand-total"><span>Total</span><span>Rs.${Number(o.total_amount).toFixed(0)}</span></div>
    </div>
    <div class="section" style="margin-top:8px;">
      <div class="total-row"><span>Payment</span><span>${esc(o.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' : (o.payment_method || 'Cash on Delivery'))}</span></div>
      <div class="total-row"><span>Status</span><span>${esc(formatOrderStatus(o.status))}</span></div>
    </div>
    ${o.customer_notes ? `<div class="section"><div class="section-title">Customer Notes</div><div>${esc(o.customer_notes)}</div></div>` : ''}
    <div class="footer">
      <p>Thank you for shopping with FreshBazar!</p>
    </div>
  `
}

/** Open a print window with one OCP order slip (same window sizing as admin). */
export function printOcpSlip(o: any): void {
  const win = window.open('', '_blank', 'width=400,height=600')
  if (!win) return
  win.document.write(
    `<html><head><title>Order Slip</title><style>${SLIP_PRINT_STYLES}</style></head><body><div class="slip-page">${buildOcpSlipHtml(o)}</div></body></html>`
  )
  win.document.close()
  win.focus()
  win.print()
}
