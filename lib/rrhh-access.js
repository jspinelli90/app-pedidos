const { Pool } = require('pg');
const { compare } = require('bcryptjs');
let rrhh, administration;
const normalizeName = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
function hasAdministrationAccess(user, grant, partners) {
  if (grant?.administrationRole) {
    return grant.active && (['SUPER_ADMIN', 'EMPLOYEE_ADMIN'].includes(grant.administrationRole) ||
      (grant.administrationRole === 'AUTHORIZED_EMPLOYEE' && grant.canSubmitPaymentProofs));
  }
  if (user.roles.some(role => ['SUPER_ADMIN', 'EMPLOYEE_ADMIN'].includes(role))) return true;
  if (partners.some(partner => partner.externalUserId === user.id || normalizeName(partner.name) === normalizeName(`${user.firstName} ${user.lastName}`))) return true;
  return Boolean(grant?.active && grant.canSubmitPaymentProofs);
}
async function authenticate(email, password) {
  if (!process.env.RRHH_DATABASE_URL || !process.env.ADMINISTRATION_DATABASE_URL) throw Error('Access not configured');
  rrhh ??= new Pool({ connectionString: process.env.RRHH_DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  administration ??= new Pool({ connectionString: process.env.ADMINISTRATION_DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  const result = await rrhh.query(`SELECT u.id, u."passwordHash", u."firstName", u."lastName", u.active,
    COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
    FROM users u LEFT JOIN user_roles ur ON ur."userId" = u.id
    LEFT JOIN roles r ON r.id = ur."roleId" AND r.active = true
    WHERE lower(u.email) = lower($1) GROUP BY u.id LIMIT 1`, [email.trim()]);
  const user = result.rows[0];
  if (!user?.active || !user.roles.some(role => ['SUPER_ADMIN', 'EMPLOYEE_ADMIN', 'EMPLOYEE'].includes(role)) || !(await compare(password, user.passwordHash))) return false;
  const grants = await administration.query('SELECT * FROM "AdministrationAccessGrant" WHERE "externalUserId" = $1', [user.id]);
  const partners = await administration.query('SELECT name, "externalUserId" FROM "PartnerAccount" WHERE active = true');
  return hasAdministrationAccess(user, grants.rows[0], partners.rows);
}
module.exports = { authenticate, hasAdministrationAccess };
