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

function inventoryOptions(number, streets) {
  const address = { ...candidate('06', 'San Fernando', 'Victoria'), calle: { nombre: 'CARLOS CASARES' }, altura: { valor: number }, ubicacion: { lat: null, lon: null } };
  return { request: async url => {
    assert.equal(url.searchParams.get('departamento'), '06749');
    assert.equal(url.searchParams.get('provincia'), '06');
    if (url.pathname.endsWith('/calles')) {
      assert.equal(url.searchParams.get('nombre'), 'Carlos Casares');
      assert.equal(url.searchParams.has('direccion'), false);
      return { ok: true, json: async () => ({ calles: streets, total: streets.length }) };
    }
    return { ok: true, json: async () => ({ direcciones: [address] }) };
  } };
}
const numberedStreet = {
  nombre: 'CARLOS CASARES', provincia: { id: '06' }, departamento: { id: '06749', nombre: 'San Fernando' }, localidad: { nombre: 'Victoria' },
  altura: { inicio: { derecha: 0, izquierda: 0 }, fin: { derecha: 4299, izquierda: 5000 } }
};
const inVictoria = number => ({ streetAddress: `Carlos Casares ${number}`, district: 'San Fernando', locality: 'Victoria' });

test('acepta una altura incluida en el rango oficial aunque no exista punto en el mapa', async () => {
  const result = await checkDeliveryAddress(inVictoria(2400), inventoryOptions(2400, [numberedStreet]));
  assert.equal(result.status, 'verified'); assert.equal(result.method, 'street-range'); assert.equal(result.policy, 'district-v3');
});
test('respeta ambos extremos y la paridad de los rangos por lado', async () => {
  for (const number of [1, 2, 4299, 5000]) assert.equal((await checkDeliveryAddress(inVictoria(number), inventoryOptions(number, [numberedStreet]))).status, 'verified', String(number));
  for (const number of [4301, 5002, 9999]) assert.equal((await checkDeliveryAddress(inVictoria(number), inventoryOptions(number, [numberedStreet]))).status, 'mismatch', String(number));
});
test('no usa rangos de otra calle, partido o provincia para aprobar una altura', async () => {
  for (const other of [{ ...numberedStreet, nombre: 'OTRA CALLE' }, { ...numberedStreet, departamento: { nombre: 'San Isidro', id: '06756' } }, { ...numberedStreet, provincia: { id: '02' } }]) {
    assert.equal((await checkDeliveryAddress(inVictoria(2400), inventoryOptions(2400, [other]))).status, 'review');
  }
});
test('rangos vacíos, cero o inválidos siguen pendientes sin inventar alturas', async () => {
  for (const altura of [undefined, { inicio: { derecha: 0 }, fin: { derecha: 0 } }, { inicio: { derecha: 5000 }, fin: { derecha: 1000 } }, { inicio: { derecha: 0 }, fin: { derecha: '5000' } }]) {
    assert.equal((await checkDeliveryAddress(inVictoria(2400), inventoryOptions(2400, [{ ...numberedStreet, altura }]))).status, 'review');
  }
});
test('si falla la consulta del callejero mantiene la revisión pendiente', async () => {
  const working = inventoryOptions(2400, [numberedStreet]);
  const result = await checkDeliveryAddress(inVictoria(2400), { request: async url => {
    if (url.pathname.endsWith('/calles')) throw Error('offline');
    return working.request(url);
  } });
  assert.equal(result.status, 'review');
});
