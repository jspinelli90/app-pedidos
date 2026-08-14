const test = require("node:test");
const assert = require("node:assert/strict");
const { formatPrice, offerCardLayout, posterDimensions } = require("../public/offers-generator");

test("formatea precios argentinos para la placa", () => {
  assert.equal(formatPrice("12500"), "$12.500");
  assert.equal(formatPrice("$ 9.500"), "$9.500");
  assert.equal(formatPrice("consultar"), "CONSULTAR");
});

test("usa dimensiones correctas para historia y publicacion", () => {
  assert.deepEqual(posterDimensions("story"), { width: 1080, height: 1920 });
  assert.deepEqual(posterDimensions("post"), { width: 1080, height: 1350 });
});

test("acomoda hasta seis ofertas dentro del area disponible", () => {
  const layout = offerCardLayout(6, 1920);
  const occupied = layout.top + layout.height * 6 + layout.gap * 5;
  assert.ok(layout.height >= 128);
  assert.ok(occupied <= 1920 - 310);
});
