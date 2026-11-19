(() => {
  const dialog = document.getElementById('produceReminder');
  if (!dialog) return;
  let seen = false, pending = null, written = false;
  function finish(continueOrder = false) {
    const resolve = pending; pending = null;
    if (dialog.open) dialog.close();
    resolve?.(continueOrder);
  }
  document.getElementById('produceReminderContinue').addEventListener('click', () => finish(true));
  document.getElementById('produceReminderClose').addEventListener('click', () => finish(false));
  document.getElementById('produceReminderAdd').addEventListener('click', async () => {
    finish(false);
    if (written) {
      const detail = document.getElementById('clientDetail');
      document.getElementById('textProduceSuggestion').hidden = false;
      detail.scrollIntoView({ behavior: 'smooth', block: 'center' });
      detail.focus({ preventScroll: true });
      detail.setSelectionRange(detail.value.length, detail.value.length);
    } else {
      try { await window.RetailCartUI?.openProduce(); }
      catch { document.getElementById('clientMessage').textContent = 'Podés elegir Esenciales - Verdulería en la lista del carrito. Tu pedido se conserva.'; }
    }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
  dialog.addEventListener('close', () => { if (pending) finish(false); });
  window.ProduceReminder = {
    beforeSend({ hasProduce = false, isWritten = false } = {}) {
      if (pending) return Promise.resolve(false);
      if (seen || hasProduce || typeof dialog.showModal !== 'function') return Promise.resolve(true);
      written = isWritten; seen = true;
      document.getElementById('produceReminderTitle').textContent = written ? '¿Ya agregaste lo de verdulería?' : '¡Ahora también te resolvemos la verdulería!';
      return new Promise(resolve => {
        pending = resolve;
        try { dialog.showModal(); }
        catch { pending = null; resolve(true); }
      });
    },
    reset() { finish(false); seen = false; written = false; document.getElementById('textProduceSuggestion').hidden = true; },
  };
})();
