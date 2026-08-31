const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

test("reutiliza los datos de Supabase y actualiza la cache despues de guardar", async t => {
  const stores = new Map([
    ["orders", [{ id: "o1", number: 1, customer: "Cliente Uno", detail: "1 asado", status: "Nuevo", prepDate: "2026-09-01" }]],
    ["customers", []],
    ["movements", []],
    ["migrations", [{ id: "2026-07-22-deactivate-wholesale-customers", affected: 0 }]]
  ]);
  const getCounts = new Map();
  const supabase = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname !== "/rest/v1/app_data") {
      res.writeHead(404);
      return res.end();
    }

    if (req.method === "GET") {
      const key = String(url.searchParams.get("key") || "").replace(/^eq\./, "");
      getCounts.set(key, (getCounts.get(key) || 0) + 1);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(stores.has(key) ? [{ data: stores.get(key) }] : []));
    }

    if (req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      stores.set(payload.key, payload.data);
      res.writeHead(204);
      return res.end();
    }

    res.writeHead(405);
    return res.end();
  });
  await new Promise(resolve => supabase.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => supabase.close(resolve)));

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-pedidos-cache-test-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  process.env.DATA_DIR = dataDir;
  process.env.PORT = "0";
  process.env.SUPABASE_URL = `http://127.0.0.1:${supabase.address().port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_STORE_CACHE_TTL_MS = "60000";

  const { server, startServer } = require("../server");
  await startServer();
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let response = await fetch(`${baseUrl}/api/orders`);
  assert.equal(response.status, 200);
  const readsAfterFirstRequest = getCounts.get("orders");
  response = await fetch(`${baseUrl}/api/orders`);
  assert.equal(response.status, 200);
  assert.equal(getCounts.get("orders"), readsAfterFirstRequest);

  response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer: "Cliente Dos", detail: "2 bifes", prepDate: "2026-09-01" })
  });
  assert.equal(response.status, 201);

  response = await fetch(`${baseUrl}/api/orders`);
  const orders = await response.json();
  assert.equal(orders.some(order => order.customer === "Cliente Dos"), true);
  assert.equal(getCounts.get("orders"), readsAfterFirstRequest);
  assert.equal(stores.get("orders").some(order => order.customer === "Cliente Dos"), true);
});
