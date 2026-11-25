const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDeliveryAddress, deliveryFields, parseStreet } = require('../lib/delivery-address');
const input = { streetAddress: 'Av. Cabildo 3200', district: 'Vicente Lopez', locality: 'Olivos' };
const candidate = (province = '02', district = 'Comuna 13', locality = 'Belgrano') => ({
  calle: { nombre: 'AV CABILDO' }, altura: { valor: 3200 }, provincia: { id: province },
  departamento: { nombre: district }, localidad: { nombre: locality }, ubicacion: { lat: -34.55, lon: -58.45 }
});
const options = (direcciones, extra = {}) => ({ request: async () => ({ ok: true, json: async () => ({ direcciones, total: direcciones.length, ...extra }) }) });

test('rechaza resultados de CABA o de otro partido cuando no existe coincidencia en el elegido', async () => {
  const caba = await checkDeliveryAddress(input, options([candidate()]));
  assert.equal(caba.status, 'mismatch'); assert.match(caba.message, /Vicente Lopez/);
  const other = await checkDeliveryAddress(input, options([candidate('06', 'San Isidro', 'Martinez')]));
  assert.equal(other.status, 'mismatch'); assert.match(other.message, /Vicente Lopez/);
});
test('verifica calle y altura en el partido sin exigir una localidad única', async () => {
  assert.equal((await checkDeliveryAddress(input, options([candidate('06', 'Vicente López', 'Olivos')]))).status, 'verified');
  assert.equal((await checkDeliveryAddress(input, options([candidate('06', 'Vicente López', 'Florida')]))).status, 'verified');
  assert.equal((await checkDeliveryAddress(input, options([{ ...candidate('06', 'Vicente López'), calle: { nombre: 'CABILDO OTRA' } }]))).status, 'mismatch');
  assert.equal((await checkDeliveryAddress(input, options([{ ...candidate('06', 'Vicente López'), altura: { valor: 3100 } }]))).status, 'mismatch');
});
test('una coincidencia válida en el partido se acepta aunque haya calles homónimas en otros lugares', async () => {
  assert.equal((await checkDeliveryAddress(input, options([candidate(), candidate('06', 'Vicente López', 'Olivos')]))).status, 'verified');
});
test('no aprueba alturas sin ubicación, pero no descarta un resultado válido por el total aproximado del proveedor', async () => {
  assert.equal((await checkDeliveryAddress(input, options([{ ...candidate('06', 'Vicente López'), ubicacion: { lat: null, lon: null } }]))).status, 'review');
  assert.equal((await checkDeliveryAddress(input, options([candidate('06', 'Vicente López')], { total: 271 }))).status, 'verified');
  assert.equal((await checkDeliveryAddress(input, options([]))).status, 'mismatch');
});
test('Cuyo en San Isidro se acepta con coincidencia en Martínez aunque haya otra en Boulogne sin coordenadas', async () => {
  const street = item => ({ ...item, calle: { nombre: 'CUYO' }, altura: { valor: 1000 } });
  const data = [street(candidate('06', 'San Isidro', 'Martínez')), street({ ...candidate('06', 'San Isidro', 'Boulogne Sur Mer'), ubicacion: { lat: null, lon: null } })];
  assert.equal((await checkDeliveryAddress({ streetAddress: 'Cuyo 1000', district: 'San Isidro', locality: 'Martinez' }, options(data, { total: 38 }))).status, 'verified');
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
    assert.equal(url.searchParams.get('provincia'), '06');
    assert.equal(url.searchParams.get('departamento'), '06861');
    assert.equal(url.searchParams.has('localidad'), false);
    return { ok: true, json: async () => ({ direcciones: [] }) };
  } });
});
test('utiliza el identificador del partido elegido en cada consulta', async () => {
  for (const [district, id] of Object.entries({ Tigre: '06805', 'San Fernando': '06749', 'San Isidro': '06756', 'Vicente López': '06861', 'General San Martín': '06371' })) {
    await checkDeliveryAddress({ ...input, district }, { request: async url => {
      assert.equal(url.searchParams.get('departamento'), id);
      return { ok: true, json: async () => ({ direcciones: [] }) };
    } });
  }
});
test('compatibilidad con el domicilio compuesto de un formulario ya abierto', () => {
  assert.deepEqual(deliveryFields({ address: 'Cabildo 3200 - Olivos - Vicente Lopez' }), { streetAddress: 'Cabildo 3200', district: 'Vicente Lopez', locality: 'Olivos' });
});
