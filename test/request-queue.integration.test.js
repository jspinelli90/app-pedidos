const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

test('catalog reads bypass a stalled upload, queued bodies survive, and disconnects release the lock', { timeout: 10000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pedidos-queue-'));
  Object.assign(process.env, { DATA_DIR: dir, PORT: '0', SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
  const { server, startServer } = require('../server'); await startServer();
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const observed = tag => new Promise(resolve => { const listener = req => { if (req.headers['x-test'] === tag) { server.removeListener('request', listener); resolve(); } }; server.on('request', listener); });
  const hold = async tag => {
    const started = observed(tag);
    let done;
    const finished = new Promise(resolve => { done = resolve; });
    const req = http.request(`${base}/api/retail-offers`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test': tag } }, res => { res.resume(); res.on('end', () => done(res.statusCode)); });
    req.on('error', () => done('disconnected')); req.write('{'); await started;
    return { req, finished };
  };
  const first = await hold('first');
  const catalog = await fetch(`${base}/api/public-retail-catalog`, { signal: AbortSignal.timeout(1500) });
  assert.equal(catalog.status, 200); await catalog.json();
  const offers = await (await fetch(`${base}/api/retail-offers`, { signal: AbortSignal.timeout(1500) })).json();
  const secondStarted = observed('queued');
  const queued = fetch(`${base}/api/retail-offers`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test': 'queued' }, body: JSON.stringify({ revision: offers.revision, offers: [] }), signal: AbortSignal.timeout(3000) });
  await secondStarted;
  first.req.end('}'); await first.finished;
  assert.equal((await queued).status, 200, 'a complete queued JSON body must not lose its end event');
  const disconnected = await hold('disconnect'); disconnected.req.destroy(); await disconnected.finished;
  const current = await (await fetch(`${base}/api/retail-offers`)).json();
  const recovered = await fetch(`${base}/api/retail-offers`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: current.revision, offers: [] }), signal: AbortSignal.timeout(1500) });
  assert.equal(recovered.status, 200, 'aborted request must release the write queue');
});
