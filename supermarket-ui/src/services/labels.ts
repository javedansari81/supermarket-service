/**
 * Barcode label printing (shelf labels and Legal Metrology labels for in-store packed goods)
 */

export interface LabelData {
  store_name: string; product_no: string; product_name: string; barcode: string; mrp: string; barcode_image: string;
}

export interface PackedLabelData {
  store_name: string; store_address: string; store_phone: string; store_email: string; fssai_license: string;
  product_name: string; barcode: string; barcode_image: string; net_quantity: string; mrp: string;
  unit_sale_price?: string | null; packed_date: string; best_before_date?: string | null;
}

export const LABEL_SIZE = { w: 50.8, h: 25.4, font: 7, label: '2x1 inch (50.8x25.4mm)' };

export const PRINT_HINT = `Select the label printer, paper ${LABEL_SIZE.w}x${LABEL_SIZE.h}mm, margins None, scale 100%`;

export const printHtml = (html: string) => {
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
  }, 300);
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const buildPackedLabelsHtml = (labels: PackedLabelData[]) => {
  const { w, h } = LABEL_SIZE;
  const s = Math.min(w / 50, h / 38);
  const pt = (n: number) => `${(n * s).toFixed(2)}pt`;
  const e = (s?: string | null) => escapeHtml(s || '');
  const body = labels.map((l) => `<div class="label">
    <div class="name">${e(l.product_name)}</div>
    <div class="row big"><span>Net Qty: ${e(l.net_quantity)}</span><span>MRP ${e(l.mrp)}</span></div>
    <div class="row"><span>Pkd: ${e(l.packed_date)}</span>${l.best_before_date ? `<span>Best before: ${e(l.best_before_date)}</span>` : ''}</div>
    <img src="data:image/png;base64,${l.barcode_image}" /><div class="code">${e(l.barcode)}</div>
  </div>`).join('');
  return `<!DOCTYPE html><html><head><title>Packed Labels</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 2mm 2.5mm; overflow: hidden; justify-content: center;
      page-break-after: always; break-after: page; display: flex; flex-direction: column; font-size: ${pt(6.5)}; line-height: 1.15; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .label > div { flex: none; white-space: nowrap; overflow: hidden; }
    .name { font-weight: bold; font-size: ${pt(9)}; text-overflow: ellipsis; }
    .row { display: flex; justify-content: space-between; gap: 1mm; }
    .big { font-weight: bold; font-size: ${pt(9)}; }
    img { flex: 0 1 auto; height: ${(h * 0.38).toFixed(1)}mm; min-height: 0; width: 90%; align-self: center; margin-top: 0.5mm; image-rendering: pixelated; }
    .code { text-align: center; letter-spacing: 1px; font-size: ${pt(8)}; }
  </style></head><body>${body}</body></html>`;
};

export const buildLabelsHtml = (labels: LabelData[]) => {
  const { w, h, font } = LABEL_SIZE;
  const body = labels.map((l) => `<div class="label">
      <div class="name">${escapeHtml(l.product_name)}</div>
      <img src="data:image/png;base64,${l.barcode_image}" />
      <div class="code">${escapeHtml(l.barcode)}</div>
      <div class="price">MRP ${escapeHtml(l.mrp)}</div>
    </div>`).join('');
  return `<!DOCTYPE html><html><head><title>Labels</title><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; }
    .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 2mm 2.5mm; display: flex; flex-direction: column;
      align-items: center; justify-content: center; overflow: hidden; page-break-after: always; break-after: page; font-size: ${font}pt; line-height: 1.15; }
    .label:last-child { page-break-after: auto; break-after: auto; }
    .label > div { flex: none; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .name { font-weight: bold; }
    img { flex: 0 1 auto; height: ${(h * 0.38).toFixed(1)}mm; min-height: 0; width: 90%; margin: 0.5mm 0; image-rendering: pixelated; }
    .code { letter-spacing: 1px; }
    .price { font-weight: bold; font-size: ${font + 1}pt; }
  </style></head><body>${body}</body></html>`;
};
