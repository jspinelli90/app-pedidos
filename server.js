const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const MOVEMENTS_FILE = path.join(DATA_DIR, "movements.json");
const CLIENT_DOCUMENTS_FILE = path.join(DATA_DIR, "client-documents.json");
const OFFER_POSTER_SETTINGS_FILE = path.join(DATA_DIR, "offer-poster-settings.json");
const OFFER_POSTER_DRAFT_FILE = path.join(DATA_DIR, "offer-poster-draft.json");
const CLIENT_DOCUMENTS_BUCKET = "client-documents";
const CLIENT_DOCUMENT_TYPES = {
  "price-list": { label: "Lista de precios", legacyFileName: "lista-de-precios.pdf" },
  offers: { label: "Ofertas", legacyFileName: "ofertas.pdf" }
};

loadEnvFile();

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const WHOLESALE_CLEANUP_MIGRATION = "2026-07-22-deactivate-wholesale-customers";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".ico": "image/x-icon"
};

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, "[]\n", "utf8");
  if (!fs.existsSync(CUSTOMERS_FILE)) fs.writeFileSync(CUSTOMERS_FILE, "[]\n", "utf8");
  if (!fs.existsSync(USERS_FILE)) {
    const initialUsers = ["PC JUAN", "PC CAJA", "PC MINORISTA", "PC MAYORISTA"]
      .map(name => ({ id: cryptoId(), name, active: true, createdAt: new Date().toISOString() }));
    fs.writeFileSync(USERS_FILE, `${JSON.stringify(initialUsers, null, 2)}\n`, "utf8");
  }
  if (!fs.existsSync(MOVEMENTS_FILE)) fs.writeFileSync(MOVEMENTS_FILE, "[]\n", "utf8");
}

function readJsonArray(filePath) {
  ensureDataFile();
  try {
    const text = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(text || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase no respondio correctamente: ${response.status} ${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function readStore(key, filePath) {
  if (!USE_SUPABASE) return readJsonArray(filePath);
  const rows = await supabaseRequest(`/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=data`);
  if (Array.isArray(rows) && rows[0] && Array.isArray(rows[0].data)) return rows[0].data;
  return readJsonArray(filePath);
}

async function writeStore(key, filePath, records) {
  if (!USE_SUPABASE) {
    ensureDataFile();
    fs.writeFileSync(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    return;
  }
  await supabaseRequest("/rest/v1/app_data", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, data: records, updated_at: new Date().toISOString() })
  });
}

async function readOrders() {
  return readStore("orders", ORDERS_FILE);
}

async function writeOrders(orders) {
  ensureDataFile();
  await writeStore("orders", ORDERS_FILE, orders);
}

async function readCustomers() {
  return readStore("customers", CUSTOMERS_FILE);
}

async function writeCustomers(customers) {
  ensureDataFile();
  await writeStore("customers", CUSTOMERS_FILE, customers);
}

function normalizeCustomer(input, existing = {}) {
  const now = new Date().toISOString();
  const saleType = normalizeSaleType(input.saleType);
  return {
    id: existing.id || cryptoId(),
    name: cleanText(input.name),
    phone: cleanText(input.phone),
    address: cleanText(input.address),
    saleType,
    customerNumber: saleType === "Mayorista" ? cleanText(input.customerNumber) : "",
    cuit: saleType === "Mayorista" ? cleanText(input.cuit) : "",
    notes: cleanText(input.notes),
    active: existing.active !== false,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function customerPhoneKey(value) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function customerIdentity(customer) {
  return customerPhoneKey(customer.phone) || cleanText(customer.name).toLowerCase();
}

function normalizedName(value) {
  return cleanText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
}

function findDuplicateCustomer(customers, candidate, ignoredId = "") {
  const phone = customerPhoneKey(candidate.phone);
  const name = normalizedName(candidate.name);
  const customerNumber = cleanText(candidate.customerNumber).toLowerCase();
  const cuit = cleanText(candidate.cuit).replace(/\D/g, "");
  return customers.find(current => {
    if (current.id === ignoredId) return false;
    return Boolean(
      (phone && customerPhoneKey(current.phone) === phone) ||
      (name && normalizedName(current.name) === name) ||
      (customerNumber && normalizeSaleType(current.saleType) === "Mayorista" && cleanText(current.customerNumber).toLowerCase() === customerNumber) ||
      (cuit && cleanText(current.cuit).replace(/\D/g, "") === cuit)
    );
  });
}

async function runDataMigrations() {
  const migrations = await readStore("migrations", path.join(DATA_DIR, "migrations.json"));
  if (migrations.some(item => item && item.id === WHOLESALE_CLEANUP_MIGRATION)) return;
  // Materializa primero la agenda derivada de pedidos para que ningun mayorista
  // historico quede fuera de la depuracion ni reaparezca en el siguiente GET.
  await syncCustomersFromOrders();
  const customers = await readCustomers();
  const now = new Date().toISOString();
  let affected = 0;
  const updated = customers.map(customer => {
    if (normalizeSaleType(customer.saleType) !== "Mayorista" || customer.active === false) return customer;
    affected += 1;
    return { ...customer, active: false, updatedAt: now, deactivatedBy: WHOLESALE_CLEANUP_MIGRATION };
  });
  if (affected) await writeCustomers(updated);
  migrations.push({ id: WHOLESALE_CLEANUP_MIGRATION, affected, appliedAt: now });
  await writeStore("migrations", path.join(DATA_DIR, "migrations.json"), migrations);
  console.log(`Depuracion mayoristas: ${affected} contactos desactivados.`);
}

async function readUsers() {
  return readStore("users", USERS_FILE);
}

async function writeUsers(users) {
  ensureDataFile();
  await writeStore("users", USERS_FILE, users);
}

async function readMovements() {
  return readStore("movements", MOVEMENTS_FILE);
}

async function writeMovements(movements) {
  ensureDataFile();
  await writeStore("movements", MOVEMENTS_FILE, movements);
}

function normalizeOfferPosterSettings(value = {}) {
  return {
    date: "HASTA AGOTAR STOCK",
    phone: cleanText(value.phone).slice(0, 40),
    instagram: cleanText(value.instagram).slice(0, 45),
    address: cleanText(value.address).slice(0, 90),
    orderLink: cleanText(value.orderLink).slice(0, 200),
    footer: cleanText(value.footer).slice(0, 90) || "PEDIDOS POR WHATSAPP · STOCK LIMITADO"
  };
}

async function readOfferPosterSettings() {
  const records = await readStore("offer_poster_settings", OFFER_POSTER_SETTINGS_FILE);
  return records[0] ? { configured: true, settings: normalizeOfferPosterSettings(records[0]) } : {
    configured: false,
    settings: normalizeOfferPosterSettings()
  };
}

async function writeOfferPosterSettings(settings) {
  const normalized = normalizeOfferPosterSettings(settings);
  await writeStore("offer_poster_settings", OFFER_POSTER_SETTINGS_FILE, [normalized]);
  return normalized;
}

function normalizeOfferPosterDraft(value = {}) {
  return {
    format: value.format === "post" ? "post" : "story",
    title: cleanText(value.title).slice(0, 42) || "OFERTAS DEL DIA",
    subtitle: cleanText(value.subtitle).slice(0, 70) || "CALIDAD SAN CAYETANO",
    offersText: String(value.offersText || "").slice(0, 20_000),
    savedAt: new Date().toISOString()
  };
}

async function readOfferPosterDraft() {
  const records = await readStore("offer_poster_draft", OFFER_POSTER_DRAFT_FILE);
  return records[0] ? { configured: true, draft: records[0] } : { configured: false, draft: null };
}

async function writeOfferPosterDraft(draft) {
  const normalized = normalizeOfferPosterDraft(draft);
  await writeStore("offer_poster_draft", OFFER_POSTER_DRAFT_FILE, [normalized]);
  return normalized;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("El pedido es demasiado grande."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Datos invalidos."));
      }
    });
    req.on("error", reject);
  });
}

function readBodyWithLimit(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("El archivo supera el limite de 10 MB."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Datos invalidos."));
      }
    });
    req.on("error", reject);
  });
}

async function readClientDocuments() {
  const records = await readStore("client_documents", CLIENT_DOCUMENTS_FILE);
  let changed = false;
  Object.keys(CLIENT_DOCUMENT_TYPES).forEach(type => {
    records.filter(item => item.type === type).forEach((item, index) => {
      if (!item.id) {
        item.id = cryptoId();
        changed = true;
      }
      if (!Number.isFinite(item.order)) {
        item.order = index;
        changed = true;
      }
    });
  });
  if (changed) await writeStore("client_documents", CLIENT_DOCUMENTS_FILE, records);
  return records;
}

async function writeClientDocuments(records) {
  return writeStore("client_documents", CLIENT_DOCUMENTS_FILE, records);
}

async function ensureClientDocumentsBucket() {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json"
  };
  const existing = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${CLIENT_DOCUMENTS_BUCKET}`, { headers });
  if (existing.ok) return;
  if (existing.status !== 404) {
    const detail = await existing.text().catch(() => "");
    throw new Error(`No se pudo comprobar el almacenamiento de documentos (${existing.status}${detail ? `: ${detail}` : ""}).`);
  }
  const response = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: CLIENT_DOCUMENTS_BUCKET, name: CLIENT_DOCUMENTS_BUCKET, public: false, file_size_limit: 10_000_000, allowed_mime_types: ["application/pdf"] })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`No se pudo preparar el almacenamiento de documentos (${response.status}${detail ? `: ${detail}` : ""}).`);
  }
}

function clientDocumentStorageName(document) {
  return document.storageName || CLIENT_DOCUMENT_TYPES[document.type]?.legacyFileName || "";
}

async function saveClientDocument(document, buffer) {
  const { type, storageName } = document;
  const config = CLIENT_DOCUMENT_TYPES[type];
  if (!config) throw new Error("Tipo de documento invalido.");
  if (USE_SUPABASE) {
    await ensureClientDocumentsBucket();
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${CLIENT_DOCUMENTS_BUCKET}/${storageName}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/pdf",
        "x-upsert": "true"
      },
      body: buffer
    });
    if (!response.ok) throw new Error(`No se pudo guardar el PDF (${response.status}).`);
    return;
  }
  ensureDataFile();
  const filePath = path.join(DATA_DIR, storageName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

async function sendClientDocument(res, document) {
  const storageName = clientDocumentStorageName(document);
  if (!storageName) return sendJson(res, 404, { error: "Documento no encontrado." });
  let buffer;
  if (USE_SUPABASE) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${CLIENT_DOCUMENTS_BUCKET}/${storageName}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!response.ok) return sendJson(res, 404, { error: "El documento todavia no fue cargado." });
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    const filePath = path.join(DATA_DIR, storageName);
    if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: "El documento todavia no fue cargado." });
    buffer = fs.readFileSync(filePath);
  }
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Length": buffer.length,
    "Content-Disposition": `inline; filename="${cleanText(document.name).replace(/["\r\n]/g, "") || "documento.pdf"}"`,
    "Cache-Control": "no-store"
  });
  res.end(buffer);
}

async function deleteClientDocumentFile(document) {
  const storageName = clientDocumentStorageName(document);
  if (!storageName) return;
  if (USE_SUPABASE) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${CLIENT_DOCUMENTS_BUCKET}/${storageName}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!response.ok && response.status !== 404) throw new Error(`No se pudo eliminar el PDF (${response.status}).`);
    return;
  }
  const filePath = path.join(DATA_DIR, storageName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function cleanText(value) {
  return String(value || "").trim();
}

function actorName(input = {}) {
  return cleanText(input.currentUser || input.user || input.updatedBy || input.createdBy) || "Sin usuario";
}

function normalizeDeliveryType(value) {
  const text = cleanText(value).toUpperCase();
  return text === "DELIVERY" ? "DELIVERY" : "RETIRO";
}

function normalizeStatus(value) {
  const text = cleanText(value).toLowerCase();
  if (text === "provisorio" || text === "provisional") return "Provisorio";
  if (text === "preparando" || text === "listo" || text === "preparado") return "Preparado";
  if (text === "entregado" || text === "despachado") return "Despachado";
  if (text === "cancelado") return "Cancelado";
  return "Nuevo";
}

function normalizeSaleType(value) {
  const text = cleanText(value).toLowerCase();
  return text === "mayorista" ? "Mayorista" : "Minorista";
}

function normalizePriority(value) {
  const text = cleanText(value).toLowerCase();
  if (text === "alta") return "Alta";
  if (text === "baja") return "Baja";
  return "Media";
}

function normalizeOrderPriority(value, deliveryType) {
  const priority = normalizePriority(value);
  if (priority === "Alta") return "Alta";
  return deliveryType === "DELIVERY" ? "Baja" : "Media";
}

function normalizeTime(value) {
  const text = cleanText(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "";
}

function normalizeDate(value, fallbackIso = "") {
  const text = cleanText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (fallbackIso) return String(fallbackIso).slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function addDaysToDate(dateText, days) {
  const date = new Date(`${dateText}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isSundayDate(dateText) {
  return new Date(`${dateText}T12:00:00Z`).getUTCDay() === 0;
}

function nextWorkingDate(dateText) {
  return isSundayDate(dateText) ? addDaysToDate(dateText, 1) : dateText;
}

function publicOrderDatePolicy(deliveryType = "RETIRO", now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23"
    }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value])
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const normalizedType = normalizeDeliveryType(deliveryType);
  const cutoffHour = normalizedType === "DELIVERY" ? 11 : 13;
  const afterCutoff = Number(parts.hour) >= cutoffHour;
  return {
    today,
    afterCutoff,
    minDate: nextWorkingDate(afterCutoff ? addDaysToDate(today, 1) : today),
    cutoffHour,
    deliveryType: normalizedType
  };
}

function normalizeRouteVehicle(value) {
  const text = cleanText(value).toLowerCase();
  if (text === "camion" || text === "camión") return "Camion";
  if (text === "camioneta") return "Camioneta";
  return "Sin asignar";
}

function orderSortValue(order) {
  const statusRank = { Provisorio: 0, Nuevo: 1, Preparado: 2, Despachado: 3 }[normalizeStatus(order.status)] ?? 4;
  const priorityRank = { Alta: 0, Media: 1, Baja: 2 }[normalizePriority(order.priority)] ?? 1;
  const timeRank = order.scheduledTime || "99:99";
  return `${normalizeDate(order.prepDate, order.createdAt)}-${statusRank}-${priorityRank}-${timeRank}-${order.createdAt || ""}`;
}

function normalizeOrder(input, existing = {}) {
  const now = new Date().toISOString();
  const actor = actorName(input);
  const legacyItems = Array.isArray(input.items)
    ? input.items
        .map(item => ({
          name: cleanText(item.name),
          qty: Math.max(1, Number.parseInt(item.qty, 10) || 1),
          note: cleanText(item.note)
        }))
        .filter(item => item.name)
    : [];
  const detail = cleanText(input.detail || input.orderDetail) || legacyItems
    .map(item => `${item.qty} x ${item.name}${item.note ? ` (${item.note})` : ""}`)
    .join("\n");
  const deliveryType = normalizeDeliveryType(input.deliveryType);

  return {
    id: existing.id || cryptoId(),
    number: existing.number || 0,
    customer: cleanText(input.customer),
    phone: cleanText(input.phone),
    address: cleanText(input.address),
    deliveryType,
    saleType: normalizeSaleType(input.saleType),
    payment: cleanText(input.payment),
    status: normalizeStatus(input.status),
    priority: normalizeOrderPriority(input.priority, deliveryType),
    prepDate: normalizeDate(input.prepDate, existing.prepDate || existing.createdAt || now),
    scheduledTime: normalizeTime(input.scheduledTime),
    routeVehicle: normalizeRouteVehicle(input.routeVehicle || existing.routeVehicle),
    detail,
    notes: cleanText(input.notes),
    items: legacyItems,
    createdBy: existing.createdBy || actor,
    updatedBy: actor,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function cryptoId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function nextNumber(orders) {
  return orders.reduce((max, order) => Math.max(max, Number(order.number) || 0), 0) + 1;
}

function customerKey(order) {
  return customerPhoneKey(order.phone) || cleanText(order.customer).toLowerCase();
}

async function saveCustomerFromOrder(order, options = {}) {
  if (!order.customer) return;
  const customers = await readCustomers();
  const key = customerKey(order);
  const index = customers.findIndex(customer => customerIdentity(customer) === key);
  const saved = {
    id: index === -1 ? cryptoId() : customers[index].id,
    name: order.customer,
    phone: order.phone,
    address: order.address,
    saleType: normalizeSaleType(order.saleType),
    active: true,
    createdAt: index === -1 ? new Date().toISOString() : customers[index].createdAt,
    updatedAt: new Date().toISOString()
  };
  if (index === -1) customers.push(saved);
  else if (options.onlyIfMissing) return;
  else customers[index] = { ...customers[index], ...saved };
  await writeCustomers(customers);
}

async function syncCustomersFromOrders() {
  const customers = await readCustomers();
  const orders = await readOrders();
  const knownKeys = new Set(customers.map(customerIdentity).filter(Boolean));
  const now = new Date().toISOString();
  let changed = false;

  for (const order of orders) {
    if (!order.customer) continue;
    const key = customerKey(order);
    if (!key || knownKeys.has(key)) continue;
    customers.push({
      id: cryptoId(),
      name: order.customer,
      phone: order.phone,
      address: order.address,
      saleType: normalizeSaleType(order.saleType),
      active: true,
      createdAt: now,
      updatedAt: now
    });
    knownKeys.add(key);
    changed = true;
  }

  if (changed) await writeCustomers(customers);
  return customers;
}

function orderSummary(order) {
  return `#${order.number || ""} ${order.customer || ""}`.trim();
}

async function appendMovement(order, action, user, details = "") {
  const movement = {
    id: cryptoId(),
    orderId: order.id,
    orderNumber: order.number,
    customer: order.customer,
    action,
    user: user || "Sin usuario",
    details,
    createdAt: new Date().toISOString()
  };
  const movements = await readMovements();
  movements.push(movement);
  await writeMovements(movements);
  return movement;
}

function movementDetails(before, after) {
  if (!before) return "Pedido cargado";
  const changes = [];
  [
    ["status", "Estado"],
    ["routeVehicle", "Vehiculo"],
    ["prepDate", "Fecha"],
    ["scheduledTime", "Horario"],
    ["priority", "Prioridad"],
    ["deliveryType", "Tipo"],
    ["saleType", "Tipo cliente"],
    ["address", "Direccion"],
    ["detail", "Detalle"]
  ].forEach(([key, label]) => {
    if ((before[key] || "") !== (after[key] || "")) {
      changes.push(`${label}: ${before[key] || "-"} -> ${after[key] || "-"}`);
    }
  });
  return changes.join(" | ") || "Pedido actualizado";
}

function isSafePublicPath(filePath) {
  const resolved = path.resolve(filePath);
  return resolved === PUBLIC_DIR || resolved.startsWith(`${PUBLIC_DIR}${path.sep}`);
}

function serveStatic(req, res) {
  const rawUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requested = rawUrl.pathname === "/" ? "/index.html" : decodeURIComponent(rawUrl.pathname);
  const filePath = path.join(PUBLIC_DIR, requested);

  if (!isSafePublicPath(filePath)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (url.pathname === "/api/offer-qr" && req.method === "GET") {
      const target = String(url.searchParams.get("target") || "").trim();
      if (!/^https?:\/\//i.test(target)) return sendJson(res, 400, { error: "El destino del QR debe ser un enlace valido." });
      const png = await QRCode.toBuffer(target, { type: "png", width: 360, margin: 2, errorCorrectionLevel: "M" });
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
      return res.end(png);
    }

    if (url.pathname === "/api/offer-poster-settings" && req.method === "GET") {
      return sendJson(res, 200, await readOfferPosterSettings());
    }

    if (url.pathname === "/api/offer-poster-settings" && req.method === "PUT") {
      const payload = await readBody(req);
      if (payload.orderLink && !/^https?:\/\//i.test(payload.orderLink)) {
        return sendJson(res, 400, { error: "El destino del QR debe ser un enlace valido." });
      }
      return sendJson(res, 200, await writeOfferPosterSettings(payload));
    }

    if (url.pathname === "/api/offer-poster-draft" && req.method === "GET") {
      return sendJson(res, 200, await readOfferPosterDraft());
    }

    if (url.pathname === "/api/offer-poster-draft" && req.method === "PUT") {
      return sendJson(res, 200, await writeOfferPosterDraft(await readBody(req)));
    }

    if (url.pathname === "/api/public-client-documents" && req.method === "GET") {
      const records = await readClientDocuments();
      const visible = records.map(({ storageName, ...record }) => record).sort((a, b) => {
        const orderA = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
        return orderA - orderB || new Date(a.updatedAt) - new Date(b.updatedAt);
      });
      return sendJson(res, 200, Object.fromEntries(Object.keys(CLIENT_DOCUMENT_TYPES).map(type => [type, visible.filter(item => item.type === type)])));
    }

    const publicDocumentMatch = url.pathname.match(/^\/api\/public-client-documents\/([^/]+)$/);
    if (publicDocumentMatch && req.method === "GET") {
      const records = await readClientDocuments();
      const document = records.find(item => item.id === publicDocumentMatch[1]) || records.find(item => item.type === publicDocumentMatch[1]);
      if (!document) return sendJson(res, 404, { error: "Documento no encontrado." });
      return sendClientDocument(res, document);
    }

    const documentUploadMatch = url.pathname.match(/^\/api\/client-documents\/(price-list|offers)$/);
    if (documentUploadMatch && req.method === "POST") {
      const payload = await readBodyWithLimit(req, 14_000_000);
      const encoded = cleanText(payload.data).replace(/^data:application\/pdf;base64,/, "");
      const buffer = Buffer.from(encoded, "base64");
      if (!cleanText(payload.name).toLowerCase().endsWith(".pdf") || buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
        return sendJson(res, 400, { error: "Selecciona un archivo PDF valido." });
      }
      if (buffer.length > 10_000_000) return sendJson(res, 400, { error: "El PDF no puede superar los 10 MB." });
      const type = documentUploadMatch[1];
      const id = cryptoId();
      const storageName = `${type}/${id}.pdf`;
      const records = await readClientDocuments();
      const typeOrders = records.filter(item => item.type === type && Number.isFinite(item.order)).map(item => item.order);
      const order = typeOrders.length ? Math.max(...typeOrders) + 1 : records.filter(item => item.type === type).length;
      const metadata = { id, type, name: cleanText(payload.name), size: buffer.length, storageName, order, updatedAt: new Date().toISOString() };
      await saveClientDocument(metadata, buffer);
      records.push(metadata);
      await writeClientDocuments(records);
      const { storageName: omitted, ...publicMetadata } = metadata;
      return sendJson(res, 200, publicMetadata);
    }

    if (url.pathname === "/api/client-documents/order" && req.method === "PUT") {
      const payload = await readBody(req);
      const type = cleanText(payload.type);
      const ids = Array.isArray(payload.ids) ? payload.ids.map(cleanText) : [];
      if (!CLIENT_DOCUMENT_TYPES[type] || !ids.length || new Set(ids).size !== ids.length) {
        return sendJson(res, 400, { error: "Orden de documentos invalido." });
      }
      const records = await readClientDocuments();
      const documents = records.filter(item => item.type === type);
      if (documents.length !== ids.length || documents.some(item => !item.id || !ids.includes(item.id))) {
        return sendJson(res, 409, { error: "La lista de documentos cambio. Actualiza la pantalla e intenta nuevamente." });
      }
      const positions = new Map(ids.map((id, index) => [id, index]));
      const updated = records.map(item => item.type === type ? { ...item, order: positions.get(item.id) } : item);
      await writeClientDocuments(updated);
      return sendJson(res, 200, { ok: true });
    }

    const documentDeleteMatch = url.pathname.match(/^\/api\/client-documents\/([^/]+)$/);
    if (documentDeleteMatch && req.method === "DELETE") {
      const records = await readClientDocuments();
      const document = records.find(item => item.id === documentDeleteMatch[1]);
      if (!document) return sendJson(res, 404, { error: "Documento no encontrado." });
      await deleteClientDocumentFile(document);
      await writeClientDocuments(records.filter(item => item !== document));
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/orders" && req.method === "GET") {
      const orders = (await readOrders()).sort((a, b) => orderSortValue(a).localeCompare(orderSortValue(b)));
      return sendJson(res, 200, orders);
    }

    if (url.pathname === "/api/customers" && req.method === "GET") {
      const customers = (await syncCustomersFromOrders())
        .filter(customer => customer.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      return sendJson(res, 200, customers);
    }

    if (url.pathname === "/api/customers" && req.method === "POST") {
      const payload = await readBody(req);
      const customer = normalizeCustomer(payload);
      if (!customer.name) return sendJson(res, 400, { error: "Completa el nombre del cliente." });
      const customers = await readCustomers();
      const duplicate = findDuplicateCustomer(customers, customer);
      if (duplicate && duplicate.active !== false) return sendJson(res, 409, { error: "Ya existe un cliente con ese telefono o nombre." });
      if (duplicate) {
        const index = customers.findIndex(current => current.id === duplicate.id);
        customers[index] = { ...normalizeCustomer(payload, duplicate), active: true };
        await writeCustomers(customers);
        return sendJson(res, 201, customers[index]);
      }
      customers.push(customer);
      await writeCustomers(customers);
      return sendJson(res, 201, customer);
    }

    const customerMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
    if (customerMatch && req.method === "PUT") {
      const payload = await readBody(req);
      const customers = await readCustomers();
      const index = customers.findIndex(customer => customer.id === customerMatch[1]);
      if (index === -1) return sendJson(res, 404, { error: "Cliente no encontrado." });
      const customer = normalizeCustomer(payload, customers[index]);
      if (!customer.name) return sendJson(res, 400, { error: "Completa el nombre del cliente." });
      const duplicate = findDuplicateCustomer(customers, customer, customers[index].id);
      if (duplicate) return sendJson(res, 409, { error: "Ya existe otro cliente con ese telefono o nombre." });
      customers[index] = customer;
      await writeCustomers(customers);
      return sendJson(res, 200, customer);
    }

    if (customerMatch && req.method === "DELETE") {
      const customers = await readCustomers();
      const index = customers.findIndex(customer => customer.id === customerMatch[1]);
      if (index === -1) return sendJson(res, 404, { error: "Cliente no encontrado." });
      customers[index] = { ...customers[index], active: false, updatedAt: new Date().toISOString() };
      await writeCustomers(customers);
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/public-wholesale-customers" && req.method === "POST") {
      const payload = await readBody(req);
      const customer = normalizeCustomer({ ...payload, saleType: "Mayorista" });
      if (!customer.name || !customer.phone) {
        return sendJson(res, 400, { error: "Completa nombre o razon social y telefono." });
      }
      if (customerPhoneKey(customer.phone).length < 8) {
        return sendJson(res, 400, { error: "Ingresa un telefono valido, con al menos 8 numeros." });
      }
      const cuit = cleanText(customer.cuit).replace(/\D/g, "");
      if (customer.cuit && cuit.length !== 11) {
        return sendJson(res, 400, { error: "El CUIT debe tener 11 numeros." });
      }
      const customers = await readCustomers();
      const duplicate = findDuplicateCustomer(customers, customer);
      if (duplicate && duplicate.active !== false) {
        return sendJson(res, 409, { error: "Ya existe un cliente con ese nombre, telefono, CUIT o numero de cliente/marcada." });
      }
      if (duplicate) {
        const index = customers.findIndex(current => current.id === duplicate.id);
        customers[index] = { ...normalizeCustomer(customer, duplicate), active: true, source: "Formulario mayorista" };
        await writeCustomers(customers);
        return sendJson(res, 200, { ok: true, reactivated: true });
      }
      customers.push({ ...customer, source: "Formulario mayorista" });
      await writeCustomers(customers);
      return sendJson(res, 201, { ok: true });
    }

    if (url.pathname === "/api/users" && req.method === "GET") {
      const users = (await readUsers()).filter(user => user.active !== false).sort((a, b) => a.name.localeCompare(b.name, "es"));
      return sendJson(res, 200, users);
    }

    if (url.pathname === "/api/users" && req.method === "POST") {
      const payload = await readBody(req);
      const name = cleanText(payload.name).toUpperCase();
      if (!name) return sendJson(res, 400, { error: "Completa el nombre del usuario." });
      const users = await readUsers();
      const existing = users.find(user => user.name.toLowerCase() === name.toLowerCase());
      if (existing) return sendJson(res, 200, existing);
      const user = { id: cryptoId(), name, active: true, createdAt: new Date().toISOString() };
      users.push(user);
      await writeUsers(users);
      return sendJson(res, 201, user);
    }

    if (url.pathname === "/api/movements" && req.method === "GET") {
      const orderId = url.searchParams.get("orderId");
      const movements = (await readMovements())
        .filter(movement => !orderId || movement.orderId === orderId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sendJson(res, 200, movements);
    }

    if (url.pathname === "/api/public-order-policy" && req.method === "GET") {
      return sendJson(res, 200, publicOrderDatePolicy(url.searchParams.get("deliveryType")));
    }

    if (url.pathname === "/api/public-orders" && req.method === "POST") {
      const payload = await readBody(req);
      const datePolicy = publicOrderDatePolicy(payload.deliveryType);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanText(payload.prepDate)) || payload.prepDate < datePolicy.minDate) {
        const error = datePolicy.afterCutoff
          ? `Los pedidos con ${datePolicy.deliveryType === "DELIVERY" ? "delivery" : "retiro por el local"} para hoy cerraron a las ${datePolicy.cutoffHour}:00. Elegi una fecha desde ${datePolicy.minDate}.`
          : `Elegi una fecha desde ${datePolicy.minDate}.`;
        return sendJson(res, 400, { error, ...datePolicy });
      }
      if (isSundayDate(payload.prepDate)) {
        return sendJson(res, 400, { error: "Los domingos no trabajamos ni realizamos entregas. Elegi otra fecha." });
      }
      const orders = await readOrders();
      const order = normalizeOrder({
        ...payload,
        status: "Provisorio",
        currentUser: "Cliente"
      });
      if (!order.customer || !order.phone || !order.detail) {
        return sendJson(res, 400, { error: "Completa nombre, telefono y detalle del pedido." });
      }
      if (order.deliveryType === "DELIVERY" && !order.address) {
        return sendJson(res, 400, { error: "Completa el domicilio para el delivery." });
      }
      order.number = nextNumber(orders);
      order.createdBy = "Cliente";
      order.updatedBy = "Cliente";
      orders.push(order);
      await writeOrders(orders);
      await appendMovement(order, "Pedido provisorio recibido", "Cliente", "Cargado desde formulario de cliente");
      return sendJson(res, 201, { ok: true, number: order.number });
    }

    if (url.pathname === "/api/orders" && req.method === "POST") {
      const payload = await readBody(req);
      const orders = await readOrders();
      const order = normalizeOrder({
        ...payload,
        status: cleanText(payload.status) === "Provisorio" ? "Nuevo" : payload.status
      });
      if (!order.customer || !order.detail) {
        return sendJson(res, 400, { error: "Completa cliente y detalle del pedido." });
      }
      order.number = nextNumber(orders);
      orders.push(order);
      await writeOrders(orders);
      await saveCustomerFromOrder(order);
      await appendMovement(order, "Pedido creado", actorName(payload), `Creado por ${actorName(payload)}`);
      return sendJson(res, 201, order);
    }

    const match = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (match && req.method === "PUT") {
      const id = match[1];
      const payload = await readBody(req);
      const orders = await readOrders();
      const index = orders.findIndex(order => order.id === id);
      if (index === -1) return sendJson(res, 404, { error: "Pedido no encontrado." });
      const beforeOrder = { ...orders[index] };
      const order = normalizeOrder(payload, orders[index]);
      if (!order.customer || !order.detail) {
        return sendJson(res, 400, { error: "Completa cliente y detalle del pedido." });
      }
      orders[index] = order;
      await writeOrders(orders);
      await saveCustomerFromOrder(order);
      await appendMovement(order, cleanText(payload.auditAction) || "Pedido actualizado", actorName(payload), movementDetails(beforeOrder, order));
      return sendJson(res, 200, order);
    }

    if (match && req.method === "DELETE") {
      const id = match[1];
      const payload = await readBody(req).catch(() => ({}));
      const orders = await readOrders();
      const deleted = orders.find(order => order.id === id);
      const filtered = orders.filter(order => order.id !== id);
      if (filtered.length === orders.length) return sendJson(res, 404, { error: "Pedido no encontrado." });
      await writeOrders(filtered);
      await appendMovement(deleted, "Pedido eliminado", actorName(payload), `Eliminado ${orderSummary(deleted)}`);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "No encontrado." });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Error del servidor." });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  return serveStatic(req, res);
});

function localIps() {
  const networks = os.networkInterfaces();
  return Object.values(networks)
    .flat()
    .filter(info => info && info.family === "IPv4" && !info.internal)
    .map(info => info.address);
}

async function startServer() {
  ensureDataFile();
  await runDataMigrations();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const activePort = address && typeof address === "object" ? address.port : PORT;
      console.log(`Sistema de pedidos abierto en http://localhost:${activePort}`);
      console.log(`Datos: ${USE_SUPABASE ? "Supabase online" : "archivos locales"}`);
      localIps().forEach(ip => console.log(`Desde otra PC: http://${ip}:${activePort}`));
      resolve(server);
    });
  });
}

if (require.main === module) startServer().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

module.exports = { findDuplicateCustomer, normalizeCustomer, normalizeSaleType, publicOrderDatePolicy, runDataMigrations, server, startServer };
