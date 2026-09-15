(() => {
  const screen = document.querySelector('#sc-loading');
  let pending = 0;
  let loaded = document.readyState === 'complete';
  const finish = () => { if (loaded && !pending) { clearTimeout(timeout); screen?.remove(); } };
  const timeout = setTimeout(() => {
    const text = screen?.querySelector('.sc-message');
    if (text) text.textContent = 'LA CONEXIÓN ESTÁ TARDANDO';
    const retry = screen?.querySelector('button');
    if (retry) retry.hidden = false;
  }, 30000);
  screen?.querySelector('button')?.addEventListener('click', () => location.reload());
  window.SanCayetanoLoading = {
    wait(promise) {
      pending++;
      const done = () => { pending--; finish(); };
      Promise.resolve(promise).then(done, done);
    }
  };
  window.addEventListener('load', () => { loaded = true; finish(); }, {once: true});
  window.addEventListener('pagehide', () => clearTimeout(timeout), {once: true});
  if (loaded) queueMicrotask(finish);
})();
