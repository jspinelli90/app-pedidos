const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeOrder } = require("../server");

test("conserva ambas camionetas y convierte la asignación histórica a camioneta 1", () => {
  for (const [input, expected] of [
    ["CAMION", "Camion"], ["Camión", "Camion"],
    ["Camioneta", "Camioneta 1"], ["CAMIONETA 1", "Camioneta 1"],
    ["CAMIONETA 2", "Camioneta 2"], ["Otro", "Sin asignar"]
  ]) {
    assert.equal(normalizeOrder({ routeVehicle: input }).routeVehicle, expected);
  }
  const existing = { id: "pedido-1", routeVehicle: "Camioneta" };
  assert.equal(normalizeOrder({ customer: "Cliente" }, existing).routeVehicle, "Camioneta 1");
  assert.equal(normalizeOrder({ routeVehicle: "Camioneta 2" }, existing).routeVehicle, "Camioneta 2");
});
