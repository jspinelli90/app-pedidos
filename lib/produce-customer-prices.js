const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const path = require('node:path');

const TITLE = 'Esenciales - Verdulería Mayorista y Minorista';
let pool;
const money = value => Number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
function positive(value) { return value != null && Number.isFinite(Number(value)) && Number(value) > 0; }
function offerLabel(item) {
  if (!positive(item.offerPrice) || !positive(item.offerQuantity ?? '1')) return '—';
  // PostgreSQL numeric columns may return the full declared decimal scale.
  const decimal = value => String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  const quantity = decimal(item.offerQuantity ?? '1'), price = decimal(item.offerPrice);
  if (!/^\d+(\.\d{1,3})?$/.test(quantity) || !/^\d+(\.\d{1,2})?$/.test(price)) return '—';
  const scaled = (value, places) => { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 10n ** BigInt(places) + BigInt(fraction.padEnd(places, '0')); };
  const totalCents = (scaled(price, 2) * scaled(quantity, 3) + 500n) / 1000n;
  const unit = item.unit === 'KG' ? 'kg' : Number(quantity) === 1 ? 'unidad' : 'unidades';
  return `${Number(quantity).toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${unit} por ${money(Number(totalCents) / 100)}\n(${money(item.offerPrice)} por ${item.unit === 'KG' ? 'kg' : 'unidad'})`;
}
function customerRows(items) {
  // Rebuild an explicit public projection. Never forward database rows or costs.
  return items.filter(item => ['KG', 'UNIT'].includes(item.unit) && (positive(item.salePrice) || (positive(item.packagePrice) && ['Bolsa', 'Cajón'].includes(item.packageType))))
    .map(item => ({ article: `${item.name} · por ${item.unit === 'KG' ? 'kg' : 'unidad'}`,
      retail: positive(item.salePrice) ? money(item.salePrice) : '—',
      offer: offerLabel(item),
      wholesale: positive(item.packagePrice) && ['Bolsa', 'Cajón'].includes(item.packageType) ? `${item.packageType}\n${money(item.packagePrice)}` : '—',
    })).sort((a, b) => a.article.localeCompare(b.article, 'es'));
}
async function read(query) {
  if (!query) {
    if (!process.env.ADMINISTRATION_DATABASE_URL) throw Error('Lista temporalmente no disponible.');
    pool ??= new Pool({ connectionString: process.env.ADMINISTRATION_DATABASE_URL, max: 3, connectionTimeoutMillis: 7000, statement_timeout: 7000, idleTimeoutMillis: 30000 });
    query = sql => pool.query(sql);
  }
  const result = await query('SELECT name, unit, "salePrice", "offerPrice", "offerQuantity", "packageType", "packagePrice" FROM "EssentialsProduceItem" ORDER BY name, unit');
  return customerRows(result.rows);
}
async function pdf(rows, now = new Date()) {
  const doc = new PDFDocument({ size: 'A4', margin: 32, bufferPages: true, info: { Title: TITLE, Author: 'San Cayetano Carnes' } });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const widths = [185, 100, 146, 100], margin = 32, tableWidth = 531;
  const issued = now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
  function heading() {
    doc.rect(0, 0, doc.page.width, 102).fill('#080808');
    doc.image(path.join(__dirname, '../public/san-cayetano-logo-blanco.png'), margin, 14, { fit: [65, 63] });
    doc.fillColor('white').font('Helvetica-Bold').fontSize(17).text(TITLE, 114, 18, { width: 440 });
    doc.font('Helvetica').fontSize(10).text(`Emitido: ${issued}`, 114, 76, { width: 440 });
    doc.rect(0, 102, doc.page.width, 3).fill('#b21f24');
    doc.rect(margin, 122, tableWidth, 30).fill('#e8eeeb');
    let x = margin;
    for (const [index, label] of ['Artículo', 'Precio minorista', 'Oferta', 'Precio por bulto'].entries()) {
      doc.fillColor('#173c35').font('Helvetica-Bold').fontSize(10).text(label, x + 7, 132, { width: widths[index] - 14, align: index ? 'right' : 'left' }); x += widths[index];
    }
    return 152;
  }
  let y = heading();
  for (const [index, row] of rows.entries()) {
    const cells = [row.article, row.retail, row.offer, row.wholesale];
    doc.font('Helvetica').fontSize(10);
    const height = Math.max(36, ...cells.map((text, column) => doc.heightOfString(text, { width: widths[column] - 14 }) + 18));
    if (y + height > 724) { doc.addPage(); y = heading(); }
    if (index % 2 === 0) doc.rect(margin, y, tableWidth, height).fill('#f4f7f5');
    let x = margin;
    cells.forEach((text, column) => { doc.fillColor('#172b25').font(column ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(text, x + 7, y + 9, { width: widths[column] - 14, align: column ? 'right' : 'left' }); x += widths[column]; });
    y += height;
  }
  if (!rows.length) doc.font('Helvetica').fontSize(11).text('Todavía no hay precios de venta publicados.', margin, y + 14, { width: tableWidth });
  const range = doc.bufferedPageRange();
  for (let page = 0; page < range.count; page++) {
    doc.switchToPage(page);
    doc.fillColor('#4b6159').font('Helvetica').fontSize(9).text('Precios en pesos, válidos solo en la fecha de emisión. Sujetos a cambios diarios.', margin, 744, { width: tableWidth });
    doc.fontSize(8).text(`San Cayetano Carnes | ${page + 1} / ${range.count}`, margin, 784, { width: tableWidth, align: 'center', lineBreak: false });
  }
  doc.end();
  return complete;
}
module.exports = { TITLE, customerRows, read, pdf };
