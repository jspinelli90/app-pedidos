const test = require("node:test");
const assert = require("node:assert/strict");
const { isOrderDateUnavailable, publicOrderDatePolicy } = require("../server");

test("a las 12 permite retiro para hoy pero no delivery", () => {
  const noonInBuenosAires = new Date("2026-08-12T15:00:00Z");
  const delivery = publicOrderDatePolicy("DELIVERY", noonInBuenosAires);
  const pickup = publicOrderDatePolicy("RETIRO", noonInBuenosAires);

  assert.equal(delivery.afterCutoff, true);
  assert.equal(delivery.minDate, "2026-08-13");
  assert.equal(delivery.cutoffHour, 11);
  assert.equal(pickup.afterCutoff, false);
  assert.equal(pickup.minDate, "2026-08-12");
  assert.equal(pickup.cutoffHour, 13);
});

test("despues de las 13 bloquea delivery y retiro para hoy", () => {
  const twoPmInBuenosAires = new Date("2026-08-12T17:00:00Z");
  assert.equal(publicOrderDatePolicy("DELIVERY", twoPmInBuenosAires).afterCutoff, true);
  assert.equal(publicOrderDatePolicy("RETIRO", twoPmInBuenosAires).afterCutoff, true);
});

test("distingue cierre total de fecha sin delivery", () => {
  const exceptions = [
    { date: "2026-08-20", type: "CLOSED" },
    { date: "2026-08-21", type: "NO_DELIVERY" }
  ];
  assert.ok(isOrderDateUnavailable(exceptions, "2026-08-20", "RETIRO"));
  assert.ok(isOrderDateUnavailable(exceptions, "2026-08-20", "DELIVERY"));
  assert.equal(isOrderDateUnavailable(exceptions, "2026-08-21", "RETIRO"), null);
  assert.ok(isOrderDateUnavailable(exceptions, "2026-08-21", "DELIVERY"));
});
