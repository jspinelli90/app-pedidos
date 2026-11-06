const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('confirma el grupo visible, evita doble envío y recupera errores', async t => {
  const dom = new JSDOM(fs.readFileSync(require.resolve('../public/index.html'), 'utf8'), { runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, source = fs.readFileSync(require.resolve('../public/app.js'), 'utf8');
  let requests = [], accept = false, release, fail = false, reloads = 0;
  w.confirm = message => { assert.match(message, /2 pedidos visibles/); return accept; };
  w.api = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); if (fail) throw Error('Conexión interrumpida'); await new Promise(resolve => { release = resolve; }); return { dispatched: 2 }; };
  w.loadOrders = async () => { reloads++; }; w.loadMovements = async () => {};
  w.eval(`const state = {}; const els = { dispatchVisibleMessage: document.getElementById('dispatchVisibleMessage') };
    function deliveryOrders() { return [{id:'a',updatedAt:'v1'},{id:'b',updatedAt:'v2'}]; }
    function withAudit(value) { return {...value,currentUser:'PC JUAN'}; }
    function renderDelivery() {}
    ${source.slice(source.indexOf('async function dispatchVisibleOrders()'), source.indexOf('async function markDispatched('))}
    window.dispatchVisibleOrders = dispatchVisibleOrders;`);
  await w.dispatchVisibleOrders(); assert.equal(requests.length, 0);
  accept = true;
  const first = w.dispatchVisibleOrders(); await w.dispatchVisibleOrders();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/orders/dispatch');
  assert.deepEqual(requests[0].body.orders, [{ id:'a',updatedAt:'v1' },{ id:'b',updatedAt:'v2' }]);
  release(); await first;
  assert.match(w.document.getElementById('dispatchVisibleMessage').textContent, /2 pedidos marcados/);
  fail = true; await w.dispatchVisibleOrders();
  assert.match(w.document.getElementById('dispatchVisibleMessage').textContent, /Conexión interrumpida/);
  assert.equal(reloads, 2);
});
