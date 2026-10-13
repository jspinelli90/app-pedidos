const test = require("node:test");
const assert = require("node:assert/strict");
const { orderPriceList } = require("../public/price-list-order");
const { validatePriceList, generatePricePdf, importPriceList } = require("../lib/price-lists");

const data = title => ({ title, notes: "", rows: ["PISTOLA", "vacío", "1/2 RES", "ASADO COMPLETO", "Ásado", "PECHO", "MOCHO", "PARRILLERO", "DELANTERO", "BIFE CON LOMO", "Bola de lomo"].map((name, i) => ({ id: `p${i}`, name, price: 100 + i })) });
test("mayorista: orden alfabético, troceo al final y media res Consultar", () => {
  const original = data("Carne mayorista");
  const sorted = validatePriceList(original);
  assert.deepEqual(sorted.rows.map(row => row.name), ["Ásado", "Bola de lomo", "vacío", "MOCHO", "PECHO", "PARRILLERO", "BIFE CON LOMO", "ASADO COMPLETO", "DELANTERO", "PISTOLA", "1/2 RES"]);
  assert.equal(sorted.rows.at(-1).price, null);
  assert.equal(sorted.rows.at(-1).id, "p2");
  assert.equal(original.rows[2].price, 102);
});
test("otras listas ordenan todos los artículos y conservan sus precios", () => {
  for (const title of ["Carne minorista", "Grangys"]) {
    const sorted = orderPriceList(data(title));
    assert.equal(sorted.rows[0].name, "1/2 RES");
    assert.equal(sorted.rows[0].price, 102);
    assert.ok(sorted.rows.findIndex(row => row.name === "PECHO") < sorted.rows.findIndex(row => row.name === "vacío"));
  }
});
test("cajas conserva exactamente el orden recibido y los precios", () => {
  const original = data("LISTA DE PRECIOS CAJAS");
  assert.deepEqual(validatePriceList(original), original);
});
test("la lista mixta separa los cinco grupos y ordena dentro de cada grupo", () => {
  const rows = ["JAMON", "SUPREMA", "MORCILLA", "HIGADO", "OTRO PRODUCTO", "ALITA", "BONDIOLA FRESCA", "CHORIZO CASERO", "BOFE", "PARRILLERO"].map(name => ({ name, price: 100 }));
  const sorted = validatePriceList({ title: "LISTA PRECIOS POLLO CERDO EMBUTIDOS ACHURA Y OTROS", notes: "", rows });
  assert.deepEqual(sorted.rows.map(row => row.name), ["ALITA", "PARRILLERO", "SUPREMA", "BONDIOLA FRESCA", "JAMON", "CHORIZO CASERO", "MORCILLA", "BOFE", "HIGADO", "OTRO PRODUCTO"]);
});
test("el PDF generado conserva el orden de pantalla y Consultar", async () => {
  const input = data("Carne mayorista");
  const imported = await importPriceList(await generatePricePdf(input), "mayorista.pdf");
  assert.deepEqual(imported.data.rows, validatePriceList(input).rows.map(({ name, price }) => ({ name, price })));
});
