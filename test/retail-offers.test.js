const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../public/retail-offers-model");
const product = { id: "retail:chicken", name: "Pata y muslo", unit: "kg" };
const offer = { productId: product.id, title: product.name, kind: "bundle", quantity: 3, unit: "kg", price: 9900, startDate: "", endDate: "", active: true };
test("guarda paquetes y precio por medida como reglas diferentes, con importes decimales correctos", () => {
  const result = model.normalizeOffers([offer, { ...offer, kind: "unit_price", quantity: 1, price: 3300.5 }], [product], [], () => Math.random().toString());
  assert.equal(result[0].quantity, 3);
  assert.equal(result[0].price, 9900);
  assert.equal(result[1].price, 3300.5);
  assert.equal(result[0].audience, "retail");
  assert.deepEqual(model.posterOffer(result[0]), { product: "Pata y muslo", price: "9900,00", unit: "PAQUETE 3 KG" });
  assert.equal(model.posterOffer(result[1]).price, "3300,50");
});
test("vigencia inclusiva según fecha de Argentina y exclusión de artículos ausentes", () => {
  assert.equal(model.today(new Date("2026-09-25T02:30:00Z")), "2026-09-24");
  assert.equal(model.status({ ...offer, startDate: "2026-09-24", endDate: "2026-09-24" }, [product], "2026-09-24").code, "active");
  assert.equal(model.status({ ...offer, endDate: "2026-09-23" }, [product], "2026-09-24").code, "expired");
  assert.equal(model.status({ ...offer, startDate: "2026-09-25" }, [product], "2026-09-24").code, "scheduled");
  assert.equal(model.status({ ...offer, active: false }, [product]).code, "paused");
  assert.equal(model.status(offer, []).code, "unlinked");
  assert.equal(model.status(offer, [{ ...product, unit: "unit" }]).code, "unit_changed");
});
test("rechaza reglas ambiguas, fechas inválidas y unidades incompatibles", () => {
  for (const change of [{ quantity: 0 }, { quantity: 1.0001 }, { price: -1 }, { price: NaN }, { unit: "unit" }, { kind: "unit_price" }, { endDate: "2026-02-30" }, { startDate: "2026-10-01", endDate: "2026-09-01" }, { productId: "wholesale:1" }, { title: "" }]) {
    assert.throws(() => model.normalizeOffers([{ ...offer, ...change }], [product], [], () => "new"));
  }
  let id = 0;
  assert.throws(() => model.normalizeOffers([offer, { ...offer, price: 9500 }], [product], [], () => String(id++)), /superpuestas/);
  assert.equal(model.normalizeOffers([{ ...offer, endDate: "2026-09-23" }, { ...offer, startDate: "2026-09-24" }], [product], [], () => String(id++)).length, 2);
  assert.equal(model.normalizeOffers([{ ...offer, productId: "", active: false }], [], [], () => "draft")[0].active, false);
});
