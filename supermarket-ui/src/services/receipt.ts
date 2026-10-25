/**
 * 80mm thermal GST tax invoice receipt and shift X / Z report (browser print)
 */
import api from './api';
import { API_ENDPOINTS } from '../config/api';
import { ShiftReport } from '../types';

export interface ReceiptItem {
  product_name: string;
  hsn_code: string;
  unit_type: string;
  mrp: number | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  discount_source?: string | null;
  offer_name?: string | null;
  taxable_value: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
}

export interface HsnSummaryRow {
  hsn_code: string;
  tax_percent: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  tax_amount: number;
}

export interface InvoicePrintData {
  invoice_id: number;
  store_name: string;
  store_address?: string;
  store_phone?: string;
  store_gstin?: string;
  store_state?: string;
  store_state_code?: string;
  store_fssai?: string;
  invoice_no: string;
  invoice_date: string;
  sale_no?: string;
  cashier_name?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_gstin?: string;
  place_of_supply?: string;
  is_interstate: boolean;
  items: ReceiptItem[];
  hsn_summary: HsnSummaryRow[];
  subtotal: number;
  tax_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  discount_amount: number;
  total_amount: number;
  mrp_savings: number;
  coupon_code?: string | null;
  tax_inclusive: boolean;
  payment_mode: string;
  payments: { mode: string; amount: number; reference?: string | null }[];
  cash_tendered?: number | null;
  change_given?: number | null;
  points_earned?: number;
  points_redeemed?: number;
  points_balance?: number | null;
  footer_text?: string;
  is_duplicate: boolean;
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => Number(n || 0).toFixed(2);
const qty = (i: ReceiptItem) =>
  Number.isInteger(i.quantity) ? `${i.quantity}` : `${Number(i.quantity.toFixed(3))}${i.unit_type ? ' ' + i.unit_type : ''}`;
const row = (label: string, value: string, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="r">${value}</td></tr>`;
const discountLabel = (i: ReceiptItem, couponCode?: string | null) => i.discount_source === 'clearance' ? 'Near-expiry discount'
  : i.discount_source === 'offer' ? esc(i.offer_name || 'Offer')
  : i.discount_source === 'coupon' ? `Coupon ${esc(couponCode || '')}`.trim() : 'Discount';

export const buildReceiptHtml = (d: InvoicePrintData): string => {
  const date = new Date(d.invoice_date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const items = d.items.map((i) => `
    <tr><td colspan="4" class="b">${esc(i.product_name)}</td></tr>
    <tr class="sub"><td>${i.hsn_code ? 'HSN ' + esc(i.hsn_code) : ''} ${i.tax_percent}%</td>
      <td class="r">${esc(qty(i))}</td><td class="r">${money(i.unit_price)}</td><td class="r">${money(i.line_total)}</td></tr>
    ${i.discount_amount > 0 ? `<tr class="sub"><td colspan="3">${discountLabel(i, d.coupon_code)}</td><td class="r">-${money(i.discount_amount)}</td></tr>` : ''}`).join('');
  const payments = d.payments.length > 1
    ? row('Paid by', 'SPLIT') + d.payments.map((p) =>
      row(`&nbsp;&nbsp;${esc(p.mode.toUpperCase())}${p.reference ? ' ' + esc(p.reference) : ''}`, money(p.amount))).join('')
    : row('Paid by', esc((d.payments[0]?.mode || d.payment_mode).toUpperCase())
      + (d.payments[0]?.reference ? ' ' + esc(d.payments[0].reference) : ''));
  const cash = d.cash_tendered != null
    ? row('Cash received', money(d.cash_tendered)) + row('Change', money(d.change_given || 0)) : '';
  const points = (d.points_redeemed ? row('Points redeemed', `${d.points_redeemed}`) : '')
    + (d.points_earned ? row('Points earned', `${d.points_earned}`) : '')
    + (d.points_balance != null ? row('Points balance', `${d.points_balance}`) : '');
  const hsnHead = d.is_interstate
    ? '<th>HSN</th><th class="r">GST%</th><th class="r">Taxable</th><th class="r">IGST</th>'
    : '<th>HSN</th><th class="r">GST%</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th>';
  const hsnRows = d.hsn_summary.map((h) => d.is_interstate
    ? `<tr><td>${esc(h.hsn_code || '-')}</td><td class="r">${h.tax_percent}</td><td class="r">${money(h.taxable_value)}</td><td class="r">${money(h.igst_amount)}</td></tr>`
    : `<tr><td>${esc(h.hsn_code || '-')}</td><td class="r">${h.tax_percent}</td><td class="r">${money(h.taxable_value)}</td><td class="r">${money(h.cgst_amount)}</td><td class="r">${money(h.sgst_amount)}</td></tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(d.invoice_no)}</title><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 80mm; margin: 0; padding: 2mm 2.5mm 2mm 3.5mm; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    h1 { font-size: 15px; margin: 0; } h2 { font-size: 12px; margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; } th { text-align: left; border-bottom: 1px dashed #000; font-size: 10px; }
    .sub td { font-size: 10px; padding-bottom: 2px; } hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
    .total td { font-size: 14px; font-weight: bold; } .small { font-size: 10px; }
  </style></head><body>
    <div class="c">
      <h1>${esc(d.store_name)}</h1>
      ${d.store_address ? `<div class="small">${esc(d.store_address)}</div>` : ''}
      ${d.store_phone ? `<div class="small">Ph: ${esc(d.store_phone)}</div>` : ''}
      ${d.store_gstin ? `<div class="b">GSTIN: ${esc(d.store_gstin)}</div>` : ''}
      ${d.store_state ? `<div class="small">State: ${esc(d.store_state)}${d.store_state_code ? ' (' + esc(d.store_state_code) + ')' : ''}</div>` : ''}
      ${d.store_fssai ? `<div class="small">FSSAI Lic. No: ${esc(d.store_fssai)}</div>` : ''}
      <h2>TAX INVOICE${d.is_duplicate ? ' (DUPLICATE)' : ''}</h2>
    </div>
    <table class="small">
      ${row('Invoice No', esc(d.invoice_no))}${row('Date', esc(date))}
      ${d.cashier_name ? row('Cashier', esc(d.cashier_name)) : ''}
      ${d.place_of_supply ? row('Place of Supply', esc(d.place_of_supply)) : ''}
      ${d.customer_name ? row('Customer', esc(d.customer_name)) : ''}
      ${d.customer_phone ? row('Phone', esc(d.customer_phone)) : ''}
      ${d.customer_gstin ? row('Cust. GSTIN', esc(d.customer_gstin)) : ''}
    </table>
    <hr><table>
      <tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amt</th></tr>
      ${items}
    </table><hr>
    <table>
      ${row(`Items: ${d.items.length}`, '')}
      ${row('Taxable Value', money(d.subtotal - d.discount_amount))}
      ${d.is_interstate ? row('IGST', money(d.igst_amount)) : row('CGST', money(d.cgst_amount)) + row('SGST', money(d.sgst_amount))}
      ${d.discount_amount > 0 ? row('Discount', money(d.discount_amount)) : ''}
      ${d.coupon_code ? row('Coupon', esc(d.coupon_code)) : ''}
    </table><hr>
    <table>${row('TOTAL', '&#8377;' + money(d.total_amount), 'total')}${payments}${cash}</table>
    ${points ? `<hr><table class="small">${points}</table>` : ''}
    ${d.mrp_savings > 0 ? `<div class="c b">You saved &#8377;${money(d.mrp_savings)} on MRP</div>` : ''}
    <hr><div class="small b">GST Summary</div>
    <table class="small"><tr>${hsnHead}</tr>${hsnRows}</table>
    ${d.tax_inclusive ? '<div class="small c">Prices are inclusive of GST</div>' : ''}
    <hr><div class="c">${esc(d.footer_text || 'Thank you for shopping!')}</div>
  </body></html>`;
};

export const fetchInvoicePrintData = async (invoiceId: number, markPrinted = false): Promise<InvoicePrintData> =>
  (await api.get<InvoicePrintData>(`${API_ENDPOINTS.INVOICES}/${invoiceId}/print`, { params: { mark_printed: markPrinted } })).data;

const printHtml = (html: string) => {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 1000);
  }, 250);
};

export const printReceipt = async (invoiceId: number): Promise<void> => {
  printHtml(buildReceiptHtml(await fetchInvoicePrintData(invoiceId, true)));
};

// Server datetimes are naive UTC
const istDateTime = (v?: string | null) => v
  ? new Date(v.endsWith('Z') ? v : `${v}Z`).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '';

export const buildShiftReportHtml = (r: ShiftReport): string => {
  const c = r.cash;
  const signed = (n: number) => `${Number(n) > 0 ? '+' : ''}${money(Number(n))}`;
  const modes = r.modes.map((m) => row(esc(m.mode.toUpperCase()),
    `${money(Number(m.collected))} / -${money(Number(m.refunded) + Number(m.voided))} / ${money(Number(m.net))}`)).join('');
  const cashiers = r.cashiers.map((x) => row(`${esc(x.name)} (${x.bills})`, money(Number(x.amount)))).join('');
  const movements = r.movements.map((m) => row(`${m.movement_type === 'in' ? 'IN' : 'OUT'} ${esc(m.reason)}`,
    `${m.movement_type === 'in' ? '' : '-'}${money(Number(m.amount))}`)).join('');
  const notes = r.denominations.map((d) => row(`&#8377;${d.value} x ${d.count}`, money(Number(d.amount)))).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(r.shift_no)}</title><style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 80mm; margin: 0; padding: 2mm 2.5mm 2mm 3.5mm; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
    .c { text-align: center; } .r { text-align: right; } .b { font-weight: bold; }
    h2 { font-size: 13px; margin: 2px 0; } table { width: 100%; border-collapse: collapse; }
    hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; } .total td { font-size: 13px; font-weight: bold; }
  </style></head><body>
    <div class="c"><h2>${r.report_type === 'Z' ? 'Z REPORT (SHIFT CLOSE)' : 'X REPORT (INTERIM)'}</h2></div>
    <table>
      ${row('Shift', esc(r.shift_no))}
      ${row('Opened', `${esc(istDateTime(r.opened_at))}`)}${row('&nbsp;&nbsp;by', esc(r.opened_by_name || ''))}
      ${r.closed_at ? row('Closed', esc(istDateTime(r.closed_at))) + row('&nbsp;&nbsp;by', esc(r.closed_by_name || '')) : ''}
      ${row('Printed', esc(istDateTime(new Date().toISOString())))}
    </table><hr>
    <table>
      ${row('Opening float', money(Number(c.opening_float)))}
      ${row('Cash on bills', `+${money(Number(c.cash_sales))}`)}
      ${row('Cash refunds', `-${money(Number(c.cash_refunds))}`)}
      ${row('Voided bills cash', `-${money(Number(c.cash_voids))}`)}
      ${row('Cash in', `+${money(Number(c.cash_in))}`)}
      ${row('Cash out', `-${money(Number(c.cash_out))}`)}
      ${row('EXPECTED CASH', money(Number(c.expected_cash)), 'total')}
      ${r.counted_cash != null ? row('COUNTED CASH', money(Number(r.counted_cash)), 'total')
        + row('DIFFERENCE', signed(Number(r.difference)), 'total') : ''}
    </table>
    ${r.approval_status ? `<div class="c b">${r.approval_status === 'pending' ? 'DIFFERENCE AWAITS APPROVAL' : `Approved by ${esc(r.approved_by_name || '')}`}</div>` : ''}
    ${notes ? `<hr><div class="b">Cash counted</div><table>${notes}</table>` : ''}
    ${modes ? `<hr><div class="b">By mode: collected / refunded+voided / net</div><table>${modes}</table>` : ''}
    <hr><table>${row('Bills', `${r.bill_count}`)}${row('Voided bills', `${r.void_count}`)}${row('Returns', `${r.return_count}`)}</table>
    ${cashiers ? `<hr><div class="b">By cashier (bills)</div><table>${cashiers}</table>` : ''}
    ${movements ? `<hr><div class="b">Cash in / out</div><table>${movements}</table>` : ''}
    ${r.close_note ? `<hr><div>Note: ${esc(r.close_note)}</div>` : ''}
    ${r.report_type === 'Z' ? '<hr><br><table>' + row('Cashier sign', '__________') + '<tr><td>&nbsp;</td></tr>' + row('Supervisor sign', '__________') + '</table>' : ''}
  </body></html>`;
};

export const printShiftReport = (report: ShiftReport): void => printHtml(buildShiftReportHtml(report));
