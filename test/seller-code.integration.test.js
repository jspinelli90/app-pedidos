require("../test-support/authenticated-server.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("guarda el código opcional en pedidos minoristas y mayoristas y lo conserva al editar", async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "seller-code-"));
  process.env.DATA_DIR = dataDir;
  process.env.PORT = "0";
  const { server, startServer } = require("../server");
  await startServer();
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const send = (route, method, body) => fetch(baseUrl + route, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const policy = await fetch(baseUrl + "/api/public-order-policy?deliveryType=RETIRO");
  const { minDate } = await policy.json();
  const order = {
    customer: "Cliente de prueba",
    phone: "1155551234",
    deliveryType: "RETIRO",
    prepDate: minDate,
    detail: "1 kg de asado"
  };

  for (const [page, saleType] of [
    ["/cliente.html", "Minorista"],
    ["/pedido-mayorista.html", "Mayorista"]
  ]) {
    const form = await fetch(baseUrl + page);
    assert.equal(form.status, 200);
    assert.match(await form.text(), /id="clientSellerCode"/);
    const response = await send("/api/public-orders", "POST", {
      ...order, saleType, sellerCode: "  cata  "
    });
    assert.equal(response.status, 201);
  }

  assert.equal((await send("/api/public-orders", "POST", order)).status, 201);
  assert.equal((await send("/api/public-orders", "POST", { ...order, sellerCode: {} })).status, 400);
  assert.equal((await send("/api/public-orders", "POST", { ...order, sellerCode: "OTRO" })).status, 400);

  const getOrders = async () => (await fetch(baseUrl + "/api/orders")).json();
  const orders = await getOrders();
  const attributed = orders.filter(item => item.sellerCode === "CATA");
  assert.deepEqual(attributed.map(item => item.saleType).sort(), ["Mayorista", "Minorista"]);
  assert.ok(attributed.every(item => item.sellerName === "Víctor Ayala"));
  assert.equal(orders.length, 3);
  assert.equal(orders.filter(item => item.sellerCode === "").length, 1);

  const { sellerCode, ...orderToEdit } = attributed[0];
  const update = await send(`/api/orders/${orderToEdit.id}`, "PUT", {
    ...orderToEdit, status: "Preparado"
  });
  assert.equal(update.status, 200);
  assert.equal((await getOrders()).find(item => item.id === orderToEdit.id).sellerCode, sellerCode);

  const reportUrl = baseUrl + "/api/orders/seller-report?" + new URLSearchParams({
    code: "CATA", from: minDate, to: minDate, status: "Preparado"
  });
  const excel = await fetch(reportUrl + "&format=xlsx");
  assert.equal(excel.status, 200);
  const workbook = new (require("exceljs").Workbook)();
  await workbook.xlsx.load(Buffer.from(await excel.arrayBuffer()));
  const sheet = workbook.getWorksheet("Pedidos");
  assert.equal(sheet.rowCount, 6);
  assert.equal(sheet.getCell("A6").value, orderToEdit.number);
  assert.equal(sheet.getCell("E6").value, "Preparado");

  const pdf = await fetch(reportUrl + "&format=pdf");
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
});
