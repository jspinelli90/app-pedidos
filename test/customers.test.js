const test = require("node:test");
const assert = require("node:assert/strict");
const { customerPhoneKey, findDuplicateCustomer, normalizeCustomer, normalizeOrder } = require("../server");

test("el numero de cliente solo se conserva para mayoristas", () => {
  assert.equal(normalizeCustomer({ name: "A", saleType: "Minorista", customerNumber: "99" }).customerNumber, "");
  assert.equal(normalizeCustomer({ name: "A", saleType: "Mayorista", customerNumber: " 99 " }).customerNumber, "99");
});

test("detecta duplicados por telefono normalizado", () => {
  const customers = [{ id: "1", name: "Comercio Uno", phone: "+54 11 4444-5555", saleType: "Mayorista" }];
  assert.equal(findDuplicateCustomer(customers, { name: "Otro", phone: "541144445555" }).id, "1");
});

test("normaliza variantes argentinas con codigo de pais, 9 y prefijo local 15", () => {
  assert.equal(customerPhoneKey("+54 9 11 4444-5555"), "1144445555");
  assert.equal(customerPhoneKey("0054 11 4444 5555"), "1144445555");
  assert.equal(customerPhoneKey("011 15 4444-5555"), "1144445555");
});

test("nunca considera duplicados a dos clientes por compartir nombre", () => {
  const customers = [{ id: "1", name: "Juan Perez", phone: "11 4000-0001" }];
  assert.equal(findDuplicateCustomer(customers, { name: "Juan Perez", phone: "11 4000-0002" }), undefined);
});

test("la direccion queda guardada como snapshot independiente en el pedido", () => {
  const order = normalizeOrder({ customer: "Ana", phone: "11 4444-5555", address: "Calle Nueva 123", detail: "1 pedido" });
  assert.equal(order.address, "Calle Nueva 123");
});

test("detecta duplicados mayoristas por numero de cliente", () => {
  const customers = [{ id: "1", name: "A", phone: "", saleType: "Mayorista", customerNumber: "M-42" }];
  assert.equal(findDuplicateCustomer(customers, { name: "B", phone: "", customerNumber: "m-42" }).id, "1");
});

test("detecta duplicados por CUIT aunque cambie el formato", () => {
  const customers = [{ id: "1", name: "A", phone: "", saleType: "Mayorista", cuit: "30-12345678-9" }];
  assert.equal(findDuplicateCustomer(customers, { name: "B", phone: "", cuit: "30123456789" }).id, "1");
});
