const { authenticate } = require('./rrhh-access');

// Public access is deliberately restricted to customer pages and their dependencies.
const publicFiles = new Set([
  '/cliente.html', '/pedido-mayorista.html', '/mayorista.html',
  '/cliente.js', '/mayorista.js', '/client-request.js', '/retail-cart.js',
  '/retail-cart-model.js', '/styles.css', '/sc-loading.css', '/sc-loading.js',
  '/san-cayetano-loading.png', '/san-cayetano-logo-blanco.png', '/favicon.ico'
]);
const publicReads = new Set([
  '/api/public-client-documents', '/api/public-retail-offers',
  '/api/public-retail-catalog', '/api/public-order-policy', '/api/caba-delivery-streets'
]);
const publicWrites = new Set([
  '/api/public-orders', '/api/public-wholesale-customers', '/api/public-retail-quote'
]);
function isPublicRequest(method, pathname) {
  if (method === 'GET' || method === 'HEAD') {
    return publicFiles.has(pathname) || publicReads.has(pathname) ||
      /^\/api\/public-client-documents\/[^/]+$/.test(pathname);
  }
  return method === 'POST' && publicWrites.has(pathname);
}
async function authorize(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (isPublicRequest(req.method, pathname)) return true;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Authorization');
  if (!process.env.RRHH_DATABASE_URL || !process.env.ADMINISTRATION_DATABASE_URL) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acceso interno pendiente de configurar. El formulario de clientes sigue disponible en /cliente.html.');
    return false;
  }
  const header = req.headers.authorization || '';
  const credentials = /^Basic [A-Za-z0-9+/]+=*$/i.test(header)
    ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const separator = credentials.indexOf(':');
  if (separator > 0) {
    try {
      if (await authenticate(credentials.slice(0, separator), credentials.slice(separator + 1))) return true;
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No se pudo verificar el acceso con RR. HH. Intentá nuevamente en unos minutos.');
      return false;
    }
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="San Cayetano - Acceso interno", charset="UTF-8"',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  res.end('Ingresá tu correo y contraseña de RR. HH. Tu cuenta debe estar autorizada en Administración.');
  return false;
}
module.exports = { authorize, isPublicRequest };
