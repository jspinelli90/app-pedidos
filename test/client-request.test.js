const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('client deadline covers a stalled response body and offers a safe recovery message', async t => {
  const dom = new JSDOM('', { runScripts: 'outside-only' }); t.after(() => dom.window.close());
  const w = dom.window; const set = w.setTimeout.bind(w); w.setTimeout = fn => set(fn, 20);
  w.fetch = async (_url, options) => ({ ok: true, status: 200, text: () => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  w.eval(fs.readFileSync(require.resolve('../public/client-request.js'), 'utf8'));
  await assert.rejects(w.ClientRequest.fetch('/catalog'), /Escribir mi pedido/);
  await assert.rejects(w.ClientRequest.fetch('/order', { method: 'POST' }), /consultá al local antes de repetirlo/);
  w.fetch = async () => ({ ok: true, status: 200, text: async () => '{"products":[]}' });
  assert.equal((await (await w.ClientRequest.fetch('/catalog')).json()).products.length, 0);
});
