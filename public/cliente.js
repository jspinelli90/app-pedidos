const form = document.querySelector("#clientOrderForm");
const message = document.querySelector("#clientMessage");
const prepDate = document.querySelector("#clientPrepDate");
const customer = document.querySelector("#clientCustomer");
const phone = document.querySelector("#clientPhone");
const deliveryType = document.querySelector("#clientDeliveryType");
const deliveryTypeSection = document.querySelector("#clientDeliveryTypeSection");
const fulfillmentNoticeText = document.querySelector("#clientFulfillmentNoticeText");
const addressSection = document.querySelector("#clientAddressSection");
const address = document.querySelector("#clientAddress");
const district = document.querySelector("#clientDistrict");
const locality = document.querySelector("#clientLocality");
const cabaAddressSection = document.querySelector("#clientCabaAddressSection");
const cabaNeighborhood = document.querySelector("#clientCabaNeighborhood");
const cabaStreet = document.querySelector("#clientCabaStreet");
const cabaStreetNumber = document.querySelector("#clientCabaStreetNumber");
const cabaAddressExtra = document.querySelector("#clientCabaAddressExtra");
const successBox = document.querySelector("#clientSuccess");
const cutoffNotice = document.querySelector("#clientCutoffNotice");
const cutoffText = document.querySelector("#clientCutoffText");
const clientDocuments = document.querySelector("#clientDocuments");
const clientPriceListsGroup = document.querySelector("#clientPriceListsGroup");
const clientOffersGroup = document.querySelector("#clientOffersGroup");
const clientPriceLists = document.querySelector("#clientPriceLists");
const clientOffers = document.querySelector("#clientOffers");
const isWholesaleOrder = window.location.pathname.endsWith("/pedido-mayorista.html");
const publicSaleType = isWholesaleOrder ? "Mayorista" : "Minorista";

function applyOrderAudience() {
  if (!isWholesaleOrder) return;
  document.title = "Pedido mayorista | San Cayetano Carnes";
  document.querySelector("#clientBrandEyebrow").textContent = "Pedidos mayoristas";
  document.querySelector("#clientBrandTitle").textContent = "Hacé tu pedido mayorista";
  document.querySelector("#clientBrandIntro").textContent =
    "Este formulario carga exclusivamente pedidos de clientes mayoristas.";
  document.querySelector("#clientAudienceNotice").setAttribute(
    "aria-label",
    "Formulario exclusivo para pedidos mayoristas"
  );
  document.querySelector("#clientAudienceNoticeText").textContent =
    "Pedido exclusivo para clientes mayoristas.";
  document.querySelector("#clientSubmitButton").textContent =
    "Enviar pedido mayorista";
}

let orderDatePolicy = null;

async function loadClientDocuments() {
  try {
    const response = await fetch("/api/public-client-documents", { cache: "no-store" });
    if (!response.ok) return;
    const documents = await response.json();
    renderClientDocumentLinks(clientPriceLists, documents["price-list"], "primary");
    renderClientDocumentLinks(clientOffers, documents.offers, "offers-button");
    clientPriceListsGroup.hidden = documents["price-list"].length === 0;
    clientOffersGroup.hidden = documents.offers.length === 0;
    clientDocuments.hidden = clientPriceListsGroup.hidden && clientOffersGroup.hidden;
  } catch {
    clientDocuments.hidden = true;
  }
}

function renderClientDocumentLinks(container, documents, className) {
  container.innerHTML = "";
  documents.forEach(document => {
    const link = documentNode("a", `${className} button-link`, document.name);
    link.href = `/api/public-client-documents/${document.id || document.type}`;
    link.target = "_blank";
    link.rel = "noopener";
    container.append(link);
  });
}

function documentNode(tag, className, text) {
  const element = window.document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

const LOCALITIES_BY_DISTRICT = {
  "Tigre": [
    "Benavidez",
    "Dique Lujan",
    "Don Torcuato",
    "El Talar",
    "General Pacheco",
    "Nordelta",
    "Ricardo Rojas",
    "Rincon de Milberg",
    "Tigre",
    "Troncos del Talar"
  ],
  "San Fernando": [
    "San Fernando",
    "Victoria",
    "Virreyes",
    "Islas del Delta del Parana"
  ],
  "San Isidro": [
    "Acassuso",
    "Beccar",
    "Boulogne Sur Mer",
    "Martinez",
    "San Isidro",
    "Villa Adelina"
  ],
  "Vicente Lopez": [
    "Carapachay",
    "Florida",
    "Florida Oeste",
    "La Lucila",
    "Munro",
    "Olivos",
    "Vicente Lopez",
    "Villa Adelina",
    "Villa Martelli"
  ],
  "San Martin": [
    "Barrio Parque General San Martin",
    "Billinghurst",
    "Ciudad Jardin El Libertador",
    "Jose Leon Suarez",
    "Loma Hermosa",
    "San Andres",
    "San Martin",
    "Villa Ballester",
    "Villa Libertad",
    "Villa Lynch",
    "Villa Maipu"
  ]
};

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function isSunday(dateText) {
  return new Date(`${dateText}T12:00:00`).getDay() === 0;
}

function nextWorkingDate(dateText) {
  return isSunday(dateText) ? addDays(dateText, 1) : dateText;
}

function isFriday(dateText) {
  return new Date(`${dateText}T12:00:00`).getDay() === 5;
}

function nextFriday(dateText, includeDate = true) {
  let candidate = includeDate ? dateText : addDays(dateText, 1);
  while (!isFriday(candidate)) candidate = addDays(candidate, 1);
  return candidate;
}

function isCabaDelivery() {
  return deliveryType.value === "DELIVERY_CABA";
}

function localDatePolicy() {
  const now = new Date();
  const today = todayDate();
  const selectedType = deliveryType.value === "RETIRO" ? "RETIRO" : "DELIVERY";
  const cabaDelivery = isCabaDelivery();
  const cutoffHour = selectedType === "DELIVERY" ? 11 : 13;
  const afterCutoff = now.getHours() >= cutoffHour;
  const regularMinDate = nextWorkingDate(afterCutoff ? addDays(today, 1) : today);
  const minDate = cabaDelivery ? nextFriday(today, !(isFriday(today) && afterCutoff)) : regularMinDate;
  return { today, afterCutoff, cutoffHour, deliveryType: selectedType, deliveryZone: cabaDelivery ? "CABA_VIERNES" : "REGULAR", minDate };
}

function applyDatePolicy(policy, forceValue = false) {
  orderDatePolicy = policy;
  policy.minDate = policy.deliveryZone === "CABA_VIERNES" ? nextFriday(policy.minDate) : nextWorkingDate(policy.minDate);
  prepDate.min = policy.minDate;
  if (forceValue || !prepDate.value || prepDate.value < policy.minDate || isSunday(prepDate.value)) prepDate.value = policy.minDate;
  validatePrepDate();
  cutoffNotice.hidden = !policy.afterCutoff;
  if (policy.afterCutoff) {
    const method = policy.deliveryZone === "CABA_VIERNES" ? "delivery CABA" : policy.deliveryType === "DELIVERY" ? "delivery" : "retiro por el local";
    cutoffText.textContent = `Los pedidos con ${method} para hoy cerraron a las ${policy.cutoffHour}:00. Elegi manana o cualquier fecha posterior.`;
  }
}

function validatePrepDate() {
  const sundaySelected = prepDate.value && isSunday(prepDate.value);
  const unavailable = (orderDatePolicy?.unavailableDates || []).find(item => item.date === prepDate.value);
  const unavailableMessage = unavailable
    ? `${unavailable.type === "CLOSED" ? "El local estara cerrado" : "No tendremos delivery"} ese dia${unavailable.note ? `: ${unavailable.note}` : "."}`
    : "";
  const invalidCabaDay = isCabaDelivery() && prepDate.value && !isFriday(prepDate.value);
  const validityMessage = invalidCabaDay
    ? "El delivery CABA se realiza únicamente los viernes."
    : sundaySelected
      ? "Los domingos no se toman pedidos."
      : unavailableMessage;
  prepDate.setCustomValidity(validityMessage);
  return !invalidCabaDay && !sundaySelected && !unavailable;
}

async function refreshDatePolicy(forceValue = false) {
  let policy = localDatePolicy();
  try {
    const response = await fetch(`/api/public-order-policy?deliveryType=${encodeURIComponent(deliveryType.value)}&deliveryZone=${isCabaDelivery() ? "CABA_VIERNES" : "REGULAR"}`, { cache: "no-store" });
    if (response.ok) policy = await response.json();
  } catch {
    // El servidor vuelve a validar la fecha al enviar el pedido.
  }
  applyDatePolicy(policy, forceValue);
  return policy;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#b83232" : "#0f6b5f";
  if (text) successBox.hidden = true;
}

function showSuccess(orderNumber, selectedDeliveryType, deliveryZone) {
  const schedule = deliveryZone === "CABA_VIERNES"
    ? "Entrega CABA el viernes. Envío gratis desde $50.000; pedidos menores abonan $15.000."
    : selectedDeliveryType === "DELIVERY"
      ? "Horario de entrega para delivery: de 11:00 a 15:00 hs."
    : "Horario de retiro: de 6:00 a 13:00 hs.";
  message.textContent = "";
  successBox.hidden = false;
  successBox.innerHTML = `
    <strong>Pedido enviado con exito</strong>
    <span>Tu pedido quedo cargado como provisorio con el numero #${orderNumber}.</span>
    <span>El local lo va a confirmar por WhatsApp.</span>
    <span>${schedule}</span>
  `;
  successBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateAddressRequirement() {
  const regularDelivery = deliveryType.value === "DELIVERY";
  const cabaDelivery = isCabaDelivery();
  fulfillmentNoticeText.textContent = cabaDelivery
    ? "Delivery CABA los viernes. Pedidos hasta las 11:00 hs."
    : regularDelivery
      ? "Horario de entrega para delivery: de 11:00 a 15:00 hs."
    : "Horario de retiro: de 6:00 a 13:00 hs.";
  addressSection.hidden = !regularDelivery;
  cabaAddressSection.hidden = !cabaDelivery;
  address.required = regularDelivery;
  district.required = regularDelivery;
  locality.required = regularDelivery;
  cabaNeighborhood.required = cabaDelivery;
  cabaStreet.required = cabaDelivery;
  cabaStreetNumber.required = cabaDelivery;
  address.placeholder = regularDelivery ? "Direccion obligatoria para delivery" : "Direccion si es delivery";
}

async function updateCabaStreetOptions() {
  cabaStreet.disabled = true;
  cabaStreet.innerHTML = '<option value="">Cargando calles...</option>';
  if (!cabaNeighborhood.value) {
    cabaStreet.innerHTML = '<option value="">Primero seleccioná el barrio</option>';
    return;
  }
  try {
    const response = await fetch(`/api/caba-delivery-streets?neighborhood=${encodeURIComponent(cabaNeighborhood.value)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron cargar las calles.");
    cabaStreet.innerHTML = '<option value="">Seleccionar calle</option>';
    data.streets.forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      cabaStreet.append(option);
    });
    cabaStreet.disabled = false;
  } catch (error) {
    cabaStreet.innerHTML = '<option value="">No se pudieron cargar las calles</option>';
    setMessage(error.message, true);
  }
}

function updateDeliveryTypeVisibility() {
  const contactComplete = customer.value.trim() !== "" && phone.value.trim() !== "";
  deliveryTypeSection.hidden = !contactComplete;
  if (!contactComplete) deliveryType.value = "RETIRO";
  updateAddressRequirement();
}

function updateLocalityOptions() {
  const selectedDistrict = district.value;
  const localities = LOCALITIES_BY_DISTRICT[selectedDistrict] || [];
  const currentLocality = locality.value;
  locality.innerHTML = '<option value="">Seleccionar localidad</option>';
  localities.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    locality.append(option);
  });
  locality.value = localities.includes(currentLocality) ? currentLocality : "";
}

async function sendOrder(event) {
  event.preventDefault();
  const policy = await refreshDatePolicy();
  if (prepDate.value < policy.minDate) {
    applyDatePolicy(policy, true);
    setMessage("Esa fecha ya no esta disponible. Elegi manana o una fecha posterior.", true);
    return;
  }
  if (!validatePrepDate()) {
    setMessage("Los domingos no trabajamos ni realizamos entregas. Elegi otra fecha.", true);
    prepDate.reportValidity();
    return;
  }
  setMessage("Enviando pedido...");
  successBox.hidden = true;

  const deliveryZone = isCabaDelivery() ? "CABA_VIERNES" : "REGULAR";
  const addressText = deliveryZone === "CABA_VIERNES"
    ? [cabaStreet.value, cabaStreetNumber.value, cabaAddressExtra.value.trim(), cabaNeighborhood.value, "CABA"].filter(Boolean).join(" - ")
    : [address.value.trim(), locality.value.trim(), district.value.trim()].filter(Boolean).join(" - ");

  const payload = {
    customer: document.querySelector("#clientCustomer").value,
    phone: document.querySelector("#clientPhone").value,
    address: addressText,
    saleType: publicSaleType,
    deliveryType: deliveryType.value === "RETIRO" ? "RETIRO" : "DELIVERY",
    deliveryZone,
    cabaNeighborhood: cabaNeighborhood.value,
    cabaStreet: cabaStreet.value,
    cabaStreetNumber: cabaStreetNumber.value,
    cabaAddressExtra: cabaAddressExtra.value,
    payment: document.querySelector("#clientPayment").value,
    prepDate: prepDate.value,
    scheduledTime: "",
    detail: document.querySelector("#clientDetail").value,
    notes: document.querySelector("#clientNotes").value
  };

  try {
    const response = await fetch("/api/public-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(data.error || "No se pudo enviar el pedido.");
    form.reset();
    await refreshDatePolicy(true);
    updateLocalityOptions();
    updateDeliveryTypeVisibility();
    showSuccess(data.number, payload.deliveryType, payload.deliveryZone);
  } catch (error) {
    setMessage(error.message, true);
  }
}

deliveryType.addEventListener("change", async () => {
  updateAddressRequirement();
  await refreshDatePolicy(true);
});
prepDate.addEventListener("change", () => {
  if (!validatePrepDate()) setMessage("Los domingos no trabajamos ni realizamos entregas. Elegi otra fecha.", true);
  else if (message.textContent.includes("domingos")) setMessage("");
});
customer.addEventListener("input", updateDeliveryTypeVisibility);
phone.addEventListener("input", updateDeliveryTypeVisibility);
district.addEventListener("change", updateLocalityOptions);
cabaNeighborhood.addEventListener("change", updateCabaStreetOptions);
form.addEventListener("submit", sendOrder);
updateLocalityOptions();
updateDeliveryTypeVisibility();
refreshDatePolicy(true);
applyOrderAudience();
loadClientDocuments();
setInterval(() => refreshDatePolicy(), 60000);
