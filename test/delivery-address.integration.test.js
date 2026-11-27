require('../test-support/authenticated-server.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('Zona Norte recibe y procesa pedidos sin consultar ni bloquear por Georef', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'address-rollback-'));
  process.env.DATA_DIR = dir; process.env.PORT = '0'; process.env.SUPABASE_URL = ''; process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const address = require('../lib/delivery-address');
  const check = t.mock.method(address, 'checkDeliveryAddress', async () => { throw Error('No debe consultar el proveedor'); });
  const { server, startServer } = require('../server'); await startServer();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, method = 'GET', body) => { const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, data: await res.json() }; };
  const policy = (await call('/api/public-order-policy?deliveryType=DELIVERY')).data;
  const payload = { customer: 'Prueba', phone: '1155551234', detail: 'Asado', deliveryType: 'DELIVERY', streetAddress: 'Calle de barrio 123', district: 'Tigre', locality: 'Benavidez', prepDate: policy.minDate, addressValidation: { status: 'verified' } };
  const submitted = await call('/api/public-orders', 'POST', payload);
  assert.equal(submitted.status, 201); assert.equal(submitted.data.addressValidation, undefined);
  let order = (await call('/api/orders')).data[0];
  assert.equal(order.address, 'Calle de barrio 123 - Benavidez - Tigre');
  assert.equal(order.addressValidation, undefined);
  const endpoint = `/api/orders/${order.id}`;
  for (const status of ['Nuevo', 'Preparado', 'Despachado']) {
    const result = await call(endpoint, 'PUT', { ...order, status });
    assert.equal(result.status, 200); assert.equal(result.data.status, status); order=result.data;
  }
  assert.equal(check.mock.callCount(), 0);
  assert.equal(address.enabled, false);
  assert.equal(address.requiresReview({deliveryType:'DELIVERY',addressValidation:{status:'review'}}), false);
  const incomplete = await call('/api/public-orders', 'POST', { ...payload, streetAddress: '', district: '', locality: '', address: '' });
  assert.equal(incomplete.status, 400);
});
