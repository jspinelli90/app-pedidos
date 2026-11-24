const test = require('node:test');
const assert = require('node:assert/strict');
const { hashSync } = require('bcryptjs');
const { Pool } = require('pg');

test('RRHH entrega solo identidad de una cuenta activa con contraseña y permiso válidos', async t => {
  process.env.RRHH_DATABASE_URL = 'postgres://example.test/rrhh';
  process.env.ADMINISTRATION_DATABASE_URL = 'postgres://example.test/admin';
  let active = true, allowed = true;
  const passwordHash = hashSync('clave-prueba', 4);
  t.mock.method(Pool.prototype, 'query', async sql => {
    if (sql.includes('FROM users')) return { rows: [{ id: 'u1', email: 'ana@example.test', firstName: 'Ana', lastName: 'Prueba', active, roles: ['EMPLOYEE'], passwordHash }] };
    if (sql.includes('AdministrationAccessGrant')) return { rows: [{ active: allowed, administrationRole: 'EMPLOYEE_ADMIN' }] };
    return { rows: [] };
  });
  const { authenticate } = require('../lib/rrhh-access');
  assert.deepEqual(await authenticate('ana@example.test', 'clave-prueba'), { id: 'u1', email: 'ana@example.test', name: 'Ana Prueba' });
  assert.equal(await authenticate('ana@example.test', 'incorrecta'), false);
  active = false;
  assert.equal(await authenticate('ana@example.test', 'clave-prueba'), false);
  active = true; allowed = false;
  assert.equal(await authenticate('ana@example.test', 'clave-prueba'), false);
});
