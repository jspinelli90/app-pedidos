const test = require("node:test");
const assert = require("node:assert/strict");
const { formatPrice, offerCardLayout, parseOffers, posterDimensions } = require("../public/offers-generator");

test("formatea precios argentinos para la placa", () => {
  assert.equal(formatPrice("12500"), "$12.500");
  assert.equal(formatPrice("$ 9.500"), "$9.500");
  assert.equal(formatPrice("consultar"), "CONSULTAR");
});

test("usa dimensiones correctas para historia y publicacion", () => {
  assert.deepEqual(posterDimensions("story"), { width: 1080, height: 1920 });
  assert.deepEqual(posterDimensions("post"), { width: 1080, height: 1350 });
});

test("interpreta ofertas pegadas con distintos formatos", () => {
  assert.deepEqual(parseOffers("ASADO | 9500 | EL KILO\nVACIO $11200 EL KILO\n2 KG DE MILANESAS $18000"), [
    { product: "ASADO", price: "9500", unit: "EL KILO" },
    { product: "VACIO", price: "$11200", unit: "EL KILO" },
    { product: "2 KG DE MILANESAS", price: "$18000", unit: "" }
  ]);
});

test("acomoda mas de seis ofertas en columnas", () => {
  const layout = offerCardLayout(18, 1920);
  const occupied = layout.top + layout.height * layout.rows + layout.gap * (layout.rows - 1);
  assert.equal(layout.columns, 3);
  assert.ok(layout.height > 0);
  assert.ok(occupied <= 1920 - layout.bottom);
});
