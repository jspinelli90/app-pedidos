(() => {
  async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      // Keep the deadline active until the response body has also arrived.
      const body = await response.text();
      return { ok: response.ok, status: response.status, json: async () => JSON.parse(body), text: async () => body };
    } catch (error) {
      if (controller.signal.aborted) throw new Error(options.method && options.method !== 'GET'
        ? 'La conexión está tardando. Si estabas enviando un pedido, consultá al local antes de repetirlo.'
        : 'La conexión está tardando. Tocá Actualizar catálogo para reintentar o elegí Escribir mi pedido.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  window.ClientRequest = { fetch: request };
})();
