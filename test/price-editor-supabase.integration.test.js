const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { generatePricePdf } = require("../lib/price-lists");

test("Supabase conserva el PDF vigente si falla la subida, los metadatos o una escritura concurrente", async t => {
  const data = { title: "Lista", notes: "", rows: [{ name: "Asado", price: 10000 }] };
  const original = await generatePricePdf(data);
  const objects = new Map([["price-list/original.pdf", original]]);
  let documents = [{ id: "list-1", type: "price-list", order: 0, name: "Lista.pdf", storageName: "price-list/original.pdf", size: original.length, updatedAt: "2026-09-01T10:00:00.000Z" }];
  let updatedAt = "2026-09-01T10:00:00.000Z", failure = "";
  const storage = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const reply = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    if (url.pathname.startsWith("/storage/v1/bucket/")) return reply(200, {});
    if (url.pathname.startsWith("/storage/v1/object/client-documents/")) {
      const key = url.pathname.replace("/storage/v1/object/client-documents/", "");
      if (req.method === "GET") { if (!objects.has(key)) return reply(404, {}); res.writeHead(200, { "Content-Type": "application/pdf" }); return res.end(objects.get(key)); }
      if (failure === "upload") return reply(503, {});
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks)); return reply(200, {});
    }
    if (url.pathname === "/rest/v1/app_data") {
      if (req.method === "GET") {
        if (url.searchParams.get("key") === "eq.client_documents") return reply(200, [{ data: documents, updated_at: updatedAt }]);
        return reply(200, [{ data: [{ id: "2026-07-22-deactivate-wholesale-customers" }] }]);
      }
      let body = ""; for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      if (req.method === "PATCH") {
        if (failure === "metadata") return reply(503, {});
        if (failure === "conflict" || url.searchParams.get("updated_at") !== `eq.${updatedAt}`) return reply(200, []);
        documents = payload.data; updatedAt = payload.updated_at; return reply(200, [{ data: documents, updated_at: updatedAt }]);
      }
      return reply(200, []);
    }
    reply(404, {});
  });
  await new Promise(resolve => storage.listen(0, "127.0.0.1", resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "price-storage-test-"));
  process.env.DATA_DIR = dataDir; process.env.PORT = "0";
  process.env.SUPABASE_URL = `http://127.0.0.1:${storage.address().port}`; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  const { server, startServer } = require("../server"); await startServer();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await new Promise(resolve => storage.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const payload = { data: { ...data, rows: [{ name: "Asado", price: 12000 }] }, revision: documents[0].updatedAt, reviewed: true };
  for (failure of ["upload", "metadata", "conflict"]) {
    const result = await fetch(base + "/api/client-documents/list-1/prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(result.status, failure === "conflict" ? 409 : 500);
    assert.equal(documents[0].storageName, "price-list/original.pdf");
    assert.equal(documents[0].priceHistory, undefined);
    const live = Buffer.from(await (await fetch(base + "/api/public-client-documents/list-1")).arrayBuffer());
    assert.equal(live.equals(original), true);
  }
  failure = "";
  const saved = await fetch(base + "/api/client-documents/list-1/prices", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal(saved.status, 200);
  assert.equal(documents[0].priceData.rows[0].price, 12000);
  assert.equal(documents[0].priceHistory[0].storageName, "price-list/original.pdf");
  assert.equal(objects.get("price-list/original.pdf").equals(original), true);
});
