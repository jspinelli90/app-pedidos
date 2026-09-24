const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

test("vincula ofertas minoristas con IDs estables, sin tocar precios mayoristas ni la placa anterior", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "retail-offers-test-"));
  const documents = [
    { id: "retail", name: "CARNE MINORISTA.pdf", type: "price-list", order: 0, updatedAt: "2026-09-24", priceData: { title: "Minorista", notes: "", rows: [{ name: "Asado", price: 17000, unit: "kg" }, { name: "Vacío", price: 18000, unit: "kg" }] } },
    { id: "wholesale", name: "CARNE MAYORISTA.pdf", type: "price-list", order: 1, updatedAt: "2026-09-24", priceData: { title: "Mayorista", notes: "", rows: [{ name: "Asado", price: 15000 }] } }
  ];
  fs.writeFileSync(path.join(dataDir, "client-documents.json"), JSON.stringify(documents));
  fs.writeFileSync(path.join(dataDir, "offer-poster-draft.json"), JSON.stringify([{ title: "Anterior", offersText: "ASADO $15000 EL KG" }]));
  process.env.DATA_DIR = dataDir; process.env.PORT = "0"; process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  const { server, startServer } = require("../server"); await startServer();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (url, method = "GET", body) => fetch(base + url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = async url => (await call(url)).json();
  let catalog = await json("/api/retail-offers/catalog");
  assert.equal(catalog.products.length, 2);
  assert.ok(catalog.products.every(product => product.documentId === "retail"));
  const productId = catalog.products[0].id;
  assert.equal((await json("/api/retail-offers/catalog")).products[0].id, productId);
  const offer = { productId, title: "Asado", kind: "unit_price", quantity: 1, unit: "kg", price: 15000.5, startDate: "", endDate: "", active: true };
  const payload = { revision: "initial", offers: [offer] };
  const attempts = await Promise.all([call("/api/retail-offers", "PUT", payload), call("/api/retail-offers", "PUT", payload)]);
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 409]);
  let saved = await json("/api/retail-offers");
  assert.equal(saved.offers[0].status.code, "active");
  assert.equal((await json("/api/public-retail-offers")).offers[0].price, 15000.5);
  assert.equal((await json("/api/offer-poster-draft")).draft.offersText, "ASADO $15000 EL KG");
  const priceData = await json("/api/client-documents/retail/prices");
  priceData.data.rows.reverse();
  priceData.data.rows[1].name = "Asado especial"; priceData.data.rows[1].price = 19000;
  assert.equal((await call("/api/client-documents/retail/prices", "PUT", { revision: priceData.revision, data: priceData.data })).status, 200);
  catalog = await json("/api/retail-offers/catalog");
  assert.equal(catalog.products.find(product => product.id === productId).name, "Asado especial");
  assert.equal((await json("/api/public-retail-offers")).offers[0].productId, productId);
  assert.equal((await json("/api/client-documents/wholesale/prices")).data.rows[0].price, 15000);
  assert.equal((await call("/api/retail-offers/catalog", "PUT", { revision: catalog.revision, documentIds: [] })).status, 200);
  assert.equal((await json("/api/public-retail-offers")).offers.length, 0);
  saved = await json("/api/retail-offers");
  assert.equal(saved.offers[0].status.code, "unlinked");
  assert.equal((await call("/api/retail-offers", "PUT", { revision: saved.revision, offers: saved.offers })).status, 400);
  saved.offers[0].active = false;
  assert.equal((await call("/api/retail-offers", "PUT", { revision: saved.revision, offers: saved.offers })).status, 200);
  assert.equal((await json("/api/public-client-documents"))["price-list"].some(document => "retailEnabled" in document || "priceData" in document), false);
});
