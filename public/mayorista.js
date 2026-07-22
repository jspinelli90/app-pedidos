const form = document.querySelector("#wholesaleCustomerForm");
const message = document.querySelector("#wholesaleMessage");

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#b83232" : "#0f6b5f";
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setMessage("Enviando...");
  try {
    const response = await fetch("/api/public-wholesale-customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.querySelector("#wholesaleName").value,
        phone: document.querySelector("#wholesalePhone").value,
        address: document.querySelector("#wholesaleAddress").value,
        cuit: document.querySelector("#wholesaleCuit").value,
        customerNumber: document.querySelector("#wholesaleCustomerNumber").value,
        notes: document.querySelector("#wholesaleNotes").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudieron enviar los datos.");
    form.reset();
    setMessage("Datos recibidos. Ya quedaste incorporado a nuestra agenda mayorista.");
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    submit.disabled = false;
  }
});
