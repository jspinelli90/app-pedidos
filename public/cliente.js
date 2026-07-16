const form = document.querySelector("#clientOrderForm");
const message = document.querySelector("#clientMessage");
const prepDate = document.querySelector("#clientPrepDate");
const customer = document.querySelector("#clientCustomer");
const phone = document.querySelector("#clientPhone");
const deliveryType = document.querySelector("#clientDeliveryType");
const deliveryTypeSection = document.querySelector("#clientDeliveryTypeSection");
const addressSection = document.querySelector("#clientAddressSection");
const address = document.querySelector("#clientAddress");
const district = document.querySelector("#clientDistrict");
const locality = document.querySelector("#clientLocality");
const successBox = document.querySelector("#clientSuccess");
const cutoffNotice = document.querySelector("#clientCutoffNotice");

let orderDatePolicy = null;

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

function localDatePolicy() {
  const now = new Date();
  const today = todayDate();
  const afterCutoff = now.getHours() >= 11;
  return { today, afterCutoff, minDate: nextWorkingDate(afterCutoff ? addDays(today, 1) : today) };
}

function applyDatePolicy(policy, forceValue = false) {
  orderDatePolicy = policy;
  policy.minDate = nextWorkingDate(policy.minDate);
  prepDate.min = policy.minDate;
  if (forceValue || !prepDate.value || prepDate.value < policy.minDate || isSunday(prepDate.value)) prepDate.value = policy.minDate;
  validatePrepDate();
  cutoffNotice.hidden = !policy.afterCutoff;
}

function validatePrepDate() {
  const sundaySelected = prepDate.value && isSunday(prepDate.value);
  prepDate.setCustomValidity(sundaySelected ? "Los domingos no se toman pedidos." : "");
  return !sundaySelected;
}

async function refreshDatePolicy(forceValue = false) {
  let policy = localDatePolicy();
  try {
    const response = await fetch("/api/public-order-policy", { cache: "no-store" });
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

function showSuccess(orderNumber) {
  message.textContent = "";
  successBox.hidden = false;
  successBox.innerHTML = `
    <strong>Pedido enviado con exito</strong>
    <span>Tu pedido quedo cargado como provisorio con el numero #${orderNumber}.</span>
    <span>El local lo va a confirmar por WhatsApp.</span>
    <span>El rango de entrega para delivery es de 11 a 15 hs.</span>
  `;
  successBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateAddressRequirement() {
  const isDelivery = deliveryType.value === "DELIVERY";
  addressSection.hidden = !isDelivery;
  address.required = isDelivery;
  district.required = isDelivery;
  locality.required = isDelivery;
  address.placeholder = isDelivery ? "Direccion obligatoria para delivery" : "Direccion si es delivery";
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

  const addressText = [address.value.trim(), locality.value.trim(), district.value.trim()].filter(Boolean).join(" - ");

  const payload = {
    customer: document.querySelector("#clientCustomer").value,
    phone: document.querySelector("#clientPhone").value,
    address: addressText,
    saleType: "Minorista",
    deliveryType: deliveryType.value,
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
    showSuccess(data.number);
  } catch (error) {
    setMessage(error.message, true);
  }
}

deliveryType.addEventListener("change", updateAddressRequirement);
prepDate.addEventListener("change", () => {
  if (!validatePrepDate()) setMessage("Los domingos no trabajamos ni realizamos entregas. Elegi otra fecha.", true);
  else if (message.textContent.includes("domingos")) setMessage("");
});
customer.addEventListener("input", updateDeliveryTypeVisibility);
phone.addEventListener("input", updateDeliveryTypeVisibility);
district.addEventListener("change", updateLocalityOptions);
form.addEventListener("submit", sendOrder);
updateLocalityOptions();
updateDeliveryTypeVisibility();
refreshDatePolicy(true);
setInterval(() => refreshDatePolicy(), 60000);
