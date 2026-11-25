// Compare independent results across Buenos Aires and CABA. Never restrict the
// lookup to the district supplied by the customer: that would hide mismatches.
const DISTRICTS = ['Tigre', 'San Fernando', 'San Isidro', 'Vicente Lopez', 'San Martin'];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const districtKey = value => normalize(value).replace(/^GENERAL SAN MARTIN$/, 'SAN MARTIN');
const streetKey = value => normalize(value).replace(/^(?:AVENIDA|AV|CALLE) /, '');
const pendingMessage = 'Dirección pendiente de revisión. El local debe verificar el domicilio y la zona de entrega antes de confirmar el pedido.';
const review = reason => ({ status: 'review', reason, message: pendingMessage });
const cache = new Map();

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

async function lookup(query, request) {
  const key = normalize(query);
  const cached = cache.get(key);
  if (request === fetch && cached && cached.until > Date.now()) return cached.data;
  const url = new URL('https://apis.datos.gob.ar/georef/api/v2.0/direcciones');
  url.search = new URLSearchParams({ direccion: query, provincia: '02,06', max: '100', campos: 'estandar' });
  const response = await request(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Georef unavailable');
  const data = await response.json();
  if (!Array.isArray(data.direcciones)) throw new Error('Invalid Georef response');
  if (request === fetch) {
    if (cache.size >= 300) cache.delete(cache.keys().next().value);
    cache.set(key, { data, until: Date.now() + 15 * 60 * 1000 });
  }
  return data;
}

async function checkDeliveryAddress(payload, { request = fetch } = {}) {
  const fields = deliveryFields(payload);
  if (!DISTRICTS.some(name => districtKey(name) === districtKey(fields.district))) return review('missing_district');
  if (/\b(?:CABA|CAPITAL FEDERAL|CIUDAD AUTONOMA DE BUENOS AIRES)\b/.test(normalize(fields.streetAddress))) {
    return { status: 'mismatch', message: 'La dirección indica CABA, pero elegiste un partido de Zona Norte. Corregí los datos o elegí Delivery CABA - viernes si tu domicilio está dentro de su cobertura.' };
  }
  const parsed = parseStreet(fields.streetAddress);
  if (!parsed) return review('incomplete_address');
  let data;
  try { data = await lookup(`${parsed.street} ${parsed.number}`, request); }
  catch { return review('service_unavailable'); }
  const matches = data.direcciones.filter(item =>
    streetKey(item.calle?.nombre) === streetKey(parsed.street) && Number(item.altura?.valor) === parsed.number);
  // A partial list or fuzzy result cannot prove that a competing address does
  // not exist. Likewise, null coordinates do not validate a house number.
  if (!matches.length || Number(data.total) > 100 || data.direcciones.length >= 100) return review('no_unique_match');
  const zones = new Set(matches.map(item => item.provincia?.id === '02' ? 'CABA' : item.provincia?.id === '06' ? districtKey(item.departamento?.nombre) : 'UNKNOWN'));
  if (zones.size !== 1 || zones.has('UNKNOWN')) return review('ambiguous_address');
  const found = [...zones][0];
  const located = matches.filter(item => typeof item.ubicacion?.lat === 'number' && Number.isFinite(item.ubicacion.lat) && typeof item.ubicacion?.lon === 'number' && Number.isFinite(item.ubicacion.lon));
  if (!located.length) return review('unlocated_height');
  if (found !== districtKey(fields.district)) {
    const label = found === 'CABA' ? 'CABA' : matches[0].departamento.nombre;
    return { status: 'mismatch', message: `La dirección corresponde a ${label}, pero seleccionaste ${fields.district}. Revisá la dirección y el partido para continuar.${found === 'CABA' ? ' El delivery CABA tiene cobertura limitada y se realiza los viernes.' : ''}` };
  }
  // Even within a district, conflicting localities must be reviewed.
  const localities = new Set(matches.map(item => normalize(item.localidad?.nombre || item.localidad_censal?.nombre)));
  if (!fields.locality || localities.size !== 1 || !localities.has(normalize(fields.locality))) return review('locality_unconfirmed');
  return { status: 'verified', source: 'Georef', message: 'Dirección y partido verificados.', checkedAt: new Date().toISOString() };
}

function requiresReview(order) {
  return order.deliveryType === 'DELIVERY' && order.addressValidation?.status === 'review';
}

module.exports = { checkDeliveryAddress, deliveryFields, requiresReview, parseStreet };
