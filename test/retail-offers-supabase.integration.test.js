const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

test("crea ofertas en Supabase y conserva la versión anterior ante fallas o conflictos", async t => {
  const stores = new Map([
    ["client_documents", { updated_at: "2026-09-24T00:00:00Z", data: [{ id: "retail", type: "price-list", name: "MINORISTA.pdf", order: 0, priceData: { rows: [{ id: "asado", name: "Asado", price: 17000, unit: "kg" }] } }] }],
    ["migrations", { data: [{ id: "2026-07-22-deactivate-wholesale-customers" }] }]
  ]);
  let failure = "";
  const database = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const reply = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    const key = url.searchParams.get("key")?.replace(/^eq\./, "");
    if (req.method === "GET") return reply(200, stores.has(key) ? [stores.get(key)] : []);
    let raw = ""; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (failure === "write") return reply(503, {});
    if (req.method === "POST") {
      if (stores.has(body.key)) return reply(200, []);
      stores.set(body.key, body); return reply(200, [body]);
    }
    if (failure === "conflict" || `eq.${stores.get(key)?.updated_at}` !== url.searchParams.get("updated_at")) return reply(200, []);
    stores.set(key, body); reply(200, [body]);
  });
  await new Promise(resolve => database.listen(0, "127.0.0.1", resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "retail-supabase-test-"));
  process.env.DATA_DIR = dataDir; process.env.PORT = "0";
  process.env.SUPABASE_URL = `http://127.0.0.1:${database.address().port}`; process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
  const { server, startServer } = require("../server"); await startServer();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await new Promise(resolve => database.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const write = body => fetch(base + "/api/retail-offers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await write({ revision: "initial", offers: [{ productId: "retail:asado", title: "Asado", unit: "kg", kind: "unit_price", quantity: 1, price: 15000, startDate: "", endDate: "", active: true }] });
  assert.equal(result.status, 200);
  const saved = await result.json();
  for (failure of ["write", "conflict"]) {
    const changed = await write({ revision: saved.revision, offers: saved.offers.map(offer => ({ ...offer, price: 14000 })) });
    assert.equal(changed.status, failure === "write" ? 500 : 409);
    assert.equal(stores.get("retail_offers").data[0].offers[0].price, 15000);
  }
  failure = "";
  const changed = await write({ revision: saved.revision, offers: saved.offers.map(offer => ({ ...offer, active: false })) });
  assert.equal(changed.status, 200);
  assert.equal((await (await fetch(base + "/api/public-retail-offers")).json()).offers.length, 0);
});
