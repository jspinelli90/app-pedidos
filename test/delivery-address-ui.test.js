const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '../public');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('el formulario conserva el pedido ante dirección incorrecta e informa revisión pendiente al recibirlo', async t => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'cliente.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://example.test/cliente.html' });
  t.after(() => dom.window.close());
  const w = dom.window, el = id => w.document.getElementById(id);
  w.HTMLElement.prototype.scrollIntoView = function () {};
  let reject = true, submitted;
  w.fetch = async (url, options) => {
    if (url === '/api/public-orders') {
      submitted = JSON.parse(options.body);
      return { ok: !reject, status: reject ? 422 : 201, text: async () => JSON.stringify(reject ? { error: 'La dirección corresponde a CABA.' } : { number: 123, addressValidation: { status: 'review' } }) };
    }
    return { ok: true, json: async () => url.startsWith('/api/public-order-policy')
      ? { minDate: '2026-11-25', maxDate: '2026-11-30', today: '2026-11-25', deliveryType: 'DELIVERY', deliveryZone: 'REGULAR' }
      : url === '/api/public-client-documents' ? { 'price-list': [], offers: [] } : {} };
  };
  w.eval(fs.readFileSync(path.join(root, 'cliente.js'), 'utf8')); await tick();
  el('clientCustomer').value = 'Prueba'; el('clientPhone').value = '1155551234';
  el('clientCustomer').dispatchEvent(new w.Event('input'));
  el('clientDeliveryType').value = 'DELIVERY'; el('clientDeliveryType').dispatchEvent(new w.Event('change')); await tick();
  el('clientAddress').value = 'Cabildo 3200'; el('clientDistrict').value = 'Vicente Lopez';
  el('clientDistrict').dispatchEvent(new w.Event('change')); el('clientLocality').value = 'Olivos'; el('clientDetail').value = 'Dos kilos de asado';
  el('clientOrderForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); await tick();
  assert.match(el('clientMessage').textContent, /CABA/);
  assert.equal(el('clientDetail').value, 'Dos kilos de asado'); assert.equal(el('clientAddress').value, 'Cabildo 3200');
  assert.equal(submitted.streetAddress, 'Cabildo 3200'); assert.equal(submitted.district, 'Vicente Lopez'); assert.equal(submitted.locality, 'Olivos');
  assert.equal(el('clientSubmitButton').disabled, false);
  reject = false;
  el('clientOrderForm').dispatchEvent(new w.Event('submit', { cancelable: true })); await tick(); await tick();
  assert.equal(el('clientSuccess').hidden, false); assert.match(el('clientSuccess').textContent, /Dirección pendiente de revisión/); assert.match(el('clientSuccess').textContent, /#123/);
});

test('el panel impide avanzar y la revisión exige una acción expresa del operador', async t => {
  const dom = new JSDOM('', { runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const functions = ['nextStatusButton', 'reviewDeliveryAddress'].map(name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(source.slice(start - 6, start) === 'async ' ? start - 6 : start, source.indexOf('\n}', start) + 2);
  }).join('\n');
  const w = dom.window; let called = 0;
  w.confirm = () => false; w.api = async () => { called++; }; w.loadOrders = w.loadMovements = async () => {};
  w.orderOrigin = () => 'cliente'; w.whatsappPhone = () => '123';
  w.eval(functions);
  const pending = { id: '1', number: 1, address: 'Cabildo 3200', deliveryType: 'DELIVERY', status: 'Provisorio', addressValidation: { status: 'review' } };
  assert.match(w.nextStatusButton(pending), /disabled/);
  await w.reviewDeliveryAddress(pending); assert.equal(called, 0);
  w.confirm = () => true; await w.reviewDeliveryAddress(pending); assert.equal(called, 1);
  assert.doesNotMatch(w.nextStatusButton({ ...pending, addressValidation: { status: 'manual' } }), /disabled/);
});

test('el ticket advierte que no se prepare un pedido con dirección pendiente', t => {
  const dom = new JSDOM('', { runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window;
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const start = source.indexOf('function printTicket(');
  w.eval(source.slice(start, source.indexOf('\n}', start) + 2));
  let printed = '';
  w.open = () => ({ document: { write: html => { printed = html; }, close() {} } });
  for (const name of ['orderSaleType', 'escapeHtml', 'orderDeliveryLabel', 'orderPriority', 'formatDate', 'orderPrepDate', 'orderRouteVehicle', 'dateTime', 'orderTicketDetail', 'orderDetail']) w[name] = () => 'Prueba';
  w.orderScheduledTime = () => '';
  w.printTicket({ number: 1, deliveryType: 'DELIVERY', addressValidation: { status: 'review' } });
  assert.match(printed, /No preparar ni despachar/);
});
