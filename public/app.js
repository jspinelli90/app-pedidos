const state = {
  orders: [],
  customers: [],
  users: [],
  movements: [],
  editingId: null,
  editingCustomerId: null
};

const els = {
  currentUserSelect: document.querySelector("#currentUserSelect"),
  addUserBtn: document.querySelector("#addUserBtn"),
  moduleTitle: document.querySelector("#moduleTitle"),
  ordersModule: document.querySelector("#ordersModule"),
  deliveryModule: document.querySelector("#deliveryModule"),
  customersModule: document.querySelector("#customersModule"),
  ordersViewBtn: document.querySelector("#ordersViewBtn"),
  deliveryViewBtn: document.querySelector("#deliveryViewBtn"),
  customersViewBtn: document.querySelector("#customersViewBtn"),
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
  routeList: document.querySelector("#routeList"),
  addCustomerBtn: document.querySelector("#addCustomerBtn"),
  customerCount: document.querySelector("#customerCount"),
  customerWholesaleCount: document.querySelector("#customerWholesaleCount"),
  customerRetailCount: document.querySelector("#customerRetailCount"),
  customerSearch: document.querySelector("#customerSearch"),
  customerTypeFilter: document.querySelector("#customerTypeFilter"),
  customerAgendaList: document.querySelector("#customerAgendaList"),
  customerDialog: document.querySelector("#customerDialog"),
  customerForm: document.querySelector("#customerForm"),
  customerFormTitle: document.querySelector("#customerFormTitle"),
  customerFormMessage: document.querySelector("#customerFormMessage"),
  customerName: document.querySelector("#customerName"),
  customerPhone: document.querySelector("#customerPhone"),
  customerAddress: document.querySelector("#customerAddress"),
  customerSaleType: document.querySelector("#customerSaleType"),
  customerNotes: document.querySelector("#customerNotes"),
  closeCustomerDialogBtn: document.querySelector("#closeCustomerDialogBtn"),
  cancelCustomerBtn: document.querySelector("#cancelCustomerBtn")
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

function orderOrigin(order) {
  return String(order.createdBy || "").trim().toLowerCase() === "cliente" ? "cliente" : "administrativo";
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
  renderCustomerAgenda();
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
  renderCustomerAgenda();
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


function agendaPhoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function customerOrderHistory(customer) {
  const phone = agendaPhoneKey(customer.phone);
  const name = String(customer.name || "").trim().toLowerCase();
  return state.orders
    .filter(order => {
      const samePhone = phone && agendaPhoneKey(order.phone) === phone;
      const sameName = name && String(order.customer || "").trim().toLowerCase() === name;
      return samePhone || sameName;
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function customerSearchText(customer) {
  return [customer.name, customer.phone, customer.address, customer.notes, customer.saleType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function renderCustomerAgenda() {
  if (!els.customerAgendaList) return;
  const search = els.customerSearch.value.trim().toLowerCase();
  const type = els.customerTypeFilter.value;
  const customers = state.customers
    .filter(customer => !search || customerSearchText(customer).includes(search))
    .filter(customer => !type || orderSaleType(customer) === type)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));

  els.customerCount.textContent = state.customers.length;
  els.customerWholesaleCount.textContent = state.customers.filter(customer => orderSaleType(customer) === "Mayorista").length;
  els.customerRetailCount.textContent = state.customers.filter(customer => orderSaleType(customer) === "Minorista").length;
  els.customerAgendaList.innerHTML = "";

  if (!customers.length) {
    els.customerAgendaList.innerHTML = '<div class="empty">No encontramos clientes con esos filtros.</div>';
    return;
  }

  customers.forEach(customer => {
    const history = customerOrderHistory(customer);
    const lastOrder = history[0];
    const whatsapp = whatsappPhone(customer.phone);
    const card = document.createElement("article");
    card.className = "customer-card";
    card.innerHTML = `
      <div class="customer-card-main">
        <div class="customer-avatar">${escapeHtml(String(customer.name || "?").trim().slice(0, 1).toUpperCase())}</div>
        <div class="customer-card-data">
          <div class="customer-title-line">
            <h3>${escapeHtml(customer.name)}</h3>
            <span class="customer-type ${orderSaleType(customer).toLowerCase()}">${escapeHtml(orderSaleType(customer))}</span>
          </div>
          <p><strong>Telefono:</strong> ${escapeHtml(customer.phone || "Sin telefono")}</p>
          <p><strong>Direccion:</strong> ${escapeHtml(customer.address || "Sin direccion")}</p>
          ${customer.notes ? `<p class="customer-notes"><strong>Observaciones:</strong> ${escapeHtml(customer.notes)}</p>` : ""}
          <div class="customer-stats">
            <span>${history.length} ${history.length === 1 ? "pedido" : "pedidos"}</span>
            <span>${lastOrder ? `Ultimo: ${escapeHtml(formatDate(orderPrepDate(lastOrder)))}` : "Sin pedidos registrados"}</span>
          </div>
        </div>
      </div>
      <div class="customer-actions">
        ${whatsapp ? `<a class="ghost button-link customer-whatsapp" href="https://wa.me/${whatsapp}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
        <button class="ghost customer-history-toggle" type="button" ${history.length ? "" : "disabled"}>Historial</button>
        <button class="ghost customer-edit" type="button">Editar</button>
        <button class="danger customer-delete" type="button">Eliminar</button>
        <button class="primary customer-new-order" type="button">Nuevo pedido</button>
      </div>
      <div class="customer-history" hidden>
        <h4>Historial de pedidos</h4>
        ${history.map(order => `
          <div class="customer-history-row">
            <strong>#${escapeHtml(order.number)} - ${escapeHtml(formatDate(orderPrepDate(order)))}</strong>
            <span>${escapeHtml(order.status)} | ${escapeHtml(order.deliveryType || "")}</span>
            <p>${escapeHtml(orderDetail(order) || "Sin detalle")}</p>
          </div>
        `).join("")}
      </div>
    `;
    card.querySelector(".customer-edit").addEventListener("click", () => openCustomerDialog(customer));
    card.querySelector(".customer-delete").addEventListener("click", () => deleteCustomer(customer));
    card.querySelector(".customer-new-order").addEventListener("click", () => newOrderForCustomer(customer));
    const historyButton = card.querySelector(".customer-history-toggle");
    historyButton.addEventListener("click", () => {
      const historyPanel = card.querySelector(".customer-history");
      historyPanel.hidden = !historyPanel.hidden;
      historyButton.textContent = historyPanel.hidden ? "Historial" : "Ocultar historial";
    });
    els.customerAgendaList.append(card);
  });
}

function setCustomerFormMessage(text, isError = false) {
  els.customerFormMessage.textContent = text;
  els.customerFormMessage.style.color = isError ? "#b83232" : "#0f6b5f";
}

function openCustomerDialog(customer = null) {
  state.editingCustomerId = customer ? customer.id : null;
  els.customerForm.reset();
  els.customerFormTitle.textContent = customer ? "Editar cliente" : "Nuevo cliente";
  els.customerName.value = customer?.name || "";
  els.customerPhone.value = customer?.phone || "";
  els.customerAddress.value = customer?.address || "";
  els.customerSaleType.value = customer ? orderSaleType(customer) : "Minorista";
  els.customerNotes.value = customer?.notes || "";
  setCustomerFormMessage("");
  if (typeof els.customerDialog.showModal === "function") els.customerDialog.showModal();
  else els.customerDialog.setAttribute("open", "");
  els.customerName.focus();
}

function closeCustomerDialog() {
  state.editingCustomerId = null;
  if (typeof els.customerDialog.close === "function") els.customerDialog.close();
  else els.customerDialog.removeAttribute("open");
}

async function saveCustomer(event) {
  event.preventDefault();
  const payload = {
    name: els.customerName.value,
    phone: els.customerPhone.value,
    address: els.customerAddress.value,
    saleType: els.customerSaleType.value,
    notes: els.customerNotes.value,
    currentUser: currentUser()
  };
  const path = state.editingCustomerId ? `/api/customers/${state.editingCustomerId}` : "/api/customers";
  setCustomerFormMessage("Guardando...");
  try {
    await api(path, { method: state.editingCustomerId ? "PUT" : "POST", body: JSON.stringify(payload) });
    closeCustomerDialog();
    await loadCustomers();
  } catch (error) {
    setCustomerFormMessage(error.message, true);
  }
}

function newOrderForCustomer(customer) {
  showModule("orders");
  resetForm();
  els.customer.value = customer.name || "";
  els.phone.value = customer.phone || "";
  els.address.value = customer.address || "";
  els.saleType.value = orderSaleType(customer);
  els.notes.value = customer.notes || "";
  els.detail.focus();
}

async function deleteCustomer(customer) {
  const ok = confirm(`Eliminar a ${customer.name} de la agenda?\n\nSus pedidos historicos se conservaran.`);
  if (!ok) return;
  try {
    await api(`/api/customers/${customer.id}`, { method: "DELETE" });
    await loadCustomers();
  } catch (error) {
    alert(error.message);
  }
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
    els.routeHigh,
    els.customerCount,
    els.customerWholesaleCount,
    els.customerRetailCount
  ].forEach(element => {
    element.textContent = "...";
  });
  els.routeNext.textContent = "...";
  els.ordersList.innerHTML = '<div class="empty">Cargando pedidos...</div>';
  els.routeList.innerHTML = '<div class="empty">Cargando entregas...</div>';
  els.customerAgendaList.innerHTML = '<div class="empty">Cargando clientes...</div>';
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
    card.dataset.origin = orderOrigin(order);
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
            <span class="origin-badge">${orderOrigin(order) === "cliente" ? "CLIENTE ONLINE" : "CARGA INTERNA"}</span>
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
    .filter(order => order.deliveryType === "DELIVERY" && order.status !== "Despachado")
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
    els.routeList.innerHTML = '<div class="empty">No hay entregas pendientes para los filtros seleccionados.</div>';
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
          <div class="route-address">${escapeHtml(order.address || "FALTA CARGAR DIRECCION")} | ${escapeHtml(orderRouteVehicle(order))} | ${escapeHtml(order.status)} | ${escapeHtml(formatDate(orderPrepDate(order)))}${orderScheduledTime(order) ? ` | ${escapeHtml(orderScheduledTime(order))}` : ""}${order.phone ? ` | Tel: ${escapeHtml(order.phone)}` : ""}</div>
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
  const isCustomers = name === "customers";
  const modules = [
    ["orders", els.ordersModule],
    ["delivery", els.deliveryModule],
    ["customers", els.customersModule]
  ];
  modules.forEach(([moduleName, element]) => {
    const isActive = moduleName === name;
    element.hidden = !isActive;
    element.classList.toggle("active-module", isActive);
    element.style.display = isActive ? "" : "none";
  });
  els.ordersViewBtn.className = !isDelivery && !isCustomers ? "primary" : "ghost";
  els.deliveryViewBtn.className = isDelivery ? "primary" : "ghost";
  els.customersViewBtn.className = isCustomers ? "primary" : "ghost";
  els.newBtn.hidden = isDelivery || isCustomers;
  els.moduleTitle.textContent = isDelivery ? "Delivery" : isCustomers ? "Clientes" : "Pedidos";
  if (isDelivery) renderDelivery();
  if (isCustomers) renderCustomerAgenda();
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
  const routeDate = els.deliveryDateFilter.value ? formatDate(els.deliveryDateFilter.value) : "Todas las fechas";
  const route = window.open("", "recorrido-delivery", "width=760,height=900");
  if (!route) {
    alert("El navegador bloqueo la ventana de impresion.");
    return;
  }

  const density = orders.length > 12 ? "very-compact" : orders.length > 8 ? "compact" : "comfortable";
  const stops = orders.map((order, index) => `
    <section class="stop">
      <div class="num">${index + 1}</div>
      <div class="order-data">
        <h2>#${order.number} - ${escapeHtml(order.customer)}</h2>
        <p><strong>Direccion:</strong> ${escapeHtml(order.address || "Sin direccion")}</p>
        <p><strong>Tel:</strong> ${escapeHtml(order.phone || "-")} | <strong>Horario:</strong> ${escapeHtml(orderScheduledTime(order) || "-")} | <strong>Vehiculo:</strong> ${escapeHtml(orderRouteVehicle(order))}</p>
        <p class="detail"><strong>Pedido:</strong> ${escapeHtml(orderDetail(order) || "-")}${order.notes ? ` | <strong>Notas:</strong> ${escapeHtml(order.notes)}` : ""}</p>
      </div>
      <div class="signature">
        <span>Recepcion conforme - firma y aclaracion</span>
        <div class="signature-line"></div>
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
          @page { size: A4 landscape; margin: 5mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; width: 287mm; height: 200mm; color: #111; font-family: Arial, Helvetica, sans-serif; overflow: hidden; }
          body { padding: 0; }
          .route-sheet { display: grid; grid-template-rows: 12mm minmax(0, 1fr); width: 100%; height: 100%; }
          .route-head { display: flex; align-items: center; justify-content: space-between; gap: 8mm; border-bottom: 1.5px solid #111; }
          h1 { margin: 0; font-size: 16pt; }
          .meta { margin: 0; color: #333; font-size: 9pt; text-align: right; }
          .stops { display: grid; grid-template-rows: repeat(${Math.max(orders.length, 1)}, minmax(0, 1fr)); min-height: 0; padding-top: 2mm; }
          .stop { display: grid; grid-template-columns: 9mm minmax(0, 1fr) 56mm; gap: 2.5mm; min-height: 0; border: 1px solid #444; border-bottom: 0; padding: 1.5mm 2mm; break-inside: avoid; overflow: hidden; }
          .stop:last-child { border-bottom: 1px solid #444; }
          .num { display: grid; place-items: center; align-self: center; width: 7mm; height: 7mm; border-radius: 50%; background: #111; color: white; font-size: 9pt; font-weight: 900; }
          .order-data { min-width: 0; align-self: center; overflow: hidden; }
          h2 { margin: 0 0 0.7mm; font-size: 10pt; line-height: 1.05; }
          p { margin: 0.4mm 0; font-size: 8pt; line-height: 1.08; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .detail { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
          .signature { display: flex; flex-direction: column; justify-content: space-between; min-width: 0; padding-left: 2.5mm; border-left: 1px dashed #777; color: #444; font-size: 7.5pt; }
          .signature-line { width: 100%; margin-bottom: 1mm; border-bottom: 1px solid #111; }
          .compact h2 { font-size: 9pt; }
          .compact p { font-size: 7pt; }
          .compact .stop { padding-top: 1mm; padding-bottom: 1mm; }
          .compact .detail { -webkit-line-clamp: 1; }
          .very-compact h2 { margin-bottom: 0.3mm; font-size: 8pt; }
          .very-compact p { margin: 0.2mm 0; font-size: 6.2pt; }
          .very-compact .stop { padding-top: 0.6mm; padding-bottom: 0.6mm; }
          .very-compact .detail { -webkit-line-clamp: 1; }
          .very-compact .signature { font-size: 6.5pt; }
          @media print { html, body { width: 287mm; height: 200mm; } }
        </style>
      </head>
      <body>
        <main class="route-sheet ${density}">
          <header class="route-head">
            <h1>Recorrido delivery</h1>
            <p class="meta">Reparto: ${escapeHtml(routeDate)} | ${escapeHtml(vehicle)} | ${orders.length} entregas</p>
          </header>
          <div class="stops">${stops || "<p>No hay entregas pendientes.</p>"}</div>
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
  const label = order.status === "Provisorio"
    ? (whatsappPhone(order.phone) ? "Confirmar y avisar" : "Confirmar (sin WhatsApp)")
    : `Pasar a ${next}`;
  return `<button class="primary next-status" type="button">${label}</button>`;
}

function whatsappPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^01115\d{8}$/.test(digits)) return `54911${digits.slice(5)}`;
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) return `549${digits.slice(2).replace(/^0/, "")}`;
  digits = digits.replace(/^0/, "");
  if (digits.length === 10) return `549${digits}`;
  return digits;
}

function whatsappConfirmationUrl(order) {
  const phone = whatsappPhone(order.phone);
  if (!phone) return "";
  const message = [
    `Hola ${order.customer}, tu pedido #${order.number} fue confirmado.`,
    `Fecha: ${formatDate(orderPrepDate(order))}.`,
    "Nos vamos a comunicar si necesitamos alguna aclaracion. Muchas gracias."
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function quickStatus(order) {
  const next = {
    Provisorio: "Nuevo",
    Nuevo: "Preparado",
    Preparado: "Despachado"
  }[order.status];
  if (!next) return;
  const shouldNotify = order.status === "Provisorio";
  const whatsappUrl = shouldNotify ? whatsappConfirmationUrl(order) : "";
  let whatsappWindow = null;
  if (whatsappUrl) {
    whatsappWindow = window.open("", "confirmacion-whatsapp");
    if (whatsappWindow) {
      whatsappWindow.opener = null;
      whatsappWindow.document.body.textContent = "Preparando mensaje de confirmacion...";
    }
  }

  try {
    await api(`/api/orders/${order.id}`, {
      method: "PUT",
      body: JSON.stringify(withAudit({ ...order, detail: orderDetail(order), saleType: orderSaleType(order), priority: orderPriority(order), prepDate: orderPrepDate(order), scheduledTime: orderScheduledTime(order), routeVehicle: orderRouteVehicle(order), status: next }, `Estado cambiado a ${next}`))
    });

    if (shouldNotify) {
      if (!whatsappUrl) {
        alert("El pedido fue confirmado, pero no tiene un telefono cargado para avisar por WhatsApp.");
      } else if (whatsappWindow) {
        whatsappWindow.location.href = whatsappUrl;
      } else {
        alert("El pedido fue confirmado. El navegador bloqueo WhatsApp; habilita las ventanas emergentes para poder avisar.");
      }
    }

    await loadOrders();
    await loadMovements();
  } catch (error) {
    if (whatsappWindow) whatsappWindow.close();
    alert(error.message);
  }
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
els.customersViewBtn.addEventListener("click", () => showModule("customers"));
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
els.customerSearch.addEventListener("input", renderCustomerAgenda);
els.customerTypeFilter.addEventListener("change", renderCustomerAgenda);
els.addCustomerBtn.addEventListener("click", () => openCustomerDialog());
els.closeCustomerDialogBtn.addEventListener("click", closeCustomerDialog);
els.cancelCustomerBtn.addEventListener("click", closeCustomerDialog);
els.customerForm.addEventListener("submit", saveCustomer);

resetForm();
els.prepDateFilter.value = todayDate();
els.deliveryDateFilter.value = todayDate();
refreshAll().catch(error => setMessage(error.message, true));
