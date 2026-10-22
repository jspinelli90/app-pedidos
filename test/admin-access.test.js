const test = require('node:test');
const assert = require('node:assert/strict');
const { hasAdministrationAccess } = require('../lib/rrhh-access');
const { authorize, isPublicRequest } = require('../lib/admin-access');
const user = { id: 'u1', firstName: 'Juan', lastName: 'Prueba', roles: ['EMPLOYEE'] };
test('permiso equivalente a Administración', () => {
  assert.equal(hasAdministrationAccess(user, null, []), false);
  assert.equal(hasAdministrationAccess({ ...user, roles: ['EMPLOYEE_ADMIN'] }, null, []), true);
  assert.equal(hasAdministrationAccess({ ...user, roles: ['SUPER_ADMIN'] }, { active: false, administrationRole: 'EMPLOYEE_ADMIN' }, []), false);
  assert.equal(hasAdministrationAccess(user, { active: true, administrationRole: 'AUTHORIZED_EMPLOYEE', canSubmitPaymentProofs: true }, []), true);
  assert.equal(hasAdministrationAccess(user, { active: true, administrationRole: 'AUTHORIZED_EMPLOYEE', canSubmitPaymentProofs: false }, []), false);
  assert.equal(hasAdministrationAccess(user, null, [{ name: 'Otro', externalUserId: 'u1' }]), true);
});
test('solo los recursos y métodos de clientes son públicos', () => {
  for (const url of ['/cliente.html', '/pedido-mayorista.html', '/mayorista.html', '/api/public-order-policy', '/api/public-client-documents/123', '/api/public-retail-catalog']) assert.equal(isPublicRequest('GET', url), true, url);
  for (const url of ['/', '/index.html', '/pos.html', '/api/orders', '/api/customers', '/api/users', '/api/movements', '/api/client-documents', '/api/public-orders', '/%69ndex.html']) assert.equal(isPublicRequest('GET', url), false, url);
  assert.equal(isPublicRequest('POST', '/api/public-orders'), true);
  assert.equal(isPublicRequest('DELETE', '/api/public-client-documents/123'), false);
  assert.equal(isPublicRequest('PUT', '/api/public-retail-offers'), false);
});
function response() { return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, writeHead(s,h) { this.status=s; Object.assign(this.headers,h); }, end(body) { this.body=body; } }; }
test('sin configuración bloquea datos privados y deja público el formulario', async () => {
  const saved = process.env.RRHH_DATABASE_URL;
  delete process.env.RRHH_DATABASE_URL;
  try {
    const res = response();
    assert.equal(await authorize({ method: 'GET', url: '/api/orders', headers: {} }, res), false);
    assert.equal(res.status, 503);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.equal(await authorize({ method: 'GET', url: '/cliente.html', headers: {} }, response()), true);
  } finally { if (saved !== undefined) process.env.RRHH_DATABASE_URL = saved; }
});
test('solicita credenciales antes de servir cualquier página privada', async () => {
  const old = [process.env.RRHH_DATABASE_URL, process.env.ADMINISTRATION_DATABASE_URL];
  process.env.RRHH_DATABASE_URL = 'configured'; process.env.ADMINISTRATION_DATABASE_URL = 'configured';
  try {
    const res = response();
    assert.equal(await authorize({ method: 'GET', url: '/', headers: {} }, res), false);
    assert.equal(res.status, 401);
    assert.match(res.headers['WWW-Authenticate'], /Basic/);
  } finally {
    for (const [i,key] of ['RRHH_DATABASE_URL','ADMINISTRATION_DATABASE_URL'].entries()) {
      if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i];
    }
  }
});
