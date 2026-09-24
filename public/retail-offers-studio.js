(function () {
  const model = window.RetailOffersModel;
  const el = id => document.getElementById(id);
  const state = { catalog: { lists: [], products: [] }, offers: [], revision: "initial", selected: new Set(), dirty: false, busy: false, loaded: false, touched: false };
  const key = offer => offer.id || offer._key;
  const message = (text, error = false) => { el("retailOffersMessage").textContent = text; el("retailOffersMessage").style.color = error ? "#b83232" : "#0f6b5f"; };
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  async function request(url, method = "GET", body) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
    return result;
  }
  function busy(value) {
    state.busy = value;
    el("retailOffersFields").disabled = value || !state.loaded;
    el("retailCatalogSave").disabled = value || !state.loaded;
    el("retailOffersReload").disabled = value;
    el("retailCatalogLists").querySelectorAll("input").forEach(input => { input.disabled = value || input.dataset.ready !== "true"; });
  }
  function refreshPoster() {
    const linked = el("retailPosterMode").value === "linked";
    el("legacyOffersLabel").hidden = linked;
    el("legacyOffersHelp").hidden = linked;
    el("offerPosterDate").value = linked ? "OFERTAS MINORISTAS" : "HASTA AGOTAR STOCK";
    window.updateOfferPoster?.();
  }
  function markDirty() { state.dirty = true; state.touched = true; message("Hay cambios sin guardar. Guardá las ofertas antes de descargar una placa vinculada."); refreshPoster(); }
  function renderCatalog() {
    el("retailCatalogLists").innerHTML = state.catalog.lists.map(list => `<label class="retail-check"><input type="checkbox" value="${escape(list.id)}" data-ready="${list.ready}" ${list.enabled ? "checked" : ""} ${!list.ready ? "disabled" : ""}>${escape(list.name)}${!list.ready ? " — requiere revisar y guardar precios" : ""}</label>`).join("") || "Todavía no hay listas de precios.";
  }
  function productOptions(selected) {
    let html = '<option value="">Elegir artículo para vincular</option>';
    if (selected && !state.catalog.products.some(product => product.id === selected)) html += `<option value="${escape(selected)}">Artículo no disponible: volver a vincular</option>`;
    for (const list of state.catalog.lists.filter(list => list.enabled)) {
      html += `<optgroup label="${escape(list.name)}">${state.catalog.products.filter(product => product.documentId === list.id).map(product => `<option value="${escape(product.id)}">${escape(product.name)}</option>`).join("")}</optgroup>`;
    }
    return html;
  }
  function updateCardStatus(card, offer) {
    const status = model.status(offer, state.catalog.products);
    card.querySelector(".retail-offer-status").textContent = status.label;
    const select = card.querySelector('[data-field="selected"]');
    select.disabled = status.code !== "active";
    if (select.disabled) { select.checked = false; state.selected.delete(key(offer)); }
    const product = state.catalog.products.find(product => product.id === offer.productId);
    card.querySelector(".retail-product-reference").textContent = product ? `Artículo: ${product.name} · Lista: ${product.listName}${product.unit ? ` · Venta por ${model.UNITS[product.unit]}` : " · Unidad del artículo aún sin definir en la lista"}` : "Vinculá un artículo. Si no está en la lista, agregalo desde Documentos clientes → Editar precios.";
  }
  function renderCards() {
    const container = el("retailOfferCards"); container.replaceChildren();
    if (!state.offers.length) { container.textContent = "Todavía no hay ofertas vinculadas. Agregá una o importá el texto de tu placa anterior."; return; }
    for (const offer of state.offers) {
      const card = document.createElement("article"); card.className = "retail-offer-card";
      card.innerHTML = `<div class="retail-offers-heading"><strong class="retail-offer-status"></strong><label class="retail-check"><input data-field="selected" type="checkbox">Incluir en placa</label><button class="danger retail-remove" type="button">Quitar</button></div>
        <div class="grid two"><label>Artículo de la lista<select data-field="productId">${productOptions(offer.productId)}</select></label><label>Nombre en la placa<input data-field="title" maxlength="100"></label></div>
        <p class="retail-product-reference"></p>
        <div class="retail-offer-values"><label>Tipo de oferta<select data-field="kind"><option value="unit_price">Precio por kg / unidad / caja</option><option value="bundle">Paquete con cantidad fija</option></select></label>
        <label>Cantidad del paquete<input data-field="quantity" type="number" min="0.001" max="1000" step="0.001"></label>
        <label>Medida<select data-field="unit"><option value="">Elegir medida</option><option value="kg">Kilos</option><option value="unit">Unidades</option><option value="box">Cajas</option></select></label>
        <label>Precio total de la oferta ($)<input data-field="price" type="number" min="0.01" max="999999999" step="0.01"></label></div>
        <div class="grid two"><label>Desde (opcional)<input data-field="startDate" type="date"></label><label>Hasta inclusive (opcional)<input data-field="endDate" type="date"></label></div>
        <div class="retail-offers-heading"><label class="retail-check"><input data-field="active" type="checkbox">Activar oferta</label><span>Sin fecha final: queda activa hasta que la pauses. Si se agota el stock, pausala.</span></div>`;
      for (const field of ["productId", "title", "kind", "quantity", "unit", "price", "startDate", "endDate"]) card.querySelector(`[data-field="${field}"]`).value = offer[field];
      card.querySelector('[data-field="active"]').checked = offer.active;
      card.querySelector('[data-field="selected"]').checked = state.selected.has(key(offer));
      card.querySelector('[data-field="quantity"]').disabled = offer.kind === "unit_price";
      function change(event) {
        const field = event.target.dataset.field;
        if (!field) return;
        if (field === "selected") { if (event.target.checked) state.selected.add(key(offer)); else state.selected.delete(key(offer)); state.touched = true; refreshPoster(); return; }
        offer[field] = field === "active" ? event.target.checked : ["price", "quantity"].includes(field) ? Number(event.target.value) : event.target.value;
        if (field === "productId") {
          const product = state.catalog.products.find(product => product.id === offer.productId);
          if (product) { offer.title = product.name; if (product.unit) offer.unit = product.unit; }
          card.querySelector('[data-field="title"]').value = offer.title;
          card.querySelector('[data-field="unit"]').value = offer.unit;
        }
        if (field === "kind") {
          if (offer.kind === "unit_price") offer.quantity = 1;
          card.querySelector('[data-field="quantity"]').value = offer.quantity;
          card.querySelector('[data-field="quantity"]').disabled = offer.kind === "unit_price";
        }
        updateCardStatus(card, offer); markDirty();
      }
      card.addEventListener("input", change);
      card.querySelector(".retail-remove").addEventListener("click", () => {
        if (!confirm(`¿Quitar la oferta “${offer.title || "Nueva oferta"}”? Se eliminará al guardar.`)) return;
        state.offers = state.offers.filter(item => item !== offer); state.selected.delete(key(offer)); renderCards(); markDirty();
      });
      updateCardStatus(card, offer); container.append(card);
    }
  }
  async function load() {
    if (state.busy) return;
    if (state.dirty && !confirm("Hay cambios sin guardar. ¿Descartarlos y recargar las ofertas?")) return;
    busy(true);
    try {
      state.catalog = await request("/api/retail-offers/catalog");
      const result = await request("/api/retail-offers");
      state.revision = result.revision; state.offers = result.offers; state.loaded = true; state.dirty = false;
      renderCatalog(); renderCards(); refreshPoster();
      message(state.catalog.products.length ? `${state.catalog.products.length} artículos disponibles. Las ofertas se guardan para todas las computadoras.` : "Elegí las listas minoristas arriba para comenzar a vincular artículos.");
    } catch (error) { message(error.message, true); }
    finally { busy(false); }
  }
  function draft(value = {}) {
    return { _key: `draft-${Date.now()}-${Math.random()}`, productId: "", title: "", kind: "unit_price", quantity: 1, unit: "kg", price: 0, startDate: "", endDate: "", active: false, ...value };
  }
  el("retailOfferAdd").addEventListener("click", () => {
    if (state.offers.length >= 200) return message("El máximo es de 200 ofertas.", true);
    state.offers.push(draft()); el("retailPosterMode").value = "linked"; renderCards(); markDirty(); el("retailOfferCards").lastElementChild.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  el("retailOfferImport").addEventListener("click", () => {
    const parsed = window.OfferImageGenerator.parseOffers(el("offerPosterOffersText").value);
    if (!parsed.length) return message("La placa anterior no tiene texto para importar.", true);
    if (state.offers.length + parsed.length > 200) return message("La importación supera las 200 ofertas.", true);
    for (const old of parsed) {
      const quantity = old.product.match(/^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|unidades?|cajas?|maples?)\b\s*/i);
      const unitText = `${quantity?.[2] || ""} ${old.unit}`;
      const unit = /kg|kilo/i.test(unitText) ? "kg" : /caja/i.test(unitText) ? "box" : /unidad|maple/i.test(unitText) ? "unit" : "";
      const price = Number(String(old.price).replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", "."));
      state.offers.push(draft({ title: old.product.slice(0, 100), unit, price: Number.isFinite(price) ? price : 0, kind: quantity ? "bundle" : "unit_price", quantity: quantity ? Number(quantity[1].replace(",", ".")) : 1 }));
    }
    el("retailPosterMode").value = "linked"; renderCards(); markDirty();
    message("Texto importado como borradores pausados. Revisá artículo, tipo, cantidad, medida y precio: no se activa ninguna oferta automáticamente.");
  });
  el("retailOffersSave").addEventListener("click", async () => {
    if (state.busy) return;
    busy(true);
    try {
      const selectedPositions = state.offers.map((offer, index) => state.selected.has(key(offer)) ? index : -1).filter(index => index >= 0);
      const result = await request("/api/retail-offers", "PUT", { revision: state.revision, offers: state.offers });
      state.offers = result.offers; state.revision = result.revision; state.dirty = false;
      state.selected = new Set(selectedPositions.map(index => result.offers[index].id));
      renderCards(); refreshPoster(); message("Ofertas guardadas. Las promociones vigentes ya están disponibles para las placas y la futura conexión del carrito.");
    } catch (error) { message(error.message, true); }
    finally { busy(false); }
  });
  el("retailCatalogSave").addEventListener("click", async () => {
    if (state.busy) return;
    if (state.dirty) return message("Guardá o descartá primero los cambios de ofertas antes de modificar las listas.", true);
    busy(true);
    try {
      const documentIds = [...el("retailCatalogLists").querySelectorAll("input:checked")].map(input => input.value);
      state.catalog = await request("/api/retail-offers/catalog", "PUT", { documentIds, revision: state.catalog.revision });
      renderCatalog(); renderCards(); refreshPoster(); message(`${state.catalog.products.length} artículos habilitados. Las ofertas de listas quitadas quedan fuera de la placa y del catálogo público.`);
    } catch (error) { message(error.message, true); }
    finally { busy(false); }
  });
  el("retailOffersReload").addEventListener("click", load);
  el("retailPosterMode").addEventListener("change", () => { state.touched = true; refreshPoster(); });
  el("offersStudioViewBtn").addEventListener("click", () => { if (!state.dirty) load(); });
  window.addEventListener("beforeunload", event => { if (state.dirty) { event.preventDefault(); event.returnValue = ""; } });
  window.RetailOffersStudio = {
    isLinked: () => el("retailPosterMode").value === "linked",
    selectedIds: () => [...state.selected].filter(id => !id.startsWith("draft-")),
    posterOffers: () => state.offers.filter(offer => state.selected.has(key(offer)) && model.status(offer, state.catalog.products).code === "active").map(model.posterOffer),
    clearSelection: () => { state.selected.clear(); state.touched = true; renderCards(); },
    applyDraft: value => {
      if (state.touched) return;
      el("retailPosterMode").value = value.offerMode === "linked" ? "linked" : "legacy";
      state.selected = new Set(value.retailOfferIds || []);
      if (state.loaded) { renderCards(); refreshPoster(); }
    },
    prepareDownload: async () => {
      if (!window.RetailOffersStudio.isLinked()) return;
      if (!state.loaded || state.busy) throw new Error("Esperá a que se carguen las ofertas.");
      if (state.dirty) throw new Error("Guardá las ofertas antes de descargar la placa vinculada.");
      state.catalog = await request("/api/retail-offers/catalog");
      const result = await request("/api/retail-offers");
      if (state.dirty) throw new Error("Hay cambios nuevos sin guardar. Guardá las ofertas antes de descargar.");
      if (result.revision !== state.revision) { state.offers = result.offers; state.revision = result.revision; renderCards(); refreshPoster(); throw new Error("Las ofertas cambiaron en otra computadora. Revisá la vista previa actualizada y volvé a descargar."); }
      renderCards(); refreshPoster();
      const count = window.RetailOffersStudio.posterOffers().length;
      if (!count) throw new Error("Seleccioná al menos una oferta vigente para incluir en la placa.");
      if (count > 30) throw new Error("Elegí hasta 30 ofertas por placa para mantenerla legible.");
    }
  };
  window.RetailOffersStudio.applyDraft(window.retailPosterPendingDraft || {});
  load();
})();
