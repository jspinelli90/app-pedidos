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
  for (const title of ["Carne minorista", "Pollo y cerdo mayorista", "Cajas", "Grangys"]) {
    const sorted = orderPriceList(data(title));
    assert.equal(sorted.rows[0].name, "1/2 RES");
    assert.equal(sorted.rows[0].price, 102);
    assert.ok(sorted.rows.findIndex(row => row.name === "PECHO") < sorted.rows.findIndex(row => row.name === "vacío"));
  }
});
test("el PDF generado conserva el orden de pantalla y Consultar", async () => {
  const input = data("Carne mayorista");
  const imported = await importPriceList(await generatePricePdf(input), "mayorista.pdf");
  assert.deepEqual(imported.data.rows, validatePriceList(input).rows.map(({ name, price }) => ({ name, price })));
});
