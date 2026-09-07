const test = require("node:test");
const assert = require("node:assert/strict");
const { cabaStreetsForNeighborhood, validateCabaDeliveryAddress } = require("../server");

test("expone calles oficiales solo para los barrios habilitados", () => {
  assert.ok(cabaStreetsForNeighborhood("Núñez").length > 20);
  assert.deepEqual(cabaStreetsForNeighborhood("Palermo"), []);
});

test("valida calle, altura, paridad y barrio con el callejero oficial", () => {
  const streets = cabaStreetsForNeighborhood("Núñez");
  assert.ok(streets.includes("3 DE FEBRERO"));
  assert.equal(validateCabaDeliveryAddress("Núñez", "3 DE FEBRERO", 4850), true);
  assert.equal(validateCabaDeliveryAddress("Palermo", "3 DE FEBRERO", 4850), false);
  assert.equal(validateCabaDeliveryAddress("Núñez", "3 DE FEBRERO", 100), false);
});
