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

test("delivery CABA ofrece solo viernes y cierra el viernes a las 11", () => {
  const thursday = new Date("2026-08-13T13:00:00Z");
  const fridayAfterCutoff = new Date("2026-08-14T15:00:00Z");
  assert.equal(publicOrderDatePolicy("DELIVERY", thursday, "CABA_VIERNES").minDate, "2026-08-14");
  assert.equal(publicOrderDatePolicy("DELIVERY", fridayAfterCutoff, "CABA_VIERNES").minDate, "2026-08-21");
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


test("retiro del sábado cierra a las 8 de Buenos Aires y ofrece el lunes", () => {
  const before = publicOrderDatePolicy("RETIRO", new Date("2026-09-26T10:59:59Z"));
  assert.equal(before.cutoffHour, 8);
  assert.equal(before.afterCutoff, false);
  assert.equal(before.minDate, "2026-09-26");
  for (const time of ["11:00:00", "11:00:01", "16:00:00"]) {
    const after = publicOrderDatePolicy("RETIRO", new Date(`2026-09-26T${time}Z`));
    assert.equal(after.afterCutoff, true);
    assert.equal(after.minDate, "2026-09-28");
  }
  const delivery = publicOrderDatePolicy("DELIVERY", new Date("2026-09-26T11:00:00Z"));
  assert.equal(delivery.cutoffHour, 11);
  assert.equal(delivery.minDate, "2026-09-26");
  const friday = publicOrderDatePolicy("RETIRO", new Date("2026-09-26T02:00:00Z"));
  assert.equal(friday.today, "2026-09-25");
  assert.equal(friday.cutoffHour, 13);
  assert.equal(friday.minDate, "2026-09-26");
});

test("la alternativa del navegador coincide con el servidor en el límite del sábado", () => {
  const vm = require("node:vm"), fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../public/cliente.js"), "utf8");
  const policyCode = source.slice(source.indexOf("function localDatePolicy()"), source.indexOf("function applyDatePolicy("));
  for (const timestamp of ["2026-09-26T02:00:00Z", "2026-09-26T10:59:59Z", "2026-09-26T11:00:00Z", "2026-09-26T16:00:00Z"]) {
    for (const type of ["RETIRO", "DELIVERY"]) {
      const date = new Date(timestamp);
      class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [date.valueOf()])); } }
      const local = vm.runInNewContext(policyCode + ";localDatePolicy()", {
        Date: FixedDate, Intl, deliveryType: { value: type }, isCabaDelivery: () => false,
        addDays: (value, days) => { const d = new Date(value + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); },
        nextWorkingDate: value => { const d = new Date(value + "T12:00:00Z"); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
      });
      assert.deepEqual(JSON.parse(JSON.stringify(local)), publicOrderDatePolicy(type, date));
    }
  }
});
