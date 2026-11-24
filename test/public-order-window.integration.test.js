require('../test-support/authenticated-server.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('el servidor acepta hoy + 5 y rechaza hoy + 6 para clientes', async t => {
  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-25T12:00:00Z'])); }
  };
  t.after(() => { global.Date = RealDate; });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-window-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  process.env.DATA_DIR = dataDir;
  process.env.PORT = '0';
  const { server, startServer } = require('../server');
  await startServer();
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const submit = payload => fetch(base + '/api/public-orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer: 'Prueba', phone: '1140000000', detail: 'Pedido de prueba', ...payload })
  });
  for (const deliveryType of ['RETIRO', 'DELIVERY']) {
    const accepted = await submit({ deliveryType, address: 'Direccion de prueba', prepDate: '2026-11-30' });
    assert.equal(accepted.status, 201, await accepted.text());
    const rejected = await submit({ deliveryType, address: 'Direccion de prueba', prepDate: '2026-12-01' });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).maxDate, '2026-11-30');
  }
  const caba = await submit({ deliveryZone: 'CABA_VIERNES', prepDate: '2026-12-04' });
  assert.equal(caba.status, 400);
  assert.match((await caba.json()).error, /5 dias corridos/);
  await fetch(base + '/api/order-availability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: '2026-11-30', type: 'CLOSED' }) });
  const closed = await submit({ deliveryType: 'RETIRO', prepDate: '2026-11-30' });
  assert.equal(closed.status, 400);
});
