const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDeliveryAddress, deliveryFields, parseStreet } = require('../lib/delivery-address');
const input = { streetAddress: 'Av. Cabildo 3200', district: 'Vicente Lopez', locality: 'Olivos' };
const candidate = (province = '02', district = 'Comuna 13', locality = 'Belgrano') => ({
  calle: { nombre: 'AV CABILDO' }, altura: { valor: 3200 }, provincia: { id: province },
  departamento: { nombre: district }, localidad: { nombre: locality }, ubicacion: { lat: -34.55, lon: -58.45 }
});
const options = (direcciones, extra = {}) => ({ request: async () => ({ ok: true, json: async () => ({ direcciones, total: direcciones.length, ...extra }) }) });

test('detecta CABA con partido de Zona Norte y otro partido incorrecto', async () => {
  const caba = await checkDeliveryAddress(input, options([candidate()]));
  assert.equal(caba.status, 'mismatch'); assert.match(caba.message, /CABA/);
  const other = await checkDeliveryAddress(input, options([candidate('06', 'San Isidro', 'Martinez')]));
  assert.equal(other.status, 'mismatch'); assert.match(other.message, /San Isidro/);
});
test('solo verifica calle, altura, partido y localidad coincidentes', async () => {
  assert.equal((await checkDeliveryAddress(input, options([candidate('06', 'Vicente López', 'Olivos')]))).status, 'verified');
  assert.equal((await checkDeliveryAddress(input, options([candidate('06', 'Vicente López', 'Florida')]))).status, 'review');
  assert.equal((await checkDeliveryAddress(input, options([{ ...candidate(), calle: { nombre: 'CABILDO OTRA' } }]))).status, 'review');
  assert.equal((await checkDeliveryAddress(input, options([{ ...candidate(), altura: { valor: 3100 } }]))).status, 'review');
});
test('calles repetidas en CABA y Vicente López exigen revisión aunque una coincida', async () => {
  assert.equal((await checkDeliveryAddress(input, options([candidate(), candidate('06', 'Vicente López', 'Olivos')]))).status, 'review');
});
test('no confunde una calle sin coordenadas o una lista incompleta con un domicilio validado', async () => {
  assert.equal((await checkDeliveryAddress(input, options([{ ...candidate(), ubicacion: { lat: null, lon: null } }]))).status, 'review');
  assert.equal((await checkDeliveryAddress(input, options([candidate()], { total: 101 }))).status, 'review');
  assert.equal((await checkDeliveryAddress(input, options([]))).status, 'review');
});
test('caída, respuesta inválida y domicilio incompleto dejan revisión pendiente', async () => {
  for (const request of [async () => { throw new Error('timeout'); }, async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({}) })]) {
    assert.equal((await checkDeliveryAddress(input, { request })).reason, 'service_unavailable');
  }
  assert.equal((await checkDeliveryAddress({ ...input, streetAddress: 'Barrio privado sin altura' })).reason, 'incomplete_address');
  assert.equal((await checkDeliveryAddress({ address: 'Calle sin partido 1' })).reason, 'missing_district');
});
test('CABA explícita se rechaza incluso sin servicio de mapas', async () => {
  assert.equal((await checkDeliveryAddress({ ...input, streetAddress: 'Cabildo 3200, CABA' }, { request: async () => { throw Error(); } })).status, 'mismatch');
});
test('conserva calles numéricas y envía solo calle y altura al proveedor', async () => {
  assert.deepEqual(parseStreet('25 de Mayo 503 piso 2 depto B'), { street: '25 de Mayo', number: 503 });
  assert.deepEqual(parseStreet('Av. Cabildo 3200, 2 B'), { street: 'Av. Cabildo', number: 3200 });
  await checkDeliveryAddress({ ...input, streetAddress: 'Av. Cabildo 3200 piso 2 depto B' }, { request: async url => {
    assert.equal(url.searchParams.get('direccion'), 'Av. Cabildo 3200');
    assert.equal(url.searchParams.get('provincia'), '02,06');
    assert.equal(url.searchParams.has('departamento'), false);
    assert.equal(url.searchParams.has('localidad'), false);
    return { ok: true, json: async () => ({ direcciones: [] }) };
  } });
});
test('compatibilidad con el domicilio compuesto de un formulario ya abierto', () => {
  assert.deepEqual(deliveryFields({ address: 'Cabildo 3200 - Olivos - Vicente Lopez' }), { streetAddress: 'Cabildo 3200', district: 'Vicente Lopez', locality: 'Olivos' });
});
