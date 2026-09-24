const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePrice, extractRows, validatePriceList, generatePricePdf, importPriceList } = require("../lib/price-lists");

const cell = (str, x, y, width = 100) => ({ str, transform: [16.88, 0, 0, 16.88, x, y], width });
test("interpreta pesos argentinos sin confundir pesos de producto con precios", () => {
  assert.equal(parsePrice("$ 17.000,50"), 17000.5);
  assert.equal(parsePrice("14.518"), 14518);
  assert.equal(parsePrice("500"), 500);
  assert.equal(parsePrice("3KG PATA Y MUSLO"), null);
  assert.equal(parsePrice("10,5K"), null);
  assert.equal(parsePrice("11-6138-1377"), null);
});
test("separa columnas incluso cuando el PDF une un precio con el siguiente producto", () => {
  const result = extractRows([
    cell("ASADO", 20, 700), cell("17000 OSOBUCO", 251, 700, 150), cell("9900", 516, 700, 34),
    cell("3KG PATA Y MUSLO", 20, 680), cell("9900 PALETA", 259, 680, 150), cell("14900", 507, 680, 43),
    cell("NALGA", 20, 660), cell("18000 VACIO", 251, 660, 150), cell("15000", 507, 660, 43),
    cell("1/2 NT HASTA 129", 299, 640), cell("* CONSULTAR CONDICIONES", 20, 610),
    cell("se entregan a partir del miércoles", 20, 600)
  ]);
  assert.deepEqual(result.rows, [
    { name: "ASADO", price: 17000 }, { name: "OSOBUCO", price: 9900 },
    { name: "3KG PATA Y MUSLO", price: 9900 }, { name: "PALETA", price: 14900 },
    { name: "NALGA", price: 18000 }, { name: "VACIO", price: 15000 },
    { name: "1/2 NT HASTA 129", price: null }
  ]);
  assert.ok(result.leftovers.includes("se entregan a partir del miércoles"));
});
test("rechaza precios inválidos y conserva Consultar y cero", () => {
  const data = { title: "Lista", notes: "", rows: [{ name: "Corte", price: 0 }, { name: "Caja", price: null }] };
  assert.deepEqual(validatePriceList(data), data);
  for (const price of [-1, NaN, Infinity, "1200", undefined, 1000000000]) assert.throws(() => validatePriceList({ ...data, rows: [{ name: "Corte", price }] }));
  assert.throws(() => validatePriceList({ ...data, rows: [] }));
});
test("genera PDF multipágina con acentos, precio cero, notas y sin páginas de pie vacías", async () => {
  const data = { title: "Lista de precios", notes: "Consultar disponibilidad", rows: Array.from({ length: 80 }, (_, i) => ({ name: `Picaña ${i}`, price: i * 100 })) };
  const buffer = await generatePricePdf(data);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 2);
    for (let i = 1; i <= pdf.numPages; i++) {
      const text = (await (await pdf.getPage(i)).getTextContent()).items.map(item => item.str).join(" ");
      assert.match(text, /Picaña/);
      assert.match(text, new RegExp(`${i} / 2`));
    }
  } finally { await task.destroy(); }
  const imported = await importPriceList(buffer, "Lista.pdf");
  assert.ok(imported.data.rows.some(row => row.name === "Picaña 0" && row.price === 0));
});

test("distribuye 51 artículos en dos columnas en una hoja sin reducir la letra", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ name: `Producto ${i}`, price: 12345.5 }));
  const buffer = await generatePricePdf({ title: "Lista compacta", notes: "Precios por kilo", rows });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 1);
    const items = (await (await pdf.getPage(1)).getTextContent()).items;
    const products = items.filter(item => /^Producto \d+$/.test(item.str));
    assert.equal(products.length, 51);
    assert.equal(new Set(products.map(item => Math.round(item.transform[4]))).size, 2);
    assert.ok(products.every(item => Math.abs(item.transform[0] - 10) < 0.01));
    assert.equal(items.filter(item => item.str === "12.345,50").length, 51);
    assert.ok(items.some(item => item.str === "Precios por kilo"));
  } finally { await task.destroy(); }
});
