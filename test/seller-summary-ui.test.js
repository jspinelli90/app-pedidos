const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("el resumen de vendedor combina código exacto, fechas inclusivas y estado", t => {
  const root = path.join(__dirname, "../public");
  const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const functions = ["renderSellerSummary", "orderPrepDate", "orderSaleType", "formatDate", "escapeHtml"].map(name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf("\n}", start) + 2);
  }).join("\n");
  const ids = [...window.document.querySelectorAll('[id^="sellerSummary"]')].map(element => element.id);
  const order = { sellerCode: "CATA", status: "Despachado", customer: "Cliente de prueba" };
  const orders = [
    { ...order, number: 1, prepDate: "2026-11-01" },
    { ...order, number: 2, prepDate: "2026-11-12", saleType: "Mayorista", status: "Provisorio" },
    { ...order, number: 3, prepDate: "2026-11-13" },
    { ...order, number: 4, prepDate: "2026-11-03", sellerCode: "", customer: "Cata" }
  ];
  const render = window.eval(`
    const state = { orders: ${JSON.stringify(orders)} };
    const els = Object.fromEntries(${JSON.stringify(ids)}.map(id => [id, document.getElementById(id)]));
    ${functions}
    renderSellerSummary;
  `);
  const el = id => window.document.getElementById(id);
  const numbers = () => Array.from(el("sellerSummaryRows").rows, row => row.cells[0].textContent);
  el("sellerSummary").open = true;
  el("sellerSummaryFrom").value = "2026-11-01";
  el("sellerSummaryTo").value = "2026-11-12";
  render();
  assert.deepEqual(numbers(), ["#2", "#1"]);
  assert.match(el("sellerSummaryCount").textContent, /Pedidos: 2.*Minoristas: 1.*Mayoristas: 1/);

  el("sellerSummaryStatus").value = "Despachado";
  render();
  assert.deepEqual(numbers(), ["#1"]);

  el("sellerSummaryTo").value = "2026-10-31";
  render();
  assert.deepEqual(numbers(), []);
  assert.equal(el("sellerSummaryTable").hidden, true);
  assert.match(el("sellerSummaryCount").textContent, /fecha desde/);
});
