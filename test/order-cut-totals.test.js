const test = require('node:test');
const assert = require('node:assert/strict');
const Totals = require('../public/order-cut-totals');
const Cart = require('../public/retail-cart-model');
const order = (detail, extra = {}) => ({ id: '1', number: 1, customer: 'Prueba', detail, prepDate: '2026-11-25', ...extra });
function cartOrder(lines, extra = {}) {
  const cart = { lines: lines.map(line => ({ productId: 'meat:1', listName: 'Carne minorista.pdf', subtotal: 1000, note: '', ...line })), total: 1000, shipping: 0, shippingPending: false, notice: Cart.NOTICE };
  return order(Cart.detail(cart), { retailCart: cart, ...extra });
}

test('suma kilos de carritos y escritos; agrupa tildes y alias sin mezclar cortes distintos', () => {
  const result = Totals.summarize([
    cartOrder([{ name: 'VACIO', quantity: 2.5, unit: 'kg' }, { name: 'ASADO AMERICANO', quantity: 1, unit: 'kg' }]),
    order('Vacío 1,25 kg\n2 kg de asado\n500 gramos de vacío', { id: '2', number: 2 })
  ]);
  assert.deepEqual(result.rows.map(row => [row.name, row.grams]), [['Asado', 2000], ['Asado americano', 1000], ['Vacío', 4250]]);
  assert.equal(result.totalGrams, 7250); assert.equal(result.pending.length, 0);
  assert.equal(result.rows.find(row => row.name === 'Vacío').orderCount, 2);
});
test('fracciones, gramos, decimales y cantidades en palabras conservan precisión de un gramo', () => {
  const result = Totals.summarize([order('1/2 kg de nalga; 1 1/2 kg de nalga; medio kilo de nalga; un kilo y medio de nalga; 250 gr de nalga; nalga 0,125 kg; 2k de nalga')]);
  assert.equal(result.totalGrams, 6375); assert.equal(result.pending.length, 0);
  assert.equal(result.rows[0].name, 'Nalga');
});
test('separa varias cantidades claras por comas y por y, conservando los nombres compuestos', () => {
  const result = Totals.summarize([order('2,5 kg asado, 1 kg vacío y 3 kg pata y muslo')]);
  assert.equal(result.totalGrams, 6500); assert.equal(result.rows.length, 3); assert.equal(result.pending.length, 0);
});
test('cajas, piezas, cortes desconocidos, negativos y cantidades compartidas se revisan sin inventar kilos', () => {
  const result = Totals.summarize([
    cartOrder([{ name: 'CAJON DE POLLO', quantity: 2, unit: 'box' }, { name: 'CAJA DE SUPREMAS X 15KGS', quantity: 1, unit: 'unit' }]),
    order('2 piezas de nalga\n2 kg asado y vacío\n1.500 kg asado\n-2 kg asado\n2kg corte desconocido\n1kg asado con vacío', { id: '2' })
  ]);
  assert.equal(result.totalGrams, 0); assert.equal(result.pending.length, 8);
});
test('no suma precios, promociones, aclaraciones ni productos de verdulería', () => {
  const result = Totals.summarize([cartOrder([
    { name: 'ASADO', quantity: 2, unit: 'kg', offer: '2 kg al precio de uno', note: 'Separar en bolsas de 1 kg' },
    { productId: 'produce:papa:kg', name: 'Papa', listName: 'Esenciales', quantity: 10, unit: 'kg' },
    { productId: 'eggs:1', name: 'Maple', listName: 'Huevos', quantity: 2, unit: 'unit' }
  ]), order('1kg nalga y 3kg papas', { id: '2' })]);
  assert.equal(result.totalGrams, 3000); assert.equal(result.ignored.length, 3); assert.equal(result.pending.length, 0);
});
test('un carrito editado se totaliza desde el detalle actual, sin volver a sumar el original', () => {
  const original = cartOrder([{ name: 'ASADO', quantity: 2, unit: 'kg' }]);
  const edited = { ...original, detail: original.detail.replace('2 kg - ASADO', '3 kg - VACÍO') };
  const result = Totals.summarize([edited]);
  assert.equal(result.totalGrams, 3000); assert.equal(result.rows[0].name, 'Vacío');
  assert.equal(result.rows[0].contributions[0].source, 'Detalle modificado'); assert.equal(result.pending.length, 0);
});
test('conserva la condición aproximada de piezas y cajas compradas por kilo', () => {
  const original = cartOrder([{ name: 'NALGA', quantity: 4.5, unit: 'kg', requiresWholePieces: true }]);
  let result = Totals.summarize([original]); assert.equal(result.totalGrams, 4500); assert.equal(result.rows[0].approximate, true);
  result = Totals.summarize([{ ...original, detail: original.detail.replace('4.5 kg', '5 kg') }]);
  assert.equal(result.totalGrams, 5000); assert.equal(result.pending.length, 0); assert.equal(result.rows[0].approximate, true);
});
test('datos originales quedan intactos y cada aporte conserva pedido y fecha', () => {
  const orders = [order('2kg asado', { id: 'a', number: 22 }), order('1kg asado', { id: 'b', number: 23 })];
  const before = JSON.stringify(orders), result = Totals.summarize(orders);
  assert.equal(JSON.stringify(orders), before); assert.deepEqual(result.rows[0].contributions.map(row => row.number), [22, 23]);
  assert.deepEqual(result.rows[0].contributions.map(row => row.date), ['2026-11-25', '2026-11-25']);
});

test('interpreta viñetas, abreviaturas y preparaciones explícitas sin sumar otros productos', () => {
  const result = Totals.summarize([order('•2,5kg de tapa asado\n• 1kg nalga feteada\nSupremas x 2kg\n1kg matambre de cerdo\nHola! Les pido 2 kg de pechugas de pollo\n3kg de carre de cerdo cortado en rodajas\n1kg mila nalga finos\n1kg milanesa bola de lomo\n2kg roast beef fresco\n1kg peceto envasado\n2 maples de huevo')]);
  assert.equal(result.totalGrams, 16500); assert.equal(result.pending.length, 0); assert.equal(result.ignored.length, 1);
  assert.ok(result.rows.some(row => row.name === 'Matambre de cerdo'));
  assert.ok(result.rows.some(row => row.name === 'Nalga' && row.grams === 2000));
});
