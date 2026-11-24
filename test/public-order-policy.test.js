require('../test-support/authenticated-server.cjs');
const test = require("node:test");
const assert = require("node:assert/strict");
const { isOrderDateUnavailable, publicOrderDatePolicy } = require("../server");

test("el plazo es de cinco dias corridos desde la fecha de Buenos Aires", () => {
  for (const [now, today, maxDate] of [
    ["2026-11-24T15:00:00Z", "2026-11-24", "2026-11-29"],
    ["2026-12-01T02:59:59Z", "2026-11-30", "2026-12-05"],
    ["2027-01-01T03:00:00Z", "2027-01-01", "2027-01-06"],
    ["2028-02-28T12:00:00Z", "2028-02-28", "2028-03-04"]
  ]) {
    for (const type of ["DELIVERY", "RETIRO"]) {
      for (const zone of ["REGULAR", "CABA_VIERNES"]) {
        const policy = publicOrderDatePolicy(type, new Date(now), zone);
        assert.equal(policy.today, today);
        assert.equal(policy.maxDate, maxDate);
      }
    }
  }
});

test("el formulario limita el calendario y explica cuando CABA no tiene fechas", () => {
  const vm = require("node:vm"), fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../public/cliente.js"), "utf8");
  const code = source.slice(source.indexOf("function applyDatePolicy("), source.indexOf("async function refreshDatePolicy("));
  const prepDate = { value: "2026-11-30", setCustomValidity(value) { this.validationMessage = value; } };
  const context = vm.createContext({ prepDate, dateHint: {}, cutoffNotice: {}, cutoffText: {}, orderDatePolicy: null,
    nextWorkingDate: value => value, nextFriday: value => value, isSunday: () => false,
    isFriday: () => true, isCabaDelivery: () => false });
  vm.runInContext(code, context);
  context.policy = { today: "2026-11-24", minDate: "2026-11-24", maxDate: "2026-11-29", deliveryZone: "REGULAR" };
  vm.runInContext("applyDatePolicy(policy)", context);
  assert.equal(prepDate.max, "2026-11-29");
  assert.match(prepDate.validationMessage, /2026-11-29/);
  prepDate.value = "2026-11-28";
  assert.equal(vm.runInContext("validatePrepDate()", context), true);
  context.policy = { ...context.policy, minDate: "2026-12-04", deliveryZone: "CABA_VIERNES" };
  vm.runInContext("applyDatePolicy(policy, true)", context);
  assert.equal(prepDate.value, "");
  assert.match(prepDate.validationMessage, /No hay fechas disponibles/);
});

test("a las 12 permite retiro para hoy pero no delivery", () => {
  const noonInBuenosAires = new Date("2026-08-12T15:00:00Z");
  const delivery = publicOrderDatePolicy("DELIVERY", noonInBuenosAires);
  const pickup = publicOrderDatePolicy("RETIRO", noonInBuenosAires);

  assert.equal(delivery.afterCutoff, true);
  assert.equal(delivery.minDate, "2026-08-13");
  assert.equal(delivery.cutoffHour, 10);
  assert.equal(pickup.afterCutoff, false);
  assert.equal(pickup.minDate, "2026-08-12");
  assert.equal(pickup.cutoffHour, 13);
});

test("despues de las 13 bloquea delivery y retiro para hoy", () => {
  const twoPmInBuenosAires = new Date("2026-08-12T17:00:00Z");
  assert.equal(publicOrderDatePolicy("DELIVERY", twoPmInBuenosAires).afterCutoff, true);
  assert.equal(publicOrderDatePolicy("RETIRO", twoPmInBuenosAires).afterCutoff, true);
});

test("delivery CABA ofrece solo viernes y cierra el viernes a las 10", () => {
  const thursday = new Date("2026-08-13T13:00:00Z");
  const fridayAfterCutoff = new Date("2026-11-06T13:00:00Z");
  assert.equal(publicOrderDatePolicy("DELIVERY", thursday, "CABA_VIERNES").minDate, "2026-08-14");
  assert.equal(publicOrderDatePolicy("DELIVERY", fridayAfterCutoff, "CABA_VIERNES").minDate, "2026-11-13");
});

test("delivery cierra exactamente a las 10 todos los dias de Buenos Aires", () => {
  for (const [day, next] of [["2026-11-02", "2026-11-03"], ["2026-11-03", "2026-11-04"], ["2026-11-04", "2026-11-05"], ["2026-11-05", "2026-11-06"], ["2026-11-06", "2026-11-07"], ["2026-11-07", "2026-11-09"], ["2026-11-08", "2026-11-09"]]) {
    const before = publicOrderDatePolicy("DELIVERY", new Date(`${day}T12:59:59Z`));
    assert.equal(before.cutoffHour, 10);
    assert.equal(before.afterCutoff, false);
    assert.equal(before.minDate, day === "2026-11-08" ? "2026-11-09" : day);
    for (const time of ["13:00:00", "13:00:01", "14:00:00"]) {
      const after = publicOrderDatePolicy("DELIVERY", new Date(`${day}T${time}Z`));
      assert.equal(after.afterCutoff, true);
      assert.equal(after.minDate, next);
    }
  }
  const cabaBefore = publicOrderDatePolicy("DELIVERY", new Date("2026-11-06T12:59:59Z"), "CABA_VIERNES");
  assert.equal(cabaBefore.minDate, "2026-11-06");
  assert.equal(cabaBefore.afterCutoff, false);
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
  assert.equal(delivery.cutoffHour, 10);
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
  for (const timestamp of ["2026-09-26T02:00:00Z", "2026-09-26T10:59:59Z", "2026-09-26T11:00:00Z", "2026-09-26T16:00:00Z", "2026-11-06T12:59:59Z", "2026-11-06T13:00:00Z", "2026-11-07T12:59:59Z", "2026-11-07T13:00:00Z", "2026-11-24T12:59:59Z", "2026-11-24T13:00:00Z"]) {
    for (const type of ["RETIRO", "DELIVERY"]) {
      const date = new Date(timestamp);
      class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [date.valueOf()])); } }
      const local = vm.runInNewContext(policyCode + ";localDatePolicy()", {
        Date: FixedDate, Intl, deliveryType: { value: type }, isCabaDelivery: () => false,
        isFriday: value => new Date(value + "T12:00:00Z").getUTCDay() === 5,
        addDays: (value, days) => { const d = new Date(value + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); },
        nextWorkingDate: value => { const d = new Date(value + "T12:00:00Z"); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
      });
      assert.deepEqual(JSON.parse(JSON.stringify(local)), publicOrderDatePolicy(type, date));
    }
  }
});
