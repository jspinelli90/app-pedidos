const form = document.querySelector("#clientOrderForm");
const message = document.querySelector("#clientMessage");
const prepDate = document.querySelector("#clientPrepDate");
const deliveryType = document.querySelector("#clientDeliveryType");
const address = document.querySelector("#clientAddress");
const locality = document.querySelector("#clientLocality");
const successBox = document.querySelector("#clientSuccess");

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
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
  address.required = isDelivery;
  locality.required = isDelivery;
  address.placeholder = isDelivery ? "Direccion obligatoria para delivery" : "Direccion si es delivery";
}

async function sendOrder(event) {
  event.preventDefault();
  setMessage("Enviando pedido...");
  successBox.hidden = true;

  const addressText = [address.value.trim(), locality.value.trim()].filter(Boolean).join(" - ");

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
    prepDate.value = todayDate();
    updateAddressRequirement();
    showSuccess(data.number);
  } catch (error) {
    setMessage(error.message, true);
  }
}

prepDate.value = todayDate();
deliveryType.addEventListener("change", updateAddressRequirement);
form.addEventListener("submit", sendOrder);
updateAddressRequirement();
