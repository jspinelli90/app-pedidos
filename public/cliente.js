const form = document.querySelector("#clientOrderForm");
const message = document.querySelector("#clientMessage");
const prepDate = document.querySelector("#clientPrepDate");
const deliveryType = document.querySelector("#clientDeliveryType");
const address = document.querySelector("#clientAddress");

function todayDate() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#b83232" : "#0f6b5f";
}

function updateAddressRequirement() {
  address.required = deliveryType.value === "DELIVERY";
  address.placeholder = address.required ? "Direccion obligatoria para delivery" : "Direccion si es delivery";
}

async function sendOrder(event) {
  event.preventDefault();
  setMessage("Enviando pedido...");

  const payload = {
    customer: document.querySelector("#clientCustomer").value,
    phone: document.querySelector("#clientPhone").value,
    address: address.value,
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
    setMessage(`Gracias por tu pedido.\nQuedo cargado como provisorio con el numero #${data.number}.\nEl local lo va a confirmar por WhatsApp.\nEl rango de entrega para delivery es de 11 a 15 hs.\nLos pedidos para delivery recibidos luego de las 11 de la manana seran enviados el dia siguiente.`);
  } catch (error) {
    setMessage(error.message, true);
  }
}

prepDate.value = todayDate();
deliveryType.addEventListener("change", updateAddressRequirement);
form.addEventListener("submit", sendOrder);
updateAddressRequirement();
