const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

test("delivery combina búsqueda, selector, tipo de venta y filtros existentes", t => {
  const root = path.join(__dirname, "../public");
  const dom = new JSDOM(fs.readFileSync(path.join(root, "index.html"), "utf8"), { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const w = dom.window;
  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const names = ["deliveryLocation", "compareDeliveryRoute", "normalizedPlaceText", "deliveryOrderSearchLabel", "deliveryOrders", "renderDelivery", "orderSaleType", "orderPrepDate", "orderRouteVehicle", "orderScheduledTime", "orderPriority", "orderDetail", "formatDate", "escapeHtml"];
  const functions = names.map(name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf("\n}", start) + 2);
  }).join("\n");
  const base = { deliveryType: "DELIVERY", status: "Nuevo", prepDate: "2026-11-06", routeVehicle: "Camion", customer: "José Pérez", address: "Av. Centenario 100 - Beccar - San Isidro" };
  const orders = [
    { ...base, id: "a", number: 1, saleType: "Mayorista" },
    { ...base, id: "b", number: 2, saleType: "Minorista" },
    { ...base, id: "c", number: 3, customer: "Ana", status: "Preparado", routeVehicle: "Camioneta", address: "Mitre 100 - Munro - Vicente Lopez" },
    { ...base, id: "d", number: 4, status: "Despachado" },
    { ...base, id: "e", number: 5, deliveryType: "RETIRO" },
    { ...base, id: "f", number: 6, prepDate: "2026-11-07" }
  ];
  const ids = ["dispatchVisibleBtn", "deliveryOrderSearch", "deliveryOrderOptions", "deliverySaleTypeFilter", "deliveryMunicipalityFilter", "deliveryDateFilter", "deliveryVehicleFilter", "deliveryStatusFilter", "routeCount", "routeHigh", "routeNext", "routeList"];
  w.eval(`const state = { orders: ${JSON.stringify(orders)} }; const els = Object.fromEntries(${JSON.stringify(ids)}.map(id => [id, document.getElementById(id)]));
    ${source.slice(source.indexOf("const DELIVERY_ZONES ="), source.indexOf("\n];", source.indexOf("const DELIVERY_ZONES =")) + 3)}
    ${functions}
    ${source.split("\n").filter(line => /els\.delivery.*addEventListener\("(?:input|change)", renderDelivery\)/.test(line)).join("\n")}
    window.renderDelivery = renderDelivery;
    window.deliveryLocation = deliveryLocation;
    window.orderRouteVehicle = orderRouteVehicle;`);
  const el = id => w.document.getElementById(id);
  const change = (id, value, event = "change") => { el(id).value = value; el(id).dispatchEvent(new w.Event(event)); };
  change("deliveryDateFilter", "2026-11-06");
  assert.equal(el("routeCount").textContent, "3");
  assert.equal(el("deliveryOrderOptions").children.length, 3);
  change("deliveryOrderSearch", "JOSE", "input");
  assert.equal(el("routeCount").textContent, "2");
  change("deliverySaleTypeFilter", "Mayorista");
  assert.equal(el("routeCount").textContent, "1");
  change("deliverySaleTypeFilter", "");
  change("deliveryOrderSearch", "José Pérez (#2)", "input");
  assert.equal(el("routeCount").textContent, "1");
  assert.match(el("routeList").textContent, /#2 - José Pérez/);
  change("deliveryOrderSearch", "", "input");
  change("deliverySaleTypeFilter", "Minorista");
  assert.equal(el("routeCount").textContent, "2");
  change("deliveryStatusFilter", "Preparado");
  assert.equal(el("routeCount").textContent, "1");
  change("deliveryVehicleFilter", "Camioneta 2");
  assert.equal(el("routeCount").textContent, "0");
  assert.match(el("routeList").textContent, /No hay entregas/);
  assert.equal(el("deliveryOrderOptions").children.length, 0);
  change("deliveryVehicleFilter", "Camioneta 1");
  assert.equal(el("routeCount").textContent, "1");
  assert.equal(el("routeList").querySelector(".route-vehicle").value, "Camioneta 1");
  assert.deepEqual(Array.from(el("routeList").querySelector(".route-vehicle").options, option => option.textContent), ["Sin asignar", "CAMION", "CAMIONETA 1", "CAMIONETA 2"]);
  assert.equal(w.orderRouteVehicle({ routeVehicle: "CAMIONETA 2" }), "Camioneta 2");
  change("deliveryVehicleFilter", "");
  change("deliveryStatusFilter", "");
  change("deliveryMunicipalityFilter", "San Isidro");
  assert.equal(el("routeCount").textContent, "1");
  assert.match(el("routeList").textContent, /#2 - José Pérez/);
  change("deliveryMunicipalityFilter", "Vicente Lopez");
  assert.equal(el("routeCount").textContent, "1");
  assert.match(el("routeList").textContent, /#3 - Ana/);
  change("deliveryMunicipalityFilter", "Zona sin identificar");
  assert.equal(el("routeCount").textContent, "0");
  assert.equal(w.deliveryLocation({ address: "Sin dirección" }).zone, "Zona sin identificar");
  assert.equal(w.deliveryLocation({ deliveryZone: "CABA_VIERNES", address: "Cabildo 100" }).zone, "CABA");
  assert.equal(w.deliveryLocation({ address: "100 - Villa Adelina - Vicente Lopez" }).zone, "Vicente Lopez");
});
