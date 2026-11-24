const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('la persona autenticada firma cada acción; el navegador no puede suplantarla', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authenticated-audit-'));
  Object.assign(process.env, { DATA_DIR: dir, PORT: '0', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', RRHH_DATABASE_URL: 'test', ADMINISTRATION_DATABASE_URL: 'test' });
  const ana = { id: 'rrhh-ana', name: 'Ana Prueba', email: 'ana@example.test' };
  const juan = { id: 'rrhh-juan', name: 'Juan Prueba', email: 'juan@example.test' };
  t.mock.method(require('../lib/rrhh-access'), 'authenticate', async (email, password) => {
    await new Promise(resolve => setTimeout(resolve, email === ana.email ? 10 : 1));
    return password === 'test-password' ? [ana, juan].find(user => user.email === email) || false : false;
  });
  fs.writeFileSync(path.join(dir, 'orders.json'), JSON.stringify([{ id: 'historico', number: 1, customer: 'Anterior', detail: 'Asado', createdBy: 'PC CAJA', updatedBy: 'PC MAYORISTA' }]));
  const { server, startServer } = require('../server');
  await startServer();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, method = 'GET', body, user = ana) => {
    const response = await fetch(base + url, { method, headers: {
      'Content-Type': 'application/json', ...(user ? { Authorization: 'Basic ' + Buffer.from(`${user.email}:test-password`).toString('base64') } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
  };
  assert.equal((await call('/api/me', 'GET', undefined, null)).status, 401);
  assert.deepEqual((await call('/api/me')).data, ana);
  assert.deepEqual((await call('/api/users')).data, [ana]);
  assert.equal((await call('/api/users', 'POST', { name: 'Usuario inventado' })).status, 410);
  const spoof = { currentUser: 'PC CAJA', user: 'Otra persona', createdBy: 'Admin', updatedBy: 'Superusuario', createdByUserId: 'falso', updatedByUserId: 'falso' };
  const draft = { customer: 'Prueba', detail: 'Asado', deliveryType: 'DELIVERY', ...spoof };
  const created = (await call('/api/orders', 'POST', draft)).data;
  assert.equal(created.createdBy, ana.name);
  assert.equal(created.updatedBy, ana.name);
  assert.equal(created.createdByUserId, ana.id);
  assert.equal(created.updatedByUserId, ana.id);
  const edited = (await call(`/api/orders/${created.id}`, 'PUT', { ...created, ...spoof, detail: 'Asado y pollo' }, juan)).data;
  assert.equal(edited.createdBy, ana.name);
  assert.equal(edited.createdByUserId, ana.id);
  assert.equal(edited.updatedBy, juan.name);
  assert.equal(edited.updatedByUserId, juan.id);
  assert.equal((await call('/api/orders/dispatch', 'POST', { orders: [{ id: edited.id, updatedAt: edited.updatedAt }], ...spoof }, juan)).status, 200);
  const historical = (await call('/api/orders/historico', 'PUT', { customer: 'Anterior', detail: 'Asado corregido' }, juan)).data;
  assert.equal(historical.createdBy, 'PC CAJA');
  assert.equal(historical.createdByUserId, null);
  assert.equal(historical.updatedByUserId, juan.id);
  const concurrent = await Promise.all([ana, juan].map(user => call('/api/orders', 'POST', draft, user)));
  assert.deepEqual(concurrent.map(result => result.data.createdByUserId), [ana.id, juan.id]);
  await call(`/api/orders/${created.id}`, 'DELETE', spoof, juan);
  const movements = (await call('/api/movements')).data.filter(item => item.orderId === created.id);
  assert.equal(movements.length, 4);
  const creation = movements.find(item => item.action === 'Pedido creado');
  assert.equal(creation.userId, ana.id);
  for (const item of movements.filter(item => item !== creation)) { assert.equal(item.user, juan.name); assert.equal(item.userId, juan.id); }
  const policy = (await call('/api/public-order-policy?deliveryType=RETIRO')).data;
  const publicOrder = await call('/api/public-orders', 'POST', { ...draft, deliveryType: 'RETIRO', phone: '1140000000', prepDate: policy.minDate }, ana);
  assert.equal(publicOrder.status, 201);
  const orders = (await call('/api/orders')).data;
  const publicStored = orders.find(order => order.number === publicOrder.data.number);
  assert.equal(publicStored.createdBy, 'Cliente');
  assert.equal(publicStored.createdByUserId, null);
  const publicMovement = (await call('/api/movements')).data.find(item => item.orderId === publicStored.id);
  assert.equal(publicMovement.user, 'Cliente');
  assert.equal(publicMovement.userId, null);
  const header = await call('/');
  assert.match(header.data, /currentUserLabel/);
  assert.doesNotMatch(header.data, /currentUserSelect|addUserBtn/);
});
