const state = {
  orders: [],
  customers: [],
  users: [],
  movements: [],
  editingId: null
};

const els = {
  currentUserSelect: document.querySelector("#currentUserSelect"),
  addUserBtn: document.querySelector("#addUserBtn"),
  moduleTitle: document.querySelector("#moduleTitle"),
  ordersModule: document.querySelector("#ordersModule"),
  deliveryModule: document.querySelector("#deliveryModule"),
  ordersViewBtn: document.querySelector("#ordersViewBtn"),
  deliveryViewBtn: document.querySelector("#deliveryViewBtn"),
  form: document.querySelector("#orderForm"),
  formTitle: document.querySelector("#formTitle"),
  formMessage: document.querySelector("#formMessage"),
  orderId: document.querySelector("#orderId"),
  customer: document.querySelector("#customer"),
  customersList: document.querySelector("#customersList"),
  phone: document.querySelector("#phone"),
  address: document.querySelector("#address"),
  saleType: document.querySelector("#saleType"),
  deliveryType: document.querySelector("#deliveryType"),
  status: document.querySelector("#status"),
  payment: document.querySelector("#payment"),
  priority: document.querySelector("#priority"),
  prepDate: document.querySelector("#prepDate"),
  scheduledTime: document.querySelector("#scheduledTime"),
  routeVehicle: document.querySelector("#routeVehicle"),
  detail: document.querySelector("#detail"),
  notes: document.querySelector("#notes"),
  ordersList: document.querySelector("#ordersList"),
  prepDateFilter: document.querySelector("#prepDateFilter"),
  search: document.querySelector("#search"),
  saleTypeFilter: document.querySelector("#saleTypeFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  printSummaryBtn: document.querySelector("#printSummaryBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  deleteBtn: document.querySelector("#deleteBtn"),
  refreshBtn: document.querySelector("#refreshBtn"),
  newBtn: document.querySelector("#newBtn"),
  countProvisional: document.querySelector("#countProvisional"),
  countNew: document.querySelector("#countNew"),
  countPreparing: document.querySelector("#countPreparing"),
  countReady: document.querySelector("#countReady"),
  countWholesale: document.querySelector("#countWholesale"),
  countRetail: document.querySelector("#countRetail"),
  deliveryDateFilter: document.querySelector("#deliveryDateFilter"),
  deliveryVehicleFilter: document.querySelector("#deliveryVehicleFilter"),
  deliveryStatusFilter: document.querySelector("#deliveryStatusFilter"),
  mapsRouteBtn: document.querySelector("#mapsRouteBtn"),
  printRouteBtn: document.querySelector("#printRouteBtn"),
  routeCount: document.querySelector("#routeCount"),
  routeHigh: document.querySelector("#routeHigh"),
  routeNext: document.querySelector("#routeNext"),
  routeList: document.querySelector("#routeList")
};

function dateTime(value) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function setMessage(text, isError = false) {
  els.formMessage.textContent = text;
  els.formMessage.style.color = isError ? "#b83232" : "#0f6b5f";
}

function currentUser() {
  return els.currentUserSelect.value || localStorage.getItem("appPedidosUser") || "Sin usuario";
}

function rememberCurrentUser() {
  if (els.currentUserSelect.value) localStorage.setItem("appPedidosUser", els.currentUserSelect.value);
}

function withAudit(payload, auditAction = "") {
  return {
    ...payload,
    currentUser: currentUser(),
    auditAction
  };
}

function orderDetail(order) {
  if (order.detail) return order.detail;
  return (order.items || [])
    .map(item => `${item.qty} x ${item.name}${item.note ? ` (${item.note})` : ""}`)
    .join("\n");
}

function orderPriority(order) {
  return order.priority || "Media";
}

function orderScheduledTime(order) {
  return order.scheduledTime || "";
}

function orderPrepDate(order) {
  return order.prepDate || String(order.createdAt || "").slice(0, 10) || todayDate();
}

function orderRouteVehicle(order) {
  if (order.routeVehicle === "Camion" || order.routeVehicle === "Camioneta") return order.routeVehicle;
  return "Sin asignar";
}

function orderSaleType(order) {
  return order.saleType === "Mayorista" ? "Mayorista" : "Minorista";
}

function defaultPriorityForDeliveryType(deliveryType) {
  return deliveryType === "DELIVERY" ? "Baja" : "Media";
}

function priorityForOrderRule(deliveryType, priority) {
  return priority === "Alta" ? "Alta" : defaultPriorityForDeliveryType(deliveryType);
}

function applyPriorityRule(force = false) {
  if (!force && els.priority.value === "Alta") return;
  els.priority.value = defaultPriorityForDeliveryType(els.deliveryType.value);
}

function collectForm() {
  const deliveryType = els.deliveryType.value;
  return {
    customer: els.customer.value,
    phone: els.phone.value,
    address: els.address.value,
    saleType: els.saleType.value,
    deliveryType,
    status: els.status.value,
    payment: els.payment.value,
    priority: priorityForOrderRule(deliveryType, els.priority.value),
    prepDate: els.prepDate.value,
    scheduledTime: els.scheduledTime.value,
    routeVehicle: els.routeVehicle.value,
    detail: els.detail.value,
    notes: els.notes.value,
    items: [],
    currentUser: currentUser()
  };
}

function fillForm(order) {
  state.editingId = order.id;
  els.formTitle.textContent = `Editando pedido #${order.number}`;
  els.orderId.value = order.id;
  els.customer.value = order.customer || "";
  els.phone.value = order.phone || "";
  els.address.value = order.address || "";
  els.saleType.value = orderSaleType(order);
  els.deliveryType.value = order.deliveryType || "Retiro";
  els.status.value = order.status || "Nuevo";
  els.payment.value = order.payment || "";
  els.priority.value = orderPriority(order);
  els.prepDate.value = orderPrepDate(order);
  els.scheduledTime.value = orderScheduledTime(order);
  els.routeVehicle.value = orderRouteVehicle(order);
  els.detail.value = orderDetail(order);
  els.notes.value = order.notes || "";
  els.deleteBtn.hidden = false;
  setMessage("");
  els.customer.focus();
}

function resetForm() {
  state.editingId = null;
  els.form.reset();
  els.prepDate.value = todayDate();
  els.routeVehicle.value = "Sin asignar";
  applyPriorityRule(true);
  els.formTitle.textContent = "Nuevo pedido";
  els.deleteBtn.hidden = true;
  setMessage("");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || "No se pudo completar la accion.");
  return data;
}

async function loadOrders() {
  state.orders = await api("/api/orders");
  render();
  renderDelivery();
}

async function loadUsers() {
  state.users = await api("/api/users");
  renderUsers();
}

async function loadMovements() {
  state.movements = await api("/api/movements");
  render();
}

async function loadCustomers() {
  state.customers = await api("/api/customers");
  renderCustomers();
}

async function refreshAll() {
  renderLoadingState();
  await loadUsers();
  await loadOrders();
  await loadCustomers();
  await loadMovements();
}

function renderUsers() {
  const saved = localStorage.getItem("appPedidosUser");
  els.currentUserSelect.innerHTML = "";
  state.users.forEach(user => {
    const option = document.createElement("option");
    option.value = user.name;
    option.textContent = user.name;
    els.currentUserSelect.append(option);
  });
  if (saved && state.users.some(user => user.name === saved)) {
    els.currentUserSelect.value = saved;
  } else if (state.users.length && !els.currentUserSelect.value) {
    els.currentUserSelect.value = state.users[0].name;
    rememberCurrentUser();
  }
}

async function addUser() {
  const name = prompt("Nombre del nuevo usuario:");
  if (!name || !name.trim()) return;
  await api("/api/users", {
    method: "POST",
    body: JSON.stringify({ name: name.trim(), currentUser: currentUser() })
  });
  await loadUsers();
  els.currentUserSelect.value = name.trim().toUpperCase();
  rememberCurrentUser();
}

function renderCustomers() {
  els.customersList.innerHTML = "";
  state.customers.forEach(customer => {
    const option = document.createElement("option");
    option.value = customer.name;
    option.label = [customer.saleType, customer.phone, customer.address].filter(Boolean).join(" - ");
    els.customersList.append(option);
  });
}

function selectedCustomer() {
  const typed = els.customer.value.trim().toLowerCase();
  if (!typed) return null;
  return state.customers.find(customer => customer.name.trim().toLowerCase() === typed) || null;
}

function fillCustomerData() {
  const customer = selectedCustomer();
  if (!customer) return;
  els.phone.value = customer.phone || "";
  els.address.value = customer.address || "";
  els.saleType.value = orderSaleType(customer);
}

function renderSummary(orders) {
  els.countProvisional.textContent = orders.filter(order => order.status === "Provisorio").length;
  els.countNew.textContent = orders.filter(order => order.status === "Nuevo").length;
  els.countPreparing.textContent = orders.filter(order => order.status === "Preparado").length;
  els.countReady.textContent = orders.filter(order => order.status === "Despachado").length;
  els.countWholesale.textContent = orders.filter(order => orderSaleType(order) === "Mayorista").length;
  els.countRetail.textContent = orders.filter(order => orderSaleType(order) === "Minorista").length;
}

function renderLoadingState() {
  [
    els.countProvisional,
    els.countNew,
    els.countPreparing,
    els.countReady,
    els.countWholesale,
    els.countRetail,
    els.routeCount,
    els.routeHigh
  ].forEach(element => {
    element.textContent = "...";
  });
  els.routeNext.textContent = "...";
  els.ordersList.innerHTML = '<div class="empty">Cargando pedidos...</div>';
  els.routeList.innerHTML = '<div class="empty">Cargando entregas...</div>';
}

function matchesOrder(order, text) {
  const haystack = [
    order.number,
    order.customer,
    order.phone,
    order.address,
    orderSaleType(order),
    order.deliveryType,
    order.payment,
    orderPriority(order),
    orderPrepDate(order),
    orderScheduledTime(order),
    orderRouteVehicle(order),
    orderDetail(order),
    order.notes
  ].join(" ").toLowerCase();
  return haystack.includes(text);
}

function filteredOrders() {
  const text = els.search.value.trim().toLowerCase();
  const prepDate = els.prepDateFilter.value;
  const status = els.statusFilter.value;
  const saleType = els.saleTypeFilter.value;
  return state.orders.filter(order => {
    const dateOk = !prepDate || orderPrepDate(order) === prepDate;
    const statusOk = !status || order.status === status;
    const saleTypeOk = !saleType || orderSaleType(order) === saleType;
    const textOk = !text || matchesOrder(order, text);
    return dateOk && statusOk && saleTypeOk && textOk;
  });
}

function render() {
  renderSummary(state.orders);
  const orders = filteredOrders();
  els.ordersList.innerHTML = "";

  if (!orders.length) {
    els.ordersList.innerHTML = '<div class="empty">No hay pedidos para mostrar.</div>';
    return;
  }

  orders.sort(compareOrders).forEach(order => {
    const card = document.createElement("article");
    card.className = "order-card";
    card.dataset.status = order.status;
    card.dataset.priority = orderPriority(order);
    card.dataset.saleType = orderSaleType(order);
    const timeText = orderScheduledTime(order) ? ` | Horario: ${escapeHtml(orderScheduledTime(order))}` : "";
    const vehicleText = order.deliveryType === "DELIVERY" ? ` | ${escapeHtml(orderRouteVehicle(order))}` : "";
    const trace = orderMovements(order).map(movement => `
      <div class="trace-item">
        <strong>${escapeHtml(movement.user)}</strong> - ${escapeHtml(movement.action)}
        <span>${escapeHtml(dateTime(movement.createdAt))}</span>
        ${movement.details ? `<small>${escapeHtml(movement.details)}</small>` : ""}
      </div>
    `).join("");

    card.innerHTML = `
      <div class="order-top">
        <div class="order-main">
          <div class="order-line">
            <h3 class="order-title">#${order.number} - ${escapeHtml(order.customer)}</h3>
            <span class="sale-type-banner">${escapeHtml(orderSaleType(order))}</span>
            <span class="status-pill">${escapeHtml(order.status)}</span>
            <span class="priority-pill">${escapeHtml(orderPriority(order))}</span>
          </div>
          <div class="order-meta">${escapeHtml(order.deliveryType)} | ${escapeHtml(formatDate(orderPrepDate(order)))}${timeText}${vehicleText}${order.phone ? ` | Tel: ${escapeHtml(order.phone)}` : ""}${order.address ? ` | ${escapeHtml(order.address)}` : ""}</div>
        </div>
        <div class="card-actions">
          ${nextStatusButton(order)}
          <button class="ghost toggle-detail" type="button">Ver detalle</button>
          <button class="ghost print-order" type="button">Ticket</button>
          <button class="ghost edit-order" type="button">Editar</button>
        </div>
      </div>
      <div class="order-expanded" hidden>
        <div class="order-detail">${escapeHtml(orderDetail(order)).replaceAll("\n", "<br>")}</div>
        ${order.notes ? `<div class="order-notes">Nota: ${escapeHtml(order.notes)}</div>` : ""}
        <div class="trace-box">
          <h4>Trazabilidad</h4>
          ${trace || '<div class="trace-empty">Sin movimientos registrados todavia.</div>'}
        </div>
      </div>
    `;

    card.querySelector(".edit-order").addEventListener("click", () => fillForm(order));
    card.querySelector(".print-order").addEventListener("click", () => printTicket(order));
    card.querySelector(".toggle-detail").addEventListener("click", event => {
      const expanded = card.querySelector(".order-expanded");
      expanded.hidden = !expanded.hidden;
      event.currentTarget.textContent = expanded.hidden ? "Ver detalle" : "Ocultar";
    });
    const nextButton = card.querySelector(".next-status");
    if (nextButton) {
      nextButton.addEventListener("click", () => quickStatus(order));
    }
    els.ordersList.append(card);
  });
}

function orderMovements(order) {
  return state.movements
    .filter(movement => movement.orderId === order.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function deliveryOrders() {
  const date = els.deliveryDateFilter.value;
  const vehicle = els.deliveryVehicleFilter.value;
  const status = els.deliveryStatusFilter.value;
  return state.orders
    .filter(order => order.deliveryType === "DELIVERY" && order.address && !["Provisorio", "Despachado"].includes(order.status))
    .filter(order => !date || orderPrepDate(order) === date)
    .filter(order => !vehicle || orderRouteVehicle(order) === vehicle)
    .filter(order => !status || order.status === status)
    .sort(compareOrders);
}

function renderDelivery() {
  const orders = deliveryOrders();
  els.routeCount.textContent = orders.length;
  els.routeHigh.textContent = orders.filter(order => orderPriority(order) === "Alta").length;
  els.routeNext.textContent = orders.find(order => orderScheduledTime(order))?.scheduledTime || "-";
  els.routeList.innerHTML = "";

  if (!orders.length) {
    els.routeList.innerHTML = '<div class="empty">No hay entregas pendientes con direccion.</div>';
    return;
  }

  orders.forEach((order, index) => {
    const item = document.createElement("article");
    item.className = "route-stop";
    item.dataset.priority = orderPriority(order);
    item.dataset.saleType = orderSaleType(order);
    item.innerHTML = `
      <div class="route-top">
        <div class="route-number">${index + 1}</div>
        <div class="route-body">
          <div class="route-line">
            <div class="route-title">#${order.number} - ${escapeHtml(order.customer)}</div>
            <span class="sale-type-banner">${escapeHtml(orderSaleType(order))}</span>
            <span class="priority-pill">${escapeHtml(orderPriority(order))}</span>
          </div>
          <div class="route-address">${escapeHtml(order.address)} | ${escapeHtml(orderRouteVehicle(order))} | ${escapeHtml(order.status)} | ${escapeHtml(formatDate(orderPrepDate(order)))}${orderScheduledTime(order) ? ` | ${escapeHtml(orderScheduledTime(order))}` : ""}${order.phone ? ` | Tel: ${escapeHtml(order.phone)}` : ""}</div>
        </div>
        <div class="route-actions">
          <select class="route-vehicle" aria-label="Vehiculo">
            <option${orderRouteVehicle(order) === "Sin asignar" ? " selected" : ""}>Sin asignar</option>
            <option${orderRouteVehicle(order) === "Camion" ? " selected" : ""}>Camion</option>
            <option${orderRouteVehicle(order) === "Camioneta" ? " selected" : ""}>Camioneta</option>
          </select>
          <button class="ghost route-toggle" type="button">Ver detalle</button>
          <button class="primary route-dispatch" type="button">Despachado</button>
          <button class="ghost route-ticket" type="button">Ticket</button>
        </div>
      </div>
      <div class="route-expanded" hidden>
        <div class="route-detail">${escapeHtml(orderDetail(order)).replaceAll("\n", "<br>")}</div>
      </div>
    `;
    item.querySelector(".route-vehicle").addEventListener("change", event => assignVehicle(order, event.target.value));
    item.querySelector(".route-toggle").addEventListener("click", event => {
      const expanded = item.querySelector(".route-expanded");
      expanded.hidden = !expanded.hidden;
      event.currentTarget.textContent = expanded.hidden ? "Ver detalle" : "Ocultar";
    });
    item.querySelector(".route-dispatch").addEventListener("click", () => markDispatched(order));
    item.querySelector(".route-ticket").addEventListener("click", () => printTicket(order));
    els.routeList.append(item);
  });
}

function showModule(name) {
  const isDelivery = name === "delivery";
  const modules = [
    ["orders", els.ordersModule],
    ["delivery", els.deliveryModule]
  ];
  modules.forEach(([moduleName, element]) => {
    const isActive = moduleName === name;
    element.hidden = !isActive;
    element.classList.toggle("active-module", isActive);
    element.style.display = isActive ? "" : "none";
  });
  els.ordersViewBtn.className = !isDelivery ? "primary" : "ghost";
  els.deliveryViewBtn.className = isDelivery ? "primary" : "ghost";
  els.newBtn.hidden = isDelivery;
  els.moduleTitle.textContent = isDelivery ? "Delivery" : "Pedidos";
  if (isDelivery) renderDelivery();
  window.scrollTo(0, 0);
}

async function markDispatched(order) {
  await api(`/api/orders/${order.id}`, {
    method: "PUT",
    body: JSON.stringify(withAudit({ ...order, detail: orderDetail(order), saleType: orderSaleType(order), priority: orderPriority(order), prepDate: orderPrepDate(order), scheduledTime: orderScheduledTime(order), routeVehicle: orderRouteVehicle(order), status: "Despachado" }, "Despachado desde delivery"))
  });
  await loadOrders();
  await loadMovements();
}

async function assignVehicle(order, routeVehicle) {
  await api(`/api/orders/${order.id}`, {
    method: "PUT",
    body: JSON.stringify(withAudit({ ...order, detail: orderDetail(order), saleType: orderSaleType(order), priority: orderPriority(order), prepDate: orderPrepDate(order), scheduledTime: orderScheduledTime(order), routeVehicle }, "Vehiculo asignado"))
  });
  await loadOrders();
  await loadMovements();
}

function printRoute() {
  const orders = deliveryOrders();
  const vehicle = els.deliveryVehicleFilter.value || "Todos los vehiculos";
  const route = window.open("", "recorrido-delivery", "width=760,height=900");
  if (!route) {
    alert("El navegador bloqueo la ventana de impresion.");
    return;
  }

  const stops = orders.map((order, index) => `
    <section class="stop">
      <div class="num">${index + 1}</div>
      <div>
        <h2>#${order.number} - ${escapeHtml(order.customer)}</h2>
        <p><strong>Direccion:</strong> ${escapeHtml(order.address)}</p>
        <p><strong>Telefono:</strong> ${escapeHtml(order.phone || "")}</p>
        <p><strong>Vehiculo:</strong> ${escapeHtml(orderRouteVehicle(order))} | <strong>Cliente:</strong> ${escapeHtml(orderSaleType(order))} | <strong>Prioridad:</strong> ${escapeHtml(orderPriority(order))}</p>
        <p><strong>Fecha:</strong> ${escapeHtml(formatDate(orderPrepDate(order)))}${orderScheduledTime(order) ? ` | <strong>Horario:</strong> ${escapeHtml(orderScheduledTime(order))}` : ""}</p>
        <p class="detail">${escapeHtml(orderDetail(order))}</p>
        ${order.notes ? `<p><strong>Notas:</strong> ${escapeHtml(order.notes)}</p>` : ""}
      </div>
    </section>
  `).join("");

  route.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Recorrido delivery</title>
        <style>
          body { margin: 0; padding: 18px; color: #111; font-family: Arial, Helvetica, sans-serif; }
          h1 { margin: 0 0 4px; font-size: 24px; }
          .meta { margin: 0 0 16px; color: #444; }
          .stop { display: grid; grid-template-columns: 44px 1fr; gap: 12px; border: 1px solid #222; border-radius: 8px; padding: 12px; margin-bottom: 10px; break-inside: avoid; }
          .num { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 999px; background: #111; color: white; font-weight: 900; }
          h2 { margin: 0 0 6px; font-size: 18px; }
          p { margin: 4px 0; font-size: 13px; }
          .detail { white-space: pre-wrap; font-size: 14px; }
          @media print { body { padding: 10mm; } }
        </style>
      </head>
      <body>
        <h1>Recorrido delivery</h1>
        <p class="meta">${dateTime(new Date().toISOString())} | ${escapeHtml(vehicle)} | ${orders.length} entregas</p>
        ${stops || "<p>No hay entregas pendientes.</p>"}
        <script>
          window.addEventListener("load", () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  route.document.close();
}

function mapsAddress(order) {
  return order.address || "";
}

function googleMapsRouteUrl(orders) {
  const addresses = orders.map(mapsAddress).filter(Boolean);
  if (!addresses.length) return "";
  if (addresses.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
  }

  const destination = addresses[addresses.length - 1];
  const waypoints = addresses.slice(0, -1).join("|");
  const params = new URLSearchParams({
    api: "1",
    travelmode: "driving",
    destination
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function openMapsRoute() {
  const orders = deliveryOrders();
  const url = googleMapsRouteUrl(orders);
  if (!url) {
    alert("No hay direcciones para abrir en Google Maps.");
    return;
  }
  window.open(url, "_blank", "noopener");
}

function compareOrders(a, b) {
  const statusRank = { Provisorio: 0, Nuevo: 1, Preparado: 2, Despachado: 3 };
  const priorityRank = { Alta: 0, Media: 1, Baja: 2 };
  const aKey = [
    statusRank[a.status] ?? 3,
    priorityRank[orderPriority(a)] ?? 1,
    orderPrepDate(a),
    orderScheduledTime(a) || "99:99",
    a.createdAt || ""
  ].join("-");
  const bKey = [
    statusRank[b.status] ?? 3,
    priorityRank[orderPriority(b)] ?? 1,
    orderPrepDate(b),
    orderScheduledTime(b) || "99:99",
    b.createdAt || ""
  ].join("-");
  return aKey.localeCompare(bKey);
}

function nextStatusButton(order) {
  const next = {
    Provisorio: "Nuevo",
    Nuevo: "Preparado",
    Preparado: "Despachado"
  }[order.status];
  if (!next) return "";
  const label = order.status === "Provisorio" ? "Confirmar" : `Pasar a ${next}`;
  return `<button class="primary next-status" type="button">${label}</button>`;
}

async function quickStatus(order) {
  const next = {
    Provisorio: "Nuevo",
    Nuevo: "Preparado",
    Preparado: "Despachado"
  }[order.status];
  if (!next) return;
  await api(`/api/orders/${order.id}`, {
    method: "PUT",
    body: JSON.stringify(withAudit({ ...order, detail: orderDetail(order), saleType: orderSaleType(order), priority: orderPriority(order), prepDate: orderPrepDate(order), scheduledTime: orderScheduledTime(order), routeVehicle: orderRouteVehicle(order), status: next }, `Estado cambiado a ${next}`))
  });
  await loadOrders();
  await loadMovements();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function compactPrintText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function summaryOrdersForPrint() {
  const date = els.prepDateFilter.value || todayDate();
  const saleType = els.saleTypeFilter.value;
  return state.orders
    .filter(order => orderPrepDate(order) === date)
    .filter(order => !saleType || orderSaleType(order) === saleType)
    .sort(compareOrders);
}

function printDailySummary() {
  const date = els.prepDateFilter.value || todayDate();
  const saleType = els.saleTypeFilter.value || "Mayorista y minorista";
  const orders = summaryOrdersForPrint();
  if (!orders.length) {
    alert("No hay pedidos para imprimir con esa fecha y filtro.");
    return;
  }

  const totals = {
    all: orders.length,
    wholesale: orders.filter(order => orderSaleType(order) === "Mayorista").length,
    retail: orders.filter(order => orderSaleType(order) === "Minorista").length,
    delivery: orders.filter(order => order.deliveryType === "DELIVERY").length,
    pickup: orders.filter(order => order.deliveryType === "RETIRO").length
  };
  const rows = orders.map(order => `
    <tr class="${orderSaleType(order).toLowerCase()}">
      <td class="num">#${escapeHtml(order.number)}</td>
      <td><strong>${escapeHtml(order.customer)}</strong><br>${escapeHtml(order.phone || "")}</td>
      <td>${escapeHtml(orderSaleType(order))}</td>
      <td>${escapeHtml(order.deliveryType || "")}</td>
      <td>${escapeHtml(order.status || "")}</td>
      <td>${escapeHtml(orderPriority(order))}${orderScheduledTime(order) ? `<br>${escapeHtml(orderScheduledTime(order))}` : ""}</td>
      <td>${escapeHtml(compactPrintText(order.address))}</td>
      <td class="detail">${escapeHtml(compactPrintText(orderDetail(order)))}</td>
      <td>${escapeHtml(compactPrintText(order.notes))}</td>
    </tr>
  `).join("");

  const summary = window.open("", "resumen-pedidos", "width=1100,height=760");
  if (!summary) {
    alert("El navegador bloqueo la ventana de impresion.");
    return;
  }
  summary.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Resumen pedidos ${escapeHtml(formatDate(date))}</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; }
          body { padding: 0; }
          .sheet {
            width: 283mm;
            min-height: 196mm;
            padding: 0;
            transform-origin: top left;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            border-bottom: 2px solid #111;
            padding-bottom: 5px;
            margin-bottom: 6px;
          }
          h1 { margin: 0; font-size: 18px; text-transform: uppercase; }
          .meta { margin: 2px 0 0; font-size: 10px; color: #333; }
          .totals { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
          .totals span { border: 1px solid #111; border-radius: 4px; padding: 3px 5px; font-size: 10px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; line-height: 1.15; }
          th, td { border: 1px solid #333; padding: 2px 3px; vertical-align: top; overflow-wrap: anywhere; }
          th { background: #e9eeee; text-transform: uppercase; font-size: 7.5px; }
          .num { width: 8mm; font-weight: 800; text-align: center; }
          th:nth-child(1) { width: 9mm; }
          th:nth-child(2) { width: 34mm; }
          th:nth-child(3) { width: 18mm; }
          th:nth-child(4) { width: 16mm; }
          th:nth-child(5) { width: 17mm; }
          th:nth-child(6) { width: 18mm; }
          th:nth-child(7) { width: 42mm; }
          th:nth-child(8) { width: 92mm; }
          th:nth-child(9) { width: 37mm; }
          tr.mayorista td { border-top: 2px solid #174f91; }
          tr.minorista td { border-top: 2px solid #0f6b5f; }
          .detail { font-size: 8px; }
          @page { size: A4 landscape; margin: 7mm; }
          @media print {
            body { margin: 0; }
            .sheet { page-break-after: avoid; }
          }
        </style>
      </head>
      <body>
        <main class="sheet" id="sheet">
          <header>
            <div>
              <h1>Resumen de pedidos</h1>
              <p class="meta">Fecha: ${escapeHtml(formatDate(date))} | Filtro: ${escapeHtml(saleType)} | Impreso: ${escapeHtml(dateTime(new Date().toISOString()))}</p>
            </div>
            <div class="totals">
              <span>Total: ${totals.all}</span>
              <span>Mayorista: ${totals.wholesale}</span>
              <span>Minorista: ${totals.retail}</span>
              <span>Delivery: ${totals.delivery}</span>
              <span>Retiro: ${totals.pickup}</span>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th>Nro</th>
                <th>Cliente / Tel</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Prioridad / Hora</th>
                <th>Direccion</th>
                <th>Detalle</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </main>
        <script>
          window.addEventListener("load", () => {
            const sheet = document.getElementById("sheet");
            const maxHeight = 196 * 3.78;
            const scale = Math.min(1, maxHeight / sheet.scrollHeight);
            sheet.style.transform = "scale(" + scale + ")";
            sheet.style.width = (283 / scale) + "mm";
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  summary.document.close();
}

function printTicket(order) {
  const ticket = window.open("", "ticket", "width=420,height=720");
  if (!ticket) {
    alert("El navegador bloqueo la ventana de impresion.");
    return;
  }

  ticket.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Ticket pedido #${order.number}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; }
          .ticket { width: 80mm; padding: 8mm 5mm; }
          h1 { margin: 0 0 6px; text-align: center; font-size: 20px; }
          .sale-type { margin: 0 0 8px; border: 2px solid #111; padding: 6px; text-align: center; font-size: 17px; font-weight: 900; text-transform: uppercase; }
          .mayorista { border-style: solid; }
          .minorista { border-style: dashed; }
          .number { margin: 0 0 10px; text-align: center; font-size: 16px; font-weight: 700; }
          .line { border-top: 1px dashed #111; margin: 9px 0; }
          .row { margin: 4px 0; font-size: 13px; }
          .label { font-weight: 700; }
          .detail { white-space: pre-wrap; font-size: 15px; line-height: 1.35; }
          .notes { white-space: pre-wrap; font-size: 13px; }
          @media print {
            @page { size: 80mm auto; margin: 0; }
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <main class="ticket">
          <h1>Pedido</h1>
          <p class="sale-type ${orderSaleType(order).toLowerCase()}">${escapeHtml(orderSaleType(order))}</p>
          <p class="number">#${order.number}</p>
          <div class="line"></div>
          <p class="row"><span class="label">Cliente:</span> ${escapeHtml(order.customer)}</p>
          ${order.phone ? `<p class="row"><span class="label">Telefono:</span> ${escapeHtml(order.phone)}</p>` : ""}
          <p class="row"><span class="label">Tipo cliente:</span> ${escapeHtml(orderSaleType(order))}</p>
          <p class="row"><span class="label">Tipo:</span> ${escapeHtml(order.deliveryType)}</p>
          ${order.address ? `<p class="row"><span class="label">Direccion:</span> ${escapeHtml(order.address)}</p>` : ""}
          ${order.payment ? `<p class="row"><span class="label">Pago:</span> ${escapeHtml(order.payment)}</p>` : ""}
          <p class="row"><span class="label">Estado:</span> ${escapeHtml(order.status)}</p>
          <p class="row"><span class="label">Prioridad:</span> ${escapeHtml(orderPriority(order))}</p>
          <p class="row"><span class="label">Fecha:</span> ${escapeHtml(formatDate(orderPrepDate(order)))}</p>
          ${orderScheduledTime(order) ? `<p class="row"><span class="label">Horario:</span> ${escapeHtml(orderScheduledTime(order))}</p>` : ""}
          ${order.deliveryType === "DELIVERY" ? `<p class="row"><span class="label">Vehiculo:</span> ${escapeHtml(orderRouteVehicle(order))}</p>` : ""}
          <p class="row"><span class="label">Cargado:</span> ${dateTime(order.createdAt)}</p>
          <div class="line"></div>
          <div class="detail">${escapeHtml(orderDetail(order))}</div>
          ${order.notes ? `<div class="line"></div><div class="notes"><span class="label">Notas:</span><br>${escapeHtml(order.notes)}</div>` : ""}
        </main>
        <script>
          window.addEventListener("load", () => {
            window.focus();
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  ticket.document.close();
}

els.form.addEventListener("submit", async event => {
  event.preventDefault();
  setMessage("Guardando...");
  const payload = collectForm();

  try {
    if (state.editingId) {
      await api(`/api/orders/${state.editingId}`, {
        method: "PUT",
        body: JSON.stringify(withAudit(payload, "Pedido editado"))
      });
      setMessage("Pedido actualizado.");
    } else {
      await api("/api/orders", {
        method: "POST",
        body: JSON.stringify(withAudit(payload, "Pedido creado"))
      });
      setMessage("Pedido guardado.");
    }
    resetForm();
    await loadCustomers();
    await loadOrders();
    await loadMovements();
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.deleteBtn.addEventListener("click", async () => {
  if (!state.editingId) return;
  const ok = confirm("Eliminar este pedido?");
  if (!ok) return;
  await api(`/api/orders/${state.editingId}`, {
    method: "DELETE",
    body: JSON.stringify(withAudit({}, "Pedido eliminado"))
  });
  resetForm();
  await loadOrders();
  await loadMovements();
});

els.clearBtn.addEventListener("click", resetForm);
els.newBtn.addEventListener("click", resetForm);
els.refreshBtn.addEventListener("click", refreshAll);
els.currentUserSelect.addEventListener("change", rememberCurrentUser);
els.addUserBtn.addEventListener("click", addUser);
els.ordersViewBtn.addEventListener("click", () => showModule("orders"));
els.deliveryViewBtn.addEventListener("click", () => showModule("delivery"));
els.deliveryStatusFilter.addEventListener("change", renderDelivery);
els.deliveryDateFilter.addEventListener("change", renderDelivery);
els.deliveryVehicleFilter.addEventListener("change", renderDelivery);
els.mapsRouteBtn.addEventListener("click", openMapsRoute);
els.printRouteBtn.addEventListener("click", printRoute);
els.deliveryType.addEventListener("change", () => applyPriorityRule());
els.customer.addEventListener("change", fillCustomerData);
els.customer.addEventListener("blur", fillCustomerData);
els.search.addEventListener("input", render);
els.prepDateFilter.addEventListener("change", render);
els.saleTypeFilter.addEventListener("change", render);
els.statusFilter.addEventListener("change", render);
els.printSummaryBtn.addEventListener("click", printDailySummary);

resetForm();
els.prepDateFilter.value = todayDate();
els.deliveryDateFilter.value = todayDate();
refreshAll().catch(error => setMessage(error.message, true));

