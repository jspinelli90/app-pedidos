// The customer selects the district. Validate existence inside that district;
// homonymous streets elsewhere must not turn a valid address into a warning.
const DISTRICTS = { TIGRE: '06805', 'SAN FERNANDO': '06749', 'SAN ISIDRO': '06756', 'VICENTE LOPEZ': '06861', 'SAN MARTIN': '06371' };
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const districtKey = value => normalize(value).replace(/^GENERAL SAN MARTIN$/, 'SAN MARTIN');
const streetKey = value => normalize(value).replace(/^(?:AVENIDA|AV|CALLE) /, '');
const pendingMessage = 'Dirección pendiente de revisión. El local debe verificar el domicilio y la zona de entrega antes de confirmar el pedido.';
const review = reason => ({ status: 'review', reason, message: pendingMessage });
const cache = new Map();
// Restore the original order flow: external address matching must not block
// customer submissions or the processing of previously flagged orders.
const enabled = false;

function deliveryFields(payload) {
  const parts = String(payload.address || '').split(/\s+-\s+/);
  // Compatibility with a customer page opened before this validation shipped.
  const district = String(payload.district || (parts.length >= 3 ? parts.at(-1) : '')).trim();
  const locality = String(payload.locality || (parts.length >= 3 ? parts.at(-2) : '')).trim();
  const streetAddress = String(payload.streetAddress || (parts.length >= 3 ? parts.slice(0, -2).join(' - ') : payload.address) || '').trim();
  return { streetAddress, district, locality };
}

function parseStreet(value) {
  // A house number is the last number before an optional apartment/reference.
  // Greedy street matching preserves numbered names such as "25 de Mayo".
  const streetAndNumber = value.split(/[,;]/)[0].replace(/\s+(?:piso|depto|dpto|dto|departamento|unidad|uf|pb)\b.*$/i, '').replace(/\s+-\s+.*$/, '').trim();
  const match = streetAndNumber.match(/^(.+)\s+(?:n[º°o.]?\s*)?(\d{1,6})$/i);
  if (!match || Number(match[2]) < 1) return null;
  return { street: match[1].trim(), number: Number(match[2]) };
}

async function lookup(query, department, request, resource = 'direcciones') {
  const key = `${resource}:${department}:${normalize(query)}`;
  const cached = cache.get(key);
  if (request === fetch && cached && cached.until > Date.now()) return cached.data;
  const url = new URL(`https://apis.datos.gob.ar/georef/api/v2.0/${resource}`);
  url.search = new URLSearchParams({ [resource === 'calles' ? 'nombre' : 'direccion']: query, provincia: '06', departamento: department, max: '100', campos: resource === 'calles' ? 'completo' : 'estandar' });
  const response = await request(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Georef unavailable');
  const data = await response.json();
  if (!Array.isArray(data[resource])) throw new Error('Invalid Georef response');
  if (request === fetch) {
    if (cache.size >= 300) cache.delete(cache.keys().next().value);
    cache.set(key, { data, until: Date.now() + 15 * 60 * 1000 });
  }
  return data;
}

function streetRanges(street) {
  return ['derecha', 'izquierda'].map(side => ({ start: street.altura?.inicio?.[side], end: street.altura?.fin?.[side] }))
    .filter(range => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end > 0 && range.end >= range.start);
}

function verified(method) {
  return { status: 'verified', source: 'Georef', policy: 'district-v3', method, message: 'Calle y altura verificadas en el partido elegido.', checkedAt: new Date().toISOString() };
}

async function checkDeliveryAddress(payload, { request = fetch } = {}) {
  const fields = deliveryFields(payload);
  const department = DISTRICTS[districtKey(fields.district)];
  if (!department) return review('missing_district');
  if (/\b(?:CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA DE BUENOS AIRES)\b/.test(normalize(fields.streetAddress))) {
    return { status: 'mismatch', message: 'La dirección indica CABA, pero elegiste un partido de Zona Norte. Corregí los datos o elegí Delivery CABA - viernes si tu domicilio está dentro de su cobertura.' };
  }
  const parsed = parseStreet(fields.streetAddress);
  if (!parsed) return review('incomplete_address');
  let data;
  try { data = await lookup(`${parsed.street} ${parsed.number}`, department, request); }
  catch { return review('service_unavailable'); }
  const matches = data.direcciones.filter(item => item.provincia?.id === '06' &&
    (item.departamento?.id === department || districtKey(item.departamento?.nombre) === districtKey(fields.district)) &&
    streetKey(item.calle?.nombre) === streetKey(parsed.street) && Number(item.altura?.valor) === parsed.number);
  const located = matches.some(item => typeof item.ubicacion?.lat === 'number' && Number.isFinite(item.ubicacion.lat) && typeof item.ubicacion?.lon === 'number' && Number.isFinite(item.ubicacion.lon));
  // One valid house number in the chosen district is sufficient. The service's
  // total includes approximate street matches, not just valid house numbers.
  if (located) {
    return verified('coordinates');
  }
  if (matches.length) {
    // A missing map point does not mean that the house number is invalid.
    // The official street inventory also provides numbering ranges by side.
    let inventory;
    try { inventory = await lookup(parsed.street, department, request, 'calles'); }
    catch { return review('unlocated_height'); }
    const streets = inventory.calles.filter(item => item.provincia?.id === '06' &&
      (item.departamento?.id === department || districtKey(item.departamento?.nombre) === districtKey(fields.district)) &&
      streetKey(item.nombre) === streetKey(parsed.street));
    const ranges = streets.flatMap(streetRanges);
    if (ranges.some(range => parsed.number >= Math.max(1, range.start) && parsed.number <= range.end && parsed.number % 2 === range.end % 2)) return verified('street-range');
    if (ranges.length && inventory.calles.length < 100) {
      return { status: 'mismatch', message: `La altura ingresada está fuera de los rangos registrados para esa calle en ${fields.district}. Revisá el número y el partido para continuar.` };
    }
    return review('unlocated_height');
  }
  if (data.direcciones.length >= 100) return review('incomplete_results');
  return { status: 'mismatch', message: `No encontramos la calle y altura ingresadas en ${fields.district}. Revisá la dirección y el partido seleccionado para continuar.` };
}

function requiresReview(order) {
  return enabled && order.deliveryType === 'DELIVERY' && order.addressValidation?.status === 'review';
}

module.exports = { enabled, checkDeliveryAddress, deliveryFields, requiresReview, parseStreet };
