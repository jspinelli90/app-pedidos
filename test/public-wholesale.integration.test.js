const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("depura mayoristas historicos y permite un alta publica sin duplicarlos", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-pedidos-test-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dataDir, "customers.json"), JSON.stringify([
    { id: "w1", name: "Almacen Norte", phone: "11 4000-0001", saleType: "Mayorista", active: true },
    { id: "r1", name: "Cliente Minorista", phone: "11 4000-0002", saleType: "Minorista", active: true }
  ]));
  fs.writeFileSync(path.join(dataDir, "orders.json"), JSON.stringify([
    { id: "o1", number: 1, customer: "Mayorista Historico", phone: "11 4000-0003", saleType: "Mayorista" }
  ]));
  fs.writeFileSync(path.join(dataDir, "users.json"), "[]");
  fs.writeFileSync(path.join(dataDir, "movements.json"), "[]");

  process.env.DATA_DIR = dataDir;
  process.env.PORT = "0";
  const { server, startServer } = require("../server");
  await startServer();
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let response = await fetch(`${baseUrl}/api/customers`);
  let customers = await response.json();
  assert.deepEqual(customers.map(customer => customer.name), ["Cliente Minorista"]);

  response = await fetch(`${baseUrl}/api/customers`);
  customers = await response.json();
  assert.deepEqual(customers.map(customer => customer.name), ["Cliente Minorista"]);
  const storedAfterSecondSync = JSON.parse(fs.readFileSync(path.join(dataDir, "customers.json"), "utf8"));
  assert.equal(storedAfterSecondSync.filter(customer => customer.name === "Mayorista Historico").length, 1);

  response = await fetch(`${baseUrl}/api/public-wholesale-customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Almacen Norte", phone: "1140000001", customerNumber: "M-10", cuit: "30-12345678-9" })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reactivated, true);

  response = await fetch(`${baseUrl}/api/public-wholesale-customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Otro nombre", phone: "+54 11 4000-0001" })
  });
  assert.equal(response.status, 409);

  response = await fetch(`${baseUrl}/api/public-wholesale-customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "CUIT invalido", phone: "1140000099", cuit: "123" })
  });
  assert.equal(response.status, 400);

  response = await fetch(`${baseUrl}/mayorista.html`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Numero de cliente o marcada/);
});
