const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

function setup(t) {
  const dom = new JSDOM(fs.readFileSync(require.resolve('../public/index.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://example.test/' });
  t.after(() => dom.window.close());
  const w = dom.window;
  for (const file of ['order-category', 'retail-cart-model', 'order-ticket', 'order-cut-totals']) w.eval(fs.readFileSync(require.resolve('../public/' + file), 'utf8'));
  const source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  w.eval(source.slice(0, source.indexOf('els.form.addEventListener("submit"')) + ';window.testState=state;');
  const el = id => w.document.getElementById(id);
  const orders = [
    { id: 'a', number: 1, customer: 'Uno', detail: '2kg asado', prepDate: '2026-11-24', status: 'Nuevo', saleType: 'Mayorista' },
    { id: 'b', number: 2, customer: 'Dos', detail: '1,5kg asado', prepDate: '2026-11-25', status: 'Nuevo', saleType: 'Minorista' },
    { id: 'c', number: 3, customer: 'Tres', detail: '2 piezas de nalga', prepDate: '2026-11-26', status: 'Provisorio', saleType: 'Minorista' },
    { id: 'd', number: 4, customer: 'Fuera', detail: '100kg asado', prepDate: '2026-11-27', status: 'Nuevo', saleType: 'Mayorista' }
  ];
  w.testState.orders = orders;
  el('prepDateFilter').value = '2026-11-24'; el('prepDateToFilter').value = '2026-11-26';
  el('cutTotalsDialog').showModal = () => { el('cutTotalsDialog').open = true; };
  el('cutTotalsDialog').close = () => { el('cutTotalsDialog').open = false; };
  return { w, el, orders };
}

test('el rango incluye ambos extremos y el resumen respeta los filtros, muestra fechas y permite varias páginas', t => {
  const { w, el } = setup(t); let printed = '';
  w.open = () => ({ document: { write: text => { printed = text; }, close() {} } });
  assert.equal(w.summaryOrdersForPrint().length, 3);
  w.printDailySummary(); let doc = new JSDOM(printed); t.after(() => doc.window.close());
  assert.equal(doc.window.document.querySelectorAll('tbody tr').length, 3);
  assert.match(printed, /24\/11\/2026 al 26\/11\/2026/); assert.doesNotMatch(printed, /maxHeight|scale\(/); assert.doesNotMatch(printed, /Fuera/);
  el('statusFilter').value = 'Nuevo'; el('saleTypeFilter').value = 'Minorista';
  w.printDailySummary(); const filtered = new JSDOM(printed); t.after(() => filtered.window.close());
  assert.equal(filtered.window.document.querySelectorAll('tbody tr').length, 1); assert.match(printed, /Dos/);
  el('search').value = 'no existe'; assert.equal(w.summaryOrdersForPrint().length, 0);
});
test('un día sin Hasta funciona y un rango invertido no imprime ni totaliza', t => {
  const { w, el } = setup(t); let opened = 0, message = '';
  w.open = () => { opened++; return { document: { write() {}, close() {} } }; }; w.alert = text => { message = text; };
  el('prepDateToFilter').value = ''; assert.equal(w.summaryOrdersForPrint().length, 1); w.printDailySummary(); assert.equal(opened, 1);
  el('prepDateToFilter').value = '2026-11-23'; w.printDailySummary(); w.showCutTotals(); assert.equal(opened, 1); assert.match(message, /posterior/);
  el('prepDateFilter').value = ''; el('prepDateToFilter').value = ''; w.showCutTotals(); assert.match(message, /Desde/);
});
test('los totales se muestran con aportes auditables, pendientes y opción de imprimir o revisar el pedido', t => {
  const { w, el } = setup(t); let printed = '', scrolled = false;
  w.showCutTotals(); assert.equal(el('cutTotalsDialog').open, true);
  assert.match(el('cutTotalsContent').textContent, /3,5 kg identificados/);
  assert.equal(el('cutTotalsContent').querySelectorAll('[data-cut-row]').length, 1);
  assert.equal(el('cutTotalsContent').querySelectorAll('[data-pending-cut]').length, 1);
  assert.match(el('cutTotalsContent').textContent, /Total parcial/); assert.match(el('cutTotalsContent').textContent, /#1/); assert.match(el('cutTotalsContent').textContent, /#2/);
  w.open = () => ({ document: { write: text => { printed = text; }, close() {} } }); w.printCutTotals();
  assert.match(printed, /3,5 kg identificados/); assert.match(printed, /2 piezas de nalga/); assert.doesNotMatch(printed, /class="ghost review-cut-order"/);
  el('orderForm').scrollIntoView = () => { scrolled = true; };
  el('cutTotalsContent').querySelector('.review-cut-order').click();
  assert.equal(el('cutTotalsDialog').open, false); assert.equal(el('detail').value, '2 piezas de nalga'); assert.equal(scrolled, true);
});
test('escapa nombres y textos antes de mostrarlos o imprimirlos', t => {
  const { w, el, orders } = setup(t);
  orders[0].customer = '<img src=x onerror=alert(1)>';
  orders[2].detail = '<script>alert(1)</script>';
  w.showCutTotals();
  assert.equal(el('cutTotalsContent').querySelectorAll('img,script').length, 0);
  assert.match(el('cutTotalsContent').textContent, /<script>/);
});
