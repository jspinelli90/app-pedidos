const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("el formulario público informa el pedido mínimo para delivery", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "cliente.html"),
    "utf8"
  );

  assert.match(html, /Pedido mínimo para delivery: \$50\.000\./);
});

test("el enlace mayorista reutiliza el formulario y fuerza pedidos mayoristas", () => {
  const clientScript = fs.readFileSync(
    path.join(__dirname, "..", "public", "cliente.js"),
    "utf8"
  );
  const server = fs.readFileSync(
    path.join(__dirname, "..", "server.js"),
    "utf8"
  );

  assert.match(clientScript, /pedido-mayorista\.html/);
  assert.match(clientScript, /isWholesaleOrder \? "Mayorista" : "Minorista"/);
  assert.match(server, /rawUrl\.pathname === "\/pedido-mayorista\.html"/);
});
