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

test("el formulario informa los horarios según el tipo de entrega", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "public", "cliente.html"),
    "utf8"
  );
  const clientScript = fs.readFileSync(
    path.join(__dirname, "..", "public", "cliente.js"),
    "utf8"
  );

  assert.match(html, /Horario de retiro: de 6:00 a 13:00 hs\./);
  assert.match(clientScript, /Horario de entrega para delivery: de 11:00 a 15:00 hs\./);
  assert.match(clientScript, /showSuccess\(data\.number, payload\.deliveryType\)/);
});
