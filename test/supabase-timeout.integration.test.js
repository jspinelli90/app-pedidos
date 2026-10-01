const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

test("a stalled Supabase body releases shared readers and a later request recovers", { timeout: 10000 }, async t => {
  let stalled = true;
  let orderReads = 0;
  let writes = 0;
  let documentStarted;
  const documentRequest = new Promise(resolve => { documentStarted = resolve; });
  const upstream = http.createServer((req, res) => {
    const key = new URL(req.url, "http://localhost").searchParams.get("key");
    if (req.method !== "GET") writes++;
    res.writeHead(200, { "Content-Type": "application/json" });
    if (key === "eq.client_documents") {
      res.write('[{"data":');
      documentStarted();
      return;
    }
    if (key === "eq.orders") {
      orderReads++;
      if (stalled) return res.write('[{"data":');
      return res.end(JSON.stringify([{ data: [{ id: "existing", number: 1, createdAt: "2026-10-01" }] }]));
    }
    res.end(JSON.stringify([{ data: [{ id: "2026-07-22-deactivate-wholesale-customers" }] }]));
  });
  await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pedidos-timeout-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  Object.assign(process.env, {
    DATA_DIR: dir, PORT: "0", SUPABASE_URL: `http://127.0.0.1:${upstream.address().port}`,
    SUPABASE_SERVICE_ROLE_KEY: "test-only", SUPABASE_REQUEST_TIMEOUT_MS: "1000",
    SUPABASE_STORE_CACHE_TTL_MS: "0"
  });
  const { server, startServer } = require("../server");
  await startServer();
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/orders`;
  const request = () => new Promise((resolve, reject) => {
    http.get(url, { agent: false }, response => {
      let body = "";
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
    }).on("error", reject);
  });
  const responses = await Promise.all([request(), request()]);
  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.match(response.body.error, /tardo demasiado/);
  }
  assert.equal(orderReads, 1, "concurrent readers share one bounded request");
  stalled = false;
  const recovered = await fetch(url);
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json())[0].id, "existing");
  assert.equal(orderReads, 2, "failed pending request must be released");
  let documentFinished = false;
  const blockedDocument = fetch(`http://127.0.0.1:${server.address().port}/api/public-client-documents`)
    .then(response => { documentFinished = true; return response; });
  await documentRequest;
  const independentOrders = await request();
  assert.equal(independentOrders.status, 200);
  assert.equal(documentFinished, false, "order listing bypasses the blocked document queue");
  assert.equal((await blockedDocument).status, 503);
  assert.equal(writes, 0, "recovery does not change stored data");
});
