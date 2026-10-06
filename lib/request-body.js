const pending = new WeakMap();
// Capture the stream before waiting for a write lock. IncomingMessage events
// cannot be replayed if a request finishes or disconnects while it is queued.
function captureBody(req, { maxBytes = 14_000_000, timeoutMs = 30_000 } = {}) {
  if (pending.has(req)) return pending.get(req);
  const result = new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      req.removeListener('data', data); req.removeListener('end', end);
      req.removeListener('aborted', aborted);
      if (!error) req.removeListener('error', failed);
      error ? reject(error) : resolve(Buffer.concat(chunks));
    };
    const problem = (message, statusCode) => Object.assign(new Error(message), { statusCode });
    const data = chunk => { size += chunk.length; if (size > maxBytes) { finish(problem('El archivo supera el limite permitido.', 413)); req.destroy(); } else chunks.push(chunk); };
    const end = () => finish();
    const aborted = () => finish(problem('La carga fue interrumpida. Volve a intentar.', 400));
    const failed = error => finish(error);
    const timer = setTimeout(() => { finish(problem('La carga tardo demasiado. Volve a intentar.', 408)); req.destroy(); }, timeoutMs);
    req.on('data', data); req.once('end', end); req.once('aborted', aborted); req.once('error', failed);
    if (req.aborted || req.destroyed) aborted();
  });
  // A queued request may fail before its handler starts awaiting the body.
  result.catch(() => {});
  pending.set(req, result);
  return result;
}
async function jsonBody(req, maxBytes = 1_000_000) {
  const body = await captureBody(req);
  if (body.length > maxBytes) throw Object.assign(new Error('El pedido es demasiado grande.'), { statusCode: 413 });
  try { return JSON.parse(body.toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Datos invalidos.'), { statusCode: 400 }); }
}
module.exports = { captureBody, jsonBody };
