// Existing business-flow tests exercise the server behind an authenticated gate.
// The gate itself is tested separately in test/admin-access.test.js.
require('../lib/admin-access').authorize = async () => true;
