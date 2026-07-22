const test = require("node:test");
const assert = require("node:assert/strict");
const { findDuplicateCustomer, normalizeCustomer } = require("../server");

test("el numero de cliente solo se conserva para mayoristas", () => {
  assert.equal(normalizeCustomer({ name: "A", saleType: "Minorista", customerNumber: "99" }).customerNumber, "");
  assert.equal(normalizeCustomer({ name: "A", saleType: "Mayorista", customerNumber: " 99 " }).customerNumber, "99");
});

test("detecta duplicados por telefono normalizado", () => {
  const customers = [{ id: "1", name: "Comercio Uno", phone: "+54 11 4444-5555", saleType: "Mayorista" }];
  assert.equal(findDuplicateCustomer(customers, { name: "Otro", phone: "541144445555" }).id, "1");
});

test("detecta duplicados por nombre sin acentos ni diferencias de mayusculas", () => {
  const customers = [{ id: "1", name: "Almacén San José", phone: "", saleType: "Mayorista" }];
  assert.equal(findDuplicateCustomer(customers, { name: "almacen san jose", phone: "" }).id, "1");
});

test("detecta duplicados mayoristas por numero de cliente", () => {
  const customers = [{ id: "1", name: "A", phone: "", saleType: "Mayorista", customerNumber: "M-42" }];
  assert.equal(findDuplicateCustomer(customers, { name: "B", phone: "", customerNumber: "m-42" }).id, "1");
});
