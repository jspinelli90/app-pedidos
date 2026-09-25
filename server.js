const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const QRCode = require("qrcode");
const { validatePriceList, importPriceList, generatePricePdf } = require("./lib/price-lists");
const RetailOffers = require("./public/retail-offers-model");
const RetailCart = require("./public/retail-cart-model");
const POS = require("./public/pos-model");
const SalesCatalog = require("./lib/sales-catalog");
const { createHash } = require("node:crypto");

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
const RETAIL_OFFERS_FILE = path.join(DATA_DIR, "retail-offers.json");
const ORDER_AVAILABILITY_FILE = path.join(DATA_DIR, "order-availability.json");
const CABA_DELIVERY_RANGES = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "caba-delivery-streets.json"), "utf8"));
const CABA_DELIVERY_NEIGHBORHOODS = ["Villa Urquiza", "Saavedra", "Nuñez", "Belgrano"];
const CLIENT_DOCUMENTS_BUCKET = "client-documents";
const CLIENT_DOCUMENT_TYPES = {
  "price-list": { label: "Lista de precios", legacyFileName: "lista-de-precios.pdf" },
  offers: { label: "Ofertas", legacyFileName: "ofertas.pdf" }
};

loadEnvFile();

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const configuredStoreCacheTtl = Number(process.env.SUPABASE_STORE_CACHE_TTL_MS || 300000);
const SUPABASE_STORE_CACHE_TTL_MS = Number.isFinite(configuredStoreCacheTtl) && configuredStoreCacheTtl >= 0
  ? configuredStoreCacheTtl
  : 300000;
const storeCache = new Map();
const pendingStoreReads = new Map();
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

function cloneStoreRecords(records) {
  return structuredClone(records);
}

function cachedStoreRecords(key) {
  if (SUPABASE_STORE_CACHE_TTL_MS === 0) return null;
  const cached = storeCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    storeCache.delete(key);
    return null;
  }
  return cloneStoreRecords(cached.records);
}

function rememberStoreRecords(key, records) {
  if (SUPABASE_STORE_CACHE_TTL_MS === 0) return;
  storeCache.set(key, {
    records: cloneStoreRecords(records),
    expiresAt: Date.now() + SUPABASE_STORE_CACHE_TTL_MS
  });
}

async function readStore(key, filePath) {
  if (!USE_SUPABASE) return readJsonArray(filePath);
  const cached = cachedStoreRecords(key);
  if (cached) return cached;

  let pendingRead = pendingStoreReads.get(key);
  if (!pendingRead) {
    pendingRead = (async () => {
      const rows = await supabaseRequest(`/rest/v1/app_data?key=eq.${encodeURIComponent(key)}&select=data`);
      const records = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].data)
        ? rows[0].data
        : readJsonArray(filePath);
      rememberStoreRecords(key, records);
      return records;
    })();
    pendingStoreReads.set(key, pendingRead);
  }

  try {
    return cloneStoreRecords(await pendingRead);
  } finally {
    if (pendingStoreReads.get(key) === pendingRead) pendingStoreReads.delete(key);
  }
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
  rememberStoreRecords(key, records);
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
  let digits = cleanText(value).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("54")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("9")) digits = digits.slice(1);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12) {
    for (let areaLength = 2; areaLength <= 4; areaLength += 1) {
      if (digits.slice(areaLength, areaLength + 2) === "15") {
        digits = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
        break;
      }
    }
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function customerIdentity(customer) {
  return customerPhoneKey(customer.phone);
}

function findDuplicateCustomer(customers, candidate, ignoredId = "") {
  const phone = customerPhoneKey(candidate.phone);
  const customerNumber = cleanText(candidate.customerNumber).toLowerCase();
  const cuit = cleanText(candidate.cuit).replace(/\D/g, "");
  return customers.find(current => {
    if (current.id === ignoredId) return false;
    return Boolean(
      (phone && customerPhoneKey(current.phone) === phone) ||
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
    format: ["story", "post", "a4", "a4-single"].includes(value.format) ? value.format : "story",
    title: cleanText(value.title).slice(0, 42) || "OFERTAS DEL DIA",
    subtitle: cleanText(value.subtitle).slice(0, 70) || "CALIDAD SAN CAYETANO",
    offersText: String(value.offersText || "").slice(0, 20_000),
    offerMode: value.offerMode === "linked" ? "linked" : "legacy",
    retailOfferIds: Array.isArray(value.retailOfferIds) ? [...new Set(value.retailOfferIds.filter(id => typeof id === "string"))].slice(0, 30) : [],
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

async function readOrderAvailability() {
  return readStore("order_availability", ORDER_AVAILABILITY_FILE);
}

async function writeOrderAvailability(records) {
  return writeStore("order_availability", ORDER_AVAILABILITY_FILE, records);
}

function isOrderDateUnavailable(exceptions, date, deliveryType) {
  const normalizedType = normalizeDeliveryType(deliveryType);
  return (exceptions || []).find(item => item.date === date && (item.type === "CLOSED" || (item.type === "NO_DELIVERY" && normalizedType === "DELIVERY"))) || null;
}

async function publicOrderPolicyWithAvailability(deliveryType = "RETIRO", now = new Date(), deliveryZone = "REGULAR") {
  const policy = publicOrderDatePolicy(deliveryType, now, deliveryZone);
  const exceptions = await readOrderAvailability();
  let minDate = policy.minDate;
  while ((policy.deliveryZone === "CABA_VIERNES" && !isFridayDate(minDate)) || isSundayDate(minDate) || isOrderDateUnavailable(exceptions, minDate, policy.deliveryType)) {
    minDate = addDaysToDate(minDate, 1);
  }
  return {
    ...policy,
    minDate,
    unavailableDates: exceptions
      .filter(item => item.type === "CLOSED" || (item.type === "NO_DELIVERY" && policy.deliveryType === "DELIVERY"))
      .map(item => ({ date: item.date, type: item.type, note: item.note || "" }))
  };
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

let documentStoreVersion = null;
async function readClientDocuments() {
  let records;
  if (USE_SUPABASE) {
    const rows = await supabaseRequest("/rest/v1/app_data?key=eq.client_documents&select=data,updated_at");
    documentStoreVersion = rows?.[0] ? rows[0].updated_at : null;
    records = rows?.[0] && Array.isArray(rows[0].data) ? rows[0].data : readJsonArray(CLIENT_DOCUMENTS_FILE);
  } else records = readJsonArray(CLIENT_DOCUMENTS_FILE);
  let changed = false;
  for (const record of records) {
    for (const row of record.priceData?.rows || []) {
      if (!row.id) { row.id = cryptoId(); changed = true; }
    }
  }
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
  if (changed) await writeClientDocuments(records);
  return records;
}

async function writeClientDocuments(records) {
  if (!USE_SUPABASE) {
    ensureDataFile();
    const temporary = `${CLIENT_DOCUMENTS_FILE}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, CLIENT_DOCUMENTS_FILE);
    return;
  }
  const updatedAt = new Date(Math.max(Date.now(), (Date.parse(documentStoreVersion) || 0) + 1)).toISOString();
  const result = documentStoreVersion === null
    ? await supabaseRequest("/rest/v1/app_data?on_conflict=key", {
      method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ key: "client_documents", data: records, updated_at: updatedAt })
    })
    : await supabaseRequest(`/rest/v1/app_data?key=eq.client_documents&updated_at=eq.${encodeURIComponent(documentStoreVersion)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ data: records, updated_at: updatedAt })
    });
  if (!Array.isArray(result) || !result.length) throw Object.assign(new Error("Los documentos cambiaron en otra sesión. Actualizá la pantalla antes de guardar."), { statusCode: 409 });
  documentStoreVersion = updatedAt;
  storeCache.delete("client_documents");
}

function retailCatalog(documents) {
  const configured = documents.some(document => typeof document.retailEnabled === "boolean");
  const enabled = document => configured ? document.retailEnabled === true : !/mayorista/i.test(document.name) && /minorista|pollo.*cerdo/i.test(document.name);
  const lists = documents.filter(document => document.type === "price-list").map(document => ({
    id: document.id, name: document.name, ready: Boolean(document.priceData?.rows?.length),
    enabled: enabled(document)
  }));
  const products = documents.filter(document => document.type === "price-list" && enabled(document)).flatMap(document => (document.priceData?.rows || []).map(row => ({
    id: `${document.id}:${row.id}`, documentId: document.id, rowId: row.id, name: row.name,
    listName: document.name, price: row.price, unit: row.unit || ""
  })));
  const revision = createHash("sha256").update(JSON.stringify({ lists, products })).digest("hex");
  return { revision, lists, products };
}

async function publicRetailCatalog() {
  const catalog = retailCatalog(await readClientDocuments());
  const stored = await readRetailOffers();
  const offers = stored.state.offers.filter(offer => RetailOffers.status(offer, catalog.products).code === "active");
  const products = catalog.products.map(product => {
    const offerUnits = [...new Set(offers.filter(o => o.productId === product.id).map(o => o.unit))];
    return { ...product, unit: product.unit || (offerUnits.length === 1 ? offerUnits[0] : "") };
  });
  return { products, offers, notice: RetailCart.NOTICE };
}
async function quoteRetailCart(payload) {
  const quote = RetailCart.quote(await publicRetailCatalog(), payload.cart, payload);
  return { ...quote, quoteId: createHash("sha256").update(JSON.stringify(quote)).digest("hex") };
}

async function readPOS() {
  const file = path.join(DATA_DIR, "pos-practice.json");
  if (!USE_SUPABASE) return { state: readJsonArray(file)[0] || { revision: "initial", mappings: null, sales: [] }, updatedAt: null };
  const rows = await supabaseRequest("/rest/v1/app_data?key=eq.pos_practice&select=data,updated_at");
  return { state: rows?.[0]?.data?.[0] || { revision: "initial", mappings: null, sales: [] }, updatedAt: rows?.[0]?.updated_at || null };
}
async function writePOS(state, expectedUpdatedAt) {
  if (!USE_SUPABASE) {
    ensureDataFile(); const file = path.join(DATA_DIR, "pos-practice.json");
    fs.writeFileSync(file + ".tmp", JSON.stringify([state])); fs.renameSync(file + ".tmp", file); return;
  }
  const updated_at = new Date(Math.max(Date.now(), (Date.parse(expectedUpdatedAt) || 0) + 1)).toISOString();
  const result = expectedUpdatedAt === null
    ? await supabaseRequest("/rest/v1/app_data?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ key: "pos_practice", data: [state], updated_at }) })
    : await supabaseRequest(`/rest/v1/app_data?key=eq.pos_practice&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: [state], updated_at }) });
  if (!Array.isArray(result) || result.length !== 1) throw Object.assign(new Error("Otra caja modificó los datos. Actualizá y reintentá sin cambiar el identificador de la operación."), { statusCode: 409 });
}
async function posCatalog() {
  const stored = await readPOS(); if (stored.state.products) return SalesCatalog.catalog(stored.state);
  const catalog = await publicRetailCatalog();
  return { ...catalog, revision: stored.state.revision, mappings: stored.state.mappings ?? POS.defaultMappings(catalog.products), mode: "practice" };
}
async function posQuote(payload) {
  if (payload.mode !== "practice") throw Object.assign(new Error("Esta caja solo admite operaciones de prueba. No emite facturas."), { statusCode: 400 });
  const catalog = await posCatalog();
  const quote = RetailCart.quote(catalog, payload.cart, { deliveryType: "RETIRO" });
  if (catalog.source === "sales") quote.lines = quote.lines.map(line => ({ ...line, vatRate: catalog.products.find(p => p.id === line.productId).vatRate }));
  const delivery = payload.delivery ?? 0;
  if (typeof delivery !== "number" || !Number.isFinite(delivery) || delivery < 0 || delivery > 999999 || Math.abs(delivery * 100 - Math.round(delivery * 100)) > 1e-5) throw Object.assign(new Error("Revisá el importe de envío."), { statusCode: 400 });
  let sourceOrder = null;
  if (payload.sourceOrderId) {
    storeCache.delete("orders");
    const order = (await readOrders()).find(o => o.id === payload.sourceOrderId);
    if (!order) throw Object.assign(new Error("El pedido de origen ya no existe."), { statusCode: 400 });
    sourceOrder = { id: order.id, number: order.number, updatedAt: order.updatedAt };
  }
  const result = { mode: "practice", lines: quote.lines, subtotal: quote.subtotal, delivery, total: Math.round((quote.subtotal + delivery) * 100) / 100, sourceOrder };
  return { ...result, quoteId: createHash("sha256").update(JSON.stringify(result)).digest("hex") };
}

async function readRetailOffers() {
  if (!USE_SUPABASE) return { state: readJsonArray(RETAIL_OFFERS_FILE)[0] || { revision: "initial", offers: [] }, updatedAt: null };
  const records = await supabaseRequest("/rest/v1/app_data?key=eq.retail_offers&select=data,updated_at");
  return { state: records?.[0]?.data?.[0] || { revision: "initial", offers: [] }, updatedAt: records?.[0]?.updated_at || null };
}

async function writeRetailOffers(state, expectedUpdatedAt) {
  if (!USE_SUPABASE) {
    ensureDataFile();
    fs.writeFileSync(`${RETAIL_OFFERS_FILE}.tmp`, JSON.stringify([state]));
    fs.renameSync(`${RETAIL_OFFERS_FILE}.tmp`, RETAIL_OFFERS_FILE);
    return;
  }
  const updated_at = new Date(Math.max(Date.now(), (Date.parse(expectedUpdatedAt) || 0) + 1)).toISOString();
  const result = expectedUpdatedAt === null
    ? await supabaseRequest("/rest/v1/app_data?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ key: "retail_offers", data: [state], updated_at }) })
    : await supabaseRequest(`/rest/v1/app_data?key=eq.retail_offers&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: [state], updated_at }) });
  if (!Array.isArray(result) || result.length !== 1) throw Object.assign(new Error("Otra computadora modificó las ofertas. Recargá antes de guardar."), { statusCode: 409 });
}

function publicDocumentMetadata({ storageName, priceData, priceHistory, priceRevision, retailEnabled, ...record }) {
  return record;
}

async function readClientDocumentBuffer(document) {
  const storageName = clientDocumentStorageName(document);
  if (USE_SUPABASE) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${CLIENT_DOCUMENTS_BUCKET}/${storageName}`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
    });
    if (!response.ok) throw new Error("No se pudo leer el PDF original.");
    return Buffer.from(await response.arrayBuffer());
  }
  return fs.promises.readFile(path.join(DATA_DIR, storageName));
}

function priceSnapshot(document) {
  return {
    id: document.priceRevision || document.updatedAt,
    updatedAt: document.updatedAt, storageName: clientDocumentStorageName(document),
    size: document.size, data: document.priceData || null
  };
}

async function handlePriceEditor(req, res, documentId, action, versionId) {
  const records = await readClientDocuments();
  const document = records.find(item => item.id === documentId && item.type === "price-list");
  if (!document) return sendJson(res, 404, { error: "Lista de precios no encontrada." });
  const revision = document.priceRevision || document.updatedAt;
  const versions = [...(document.priceHistory || []), priceSnapshot(document)];
  if (action === "versions" && req.method === "GET") {
    if (versionId) {
      const version = versions.find(item => item.id === versionId);
      if (!version) return sendJson(res, 404, { error: "Versión no encontrada." });
      return sendClientDocument(res, { ...document, storageName: version.storageName });
    }
    return sendJson(res, 200, versions.map(({ id, updatedAt, data }) => ({ id, updatedAt, original: !data, current: id === revision })).reverse());
  }
  if (action === "prices" && req.method === "GET") {
    const result = document.priceData ? { data: document.priceData, warnings: [], unrecognized: [] } : await importPriceList(await readClientDocumentBuffer(document), document.name);
    return sendJson(res, 200, { ...result, revision, imported: !document.priceData });
  }
  if ((action === "prices" && req.method === "PUT") || (action === "preview" && req.method === "POST") || (action === "restore" && req.method === "POST")) {
    const payload = await readBody(req);
    if (action !== "preview" && payload.revision !== revision) return sendJson(res, 409, { error: "Otra persona modificó esta lista. Cerrá y volvé a abrir el editor antes de guardar." });
    if (action === "restore") {
      const version = versions.find(item => item.id === payload.versionId);
      if (!version) return sendJson(res, 404, { error: "Versión no encontrada." });
      // Verify the archived object before making it the current public PDF.
      await readClientDocumentBuffer({ ...document, storageName: version.storageName });
      const updated = { ...document, storageName: version.storageName, size: version.size, priceData: version.data, priceHistory: versions, priceRevision: cryptoId(), updatedAt: new Date().toISOString() };
      await writeClientDocuments(records.map(item => item.id === documentId ? updated : item));
      return sendJson(res, 200, { ok: true, revision: updated.priceRevision });
    }
    if (!document.priceData && action === "prices" && payload.reviewed !== true) return sendJson(res, 400, { error: "Revisá la importación contra el original y confirmá la revisión antes de guardar." });
    const data = validatePriceList(payload.data);
    const buffer = await generatePricePdf(data);
    if (action === "preview") {
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": buffer.length, "Cache-Control": "no-store" });
      return res.end(buffer);
    }
    const nextRevision = cryptoId();
    const previousRows = document.priceData?.rows || [];
    const assignedIds = new Set(data.rows.filter(row => row.id).map(row => row.id));
    for (const row of data.rows) {
      if (!row.id) {
        const matches = previousRows.filter(previous => previous.name === row.name);
        row.id = matches.length === 1 && !assignedIds.has(matches[0].id) ? matches[0].id : cryptoId();
      }
      assignedIds.add(row.id);
      if (row.unit === undefined) {
        const previous = previousRows.find(previous => previous.id === row.id);
        if (previous?.unit) row.unit = previous.unit;
      }
    }
    const updated = { ...document, priceData: data, priceHistory: versions, priceRevision: nextRevision, storageName: `price-list/${documentId}/${nextRevision}.pdf`, size: buffer.length, updatedAt: new Date().toISOString() };
    // Upload an immutable object first; a metadata failure leaves the published
    // PDF and its history untouched. Never overwrite the original object.
    await saveClientDocument(updated, buffer);
    await writeClientDocuments(records.map(item => item.id === documentId ? updated : item));
    return sendJson(res, 200, { ok: true, revision: nextRevision });
  }
  return sendJson(res, 405, { error: "Método no permitido." });
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

function normalizedAddressKey(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCabaNeighborhood(value) {
  const key = normalizedAddressKey(value);
  return CABA_DELIVERY_NEIGHBORHOODS.find(name => normalizedAddressKey(name) === key) || "";
}

function cabaStreetsForNeighborhood(value) {
  const neighborhood = normalizeCabaNeighborhood(value);
  if (!neighborhood) return [];
  return [...new Set(CABA_DELIVERY_RANGES
    .filter(range => range.neighborhood === neighborhood)
    .map(range => range.street))]
    .sort((a, b) => a.localeCompare(b, "es"));
}

function validateCabaDeliveryAddress(neighborhoodValue, streetValue, streetNumberValue) {
  const neighborhood = normalizeCabaNeighborhood(neighborhoodValue);
  const streetKey = normalizedAddressKey(streetValue);
  const streetNumber = Number(streetNumberValue);
  if (!neighborhood || !streetKey || !Number.isInteger(streetNumber) || streetNumber < 1) return false;
  const parity = streetNumber % 2 === 0 ? "even" : "odd";
  return CABA_DELIVERY_RANGES.some(range =>
    range.neighborhood === neighborhood &&
    range.key === streetKey &&
    range.parity === parity &&
    streetNumber >= range.from &&
    streetNumber <= range.to
  );
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

function isFridayDate(dateText) {
  return new Date(`${dateText}T12:00:00Z`).getUTCDay() === 5;
}

function nextWorkingDate(dateText) {
  return isSundayDate(dateText) ? addDaysToDate(dateText, 1) : dateText;
}

function nextFridayDate(dateText, includeDate = true) {
  let candidate = includeDate ? dateText : addDaysToDate(dateText, 1);
  while (!isFridayDate(candidate)) candidate = addDaysToDate(candidate, 1);
  return candidate;
}

function publicOrderDatePolicy(deliveryType = "RETIRO", now = new Date(), deliveryZone = "REGULAR") {
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
  const normalizedZone = deliveryZone === "CABA_VIERNES" ? "CABA_VIERNES" : "REGULAR";
  const isSaturday = new Date(`${today}T12:00:00Z`).getUTCDay() === 6;
  const cutoffHour = normalizedType === "DELIVERY" ? 11 : isSaturday ? 8 : 13;
  const afterCutoff = Number(parts.hour) >= cutoffHour;
  const regularMinDate = nextWorkingDate(afterCutoff ? addDaysToDate(today, 1) : today);
  return {
    today,
    afterCutoff,
    minDate: normalizedZone === "CABA_VIERNES" ? nextFridayDate(today, !(isFridayDate(today) && afterCutoff)) : regularMinDate,
    cutoffHour,
    deliveryType: normalizedType,
    deliveryZone: normalizedZone
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
  const deliveryZone = input.deliveryZone === "CABA_VIERNES" ? "CABA_VIERNES" : "REGULAR";
  const orderAmountValue = Number(input.orderAmount ?? existing.orderAmount ?? 0);
  const deliveryFeeValue = Number(input.deliveryFee ?? existing.deliveryFee ?? 0);

  return {
    id: existing.id || cryptoId(),
    number: existing.number || 0,
    customer: cleanText(input.customer),
    phone: cleanText(input.phone),
    address: cleanText(input.address),
    deliveryType,
    deliveryZone,
    cabaNeighborhood: deliveryZone === "CABA_VIERNES" ? normalizeCabaNeighborhood(input.cabaNeighborhood || existing.cabaNeighborhood) : "",
    cabaStreet: deliveryZone === "CABA_VIERNES" ? cleanText(input.cabaStreet || existing.cabaStreet) : "",
    cabaStreetNumber: deliveryZone === "CABA_VIERNES" ? Number.parseInt(input.cabaStreetNumber || existing.cabaStreetNumber, 10) || 0 : 0,
    cabaAddressExtra: deliveryZone === "CABA_VIERNES" ? cleanText(input.cabaAddressExtra || existing.cabaAddressExtra) : "",
    orderAmount: Number.isFinite(orderAmountValue) && orderAmountValue > 0 ? Math.round(orderAmountValue) : 0,
    deliveryFee: Number.isFinite(deliveryFeeValue) && deliveryFeeValue >= 0 ? Math.round(deliveryFeeValue) : 0,
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
    ...(existing.retailCart ? { retailCart: existing.retailCart, retailRequestId: existing.retailRequestId } : {}),
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
  return customerPhoneKey(order.phone);
}

async function saveCustomerFromOrder(order, options = {}) {
  if (!order.customer || !customerPhoneKey(order.phone)) return;
  const customers = await readCustomers();
  const key = customerKey(order);
  const index = customers.findIndex(customer => customerIdentity(customer) === key);
  const saved = {
    id: index === -1 ? cryptoId() : customers[index].id,
    name: order.customer,
    phone: order.phone,
    address: index === -1 ? "" : customers[index].address,
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
    if (!order.customer || !customerPhoneKey(order.phone)) continue;
    const key = customerKey(order);
    if (!key || knownKeys.has(key)) continue;
    customers.push({
      id: cryptoId(),
      name: order.customer,
      phone: order.phone,
      address: "",
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
  const requestedPath =
    rawUrl.pathname === "/pedido-mayorista.html"
      ? "/cliente.html"
      : rawUrl.pathname;
  const requested =
    requestedPath === "/" ? "/index.html" : decodeURIComponent(requestedPath);
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

// Document writes share one record collection. Serialize uploads, reorders,
// edits and deletes so concurrent requests in this server cannot lose updates.
let documentQueue = Promise.resolve();
async function handleApi(req, res) {
  const pathname = new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname;
  if (!/^\/api\/(?:(?:public-)?client-documents|(?:public-)?retail-offers|public-retail-catalog|public-retail-quote|public-orders|orders|pos)(?:\/|$)/.test(pathname)) return handleApiRequest(req, res);
  const previous = documentQueue;
  let release;
  documentQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    storeCache.delete("client_documents");
    return await handleApiRequest(req, res);
  } finally { release(); }
}

async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  try {
    if (url.pathname === "/api/retail-offers/catalog" && req.method === "GET") {
      return sendJson(res, 200, retailCatalog(await readClientDocuments()));
    }
    if (url.pathname === "/api/pos/catalog" && req.method === "GET") return sendJson(res, 200, await posCatalog());
    if (url.pathname === "/api/pos/catalog" && req.method === "PUT") {
      const payload = await readBody(req); const stored = await readPOS();
      if (payload.revision !== stored.state.revision) return sendJson(res, 409, { error: "El catálogo cambió. Actualizá antes de guardar." });
      const products = SalesCatalog.validateProducts(payload.products);
      const mappings = payload.mappings === undefined ? (stored.state.products ? stored.state.mappings ?? SalesCatalog.mappings(products) : SalesCatalog.mappings(products)) : payload.mappings;
      const normalizedMappings = POS.normalizeMappings(mappings, products);
      await writePOS({ ...stored.state, revision: cryptoId(), products, mappings: normalizedMappings }, stored.updatedAt);
      return sendJson(res, 200, await posCatalog());
    }
    if (url.pathname === "/api/pos/mappings" && req.method === "PUT") {
      const payload = await readBody(req); const catalog = await posCatalog(); const stored = await readPOS();
      if (payload.revision !== stored.state.revision) return sendJson(res, 409, { error: "Los códigos cambiaron. Actualizá antes de guardar." });
      const mappings = POS.normalizeMappings(payload.mappings, catalog.products);
      await writePOS({ ...stored.state, revision: cryptoId(), mappings }, stored.updatedAt);
      return sendJson(res, 200, await posCatalog());
    }
    if (url.pathname === "/api/pos/quote" && req.method === "POST") return sendJson(res, 200, await posQuote(await readBody(req)));
    if (url.pathname === "/api/pos/orders" && req.method === "GET") {
      storeCache.delete("orders");
      const orders = (await readOrders()).filter(o => o.saleType !== "Mayorista" && !["Despachado", "Cancelado"].includes(o.status));
      const catalog = await posCatalog();
      return sendJson(res, 200, orders.map(o => {
        const unchanged = o.retailCart && o.detail === RetailCart.detail(o.retailCart);
        const recovered = !unchanged ? {lines:[],missing:[]} : catalog.source === "sales" ? SalesCatalog.orderLines(o,catalog.products) : {lines:o.retailCart.lines.map(l=>({productId:l.productId,quantity:l.quantity,unit:l.unit,note:l.note})),missing:[]};
        return { id:o.id, number:o.number, customer:o.customer, detail:o.detail, notes:o.notes, deliveryType:o.deliveryType, updatedAt:o.updatedAt, ...recovered };
      }));
    }
    if (url.pathname === "/api/pos/sales" && req.method === "GET") return sendJson(res, 200, (await readPOS()).state.sales.slice(-100).reverse());
    if (url.pathname === "/api/pos/sales" && req.method === "POST") {
      const payload = await readBody(req);
      if (payload.mode !== "practice" || payload.weightsConfirmed !== true) return sendJson(res, 400, { error: "Confirmá las cantidades y pesos. Esta operación es solo de prueba." });
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(payload.requestId || "")) return sendJson(res, 400, { error: "Revisá nuevamente la venta antes de guardarla." });
      const stored = await readPOS(); const duplicate = stored.state.sales.find(s => s.requestId === payload.requestId);
      if (duplicate) return sendJson(res, 200, duplicate);
      const quote = await posQuote(payload);
      if (payload.quoteId !== quote.quoteId) return sendJson(res, 409, { error: "Cambió un precio, una oferta o el pedido de origen. Revisá nuevamente la venta." });
      const payment = POS.payment(payload.paymentMethod, payload.received, quote.total);
      if (stored.state.sales.length >= 1000) return sendJson(res, 400, { error: "Se alcanzó el límite de 1000 ventas de prueba." });
      const sale = { ...quote, id: cryptoId(), requestId: payload.requestId, number: stored.state.sales.length + 1, createdAt: new Date().toISOString(), customer: cleanText(payload.customer).slice(0, 160), notes: cleanText(payload.notes).slice(0, 1000), payment, fiscal: false };
      await writePOS({ ...stored.state, revision: cryptoId(), sales: [...stored.state.sales, sale] }, stored.updatedAt);
      return sendJson(res, 201, sale);
    }
    if (url.pathname === "/api/public-retail-catalog" && req.method === "GET") return sendJson(res, 200, await publicRetailCatalog());
    if (url.pathname === "/api/public-retail-quote" && req.method === "POST") return sendJson(res, 200, await quoteRetailCart(await readBody(req)));
    if (url.pathname === "/api/retail-offers/catalog" && req.method === "PUT") {
      const payload = await readBody(req);
      const documents = await readClientDocuments();
      const catalog = retailCatalog(documents);
      if (payload.revision !== catalog.revision) return sendJson(res, 409, { error: "Las listas cambiaron. Recargá las listas antes de guardar la selección." });
      if (!Array.isArray(payload.documentIds) || new Set(payload.documentIds).size !== payload.documentIds.length || payload.documentIds.some(id => !catalog.lists.some(list => list.id === id && list.ready))) return sendJson(res, 400, { error: "Elegí listas con precios revisados y guardados en el editor." });
      await writeClientDocuments(documents.map(document => document.type === "price-list" ? { ...document, retailEnabled: payload.documentIds.includes(document.id) } : document));
      return sendJson(res, 200, retailCatalog(await readClientDocuments()));
    }
    if (["/api/retail-offers", "/api/public-retail-offers"].includes(url.pathname)) {
      const catalog = retailCatalog(await readClientDocuments());
      const stored = await readRetailOffers();
      if (req.method === "GET") {
        const offers = stored.state.offers.map(offer => ({ ...offer, status: RetailOffers.status(offer, catalog.products) }));
        if (url.pathname === "/api/public-retail-offers") return sendJson(res, 200, { audience: "retail", date: RetailOffers.today(), offers: offers.filter(offer => offer.status.code === "active").map(({ status, ...offer }) => offer) });
        return sendJson(res, 200, { revision: stored.state.revision, offers });
      }
      if (req.method === "PUT" && url.pathname === "/api/retail-offers") {
        const payload = await readBody(req);
        if (payload.revision !== stored.state.revision) return sendJson(res, 409, { error: "Las ofertas cambiaron en otra computadora. Recargá antes de guardar." });
        const offers = RetailOffers.normalizeOffers(payload.offers, catalog.products, stored.state.offers, cryptoId);
        const state = { revision: cryptoId(), offers };
        await writeRetailOffers(state, stored.updatedAt);
        return sendJson(res, 200, { ...state, offers: offers.map(offer => ({ ...offer, status: RetailOffers.status(offer, catalog.products) })) });
      }
      return sendJson(res, 405, { error: "Método no permitido." });
    }
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

    if (url.pathname === "/api/order-availability" && req.method === "GET") {
      return sendJson(res, 200, (await readOrderAvailability()).sort((a, b) => a.date.localeCompare(b.date)));
    }

    if (url.pathname === "/api/order-availability" && req.method === "POST") {
      const payload = await readBody(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanText(payload.date))) return sendJson(res, 400, { error: "Selecciona una fecha valida." });
      const date = payload.date;
      const type = payload.type === "NO_DELIVERY" ? "NO_DELIVERY" : "CLOSED";
      const records = await readOrderAvailability();
      const existing = records.find(item => item.date === date);
      const item = { id: existing?.id || cryptoId(), date, type, note: cleanText(payload.note).slice(0, 120), createdAt: existing?.createdAt || new Date().toISOString() };
      await writeOrderAvailability(existing ? records.map(current => current.id === existing.id ? item : current) : [...records, item]);
      return sendJson(res, existing ? 200 : 201, item);
    }

    const availabilityMatch = url.pathname.match(/^\/api\/order-availability\/([^/]+)$/);
    if (availabilityMatch && req.method === "DELETE") {
      const records = await readOrderAvailability();
      await writeOrderAvailability(records.filter(item => item.id !== availabilityMatch[1]));
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/public-client-documents" && req.method === "GET") {
      const records = await readClientDocuments();
      const visible = records.map(publicDocumentMetadata).sort((a, b) => {
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

    if (["/api/client-documents/create-price-list", "/api/client-documents/create-price-list/preview"].includes(url.pathname) && req.method === "POST") {
      const payload = await readBody(req);
      const data = validatePriceList(payload.data);
      const buffer = await generatePricePdf(data);
      if (url.pathname.endsWith("/preview")) {
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": buffer.length, "Cache-Control": "no-store" });
        return res.end(buffer);
      }
      const records = await readClientDocuments();
      const catalog = retailCatalog(records);
      const id = cryptoId();
      data.rows.forEach(row => { row.id = cryptoId(); });
      const order = Math.max(-1, ...records.filter(item => item.type === "price-list").map(item => Number.isFinite(item.order) ? item.order : 0)) + 1;
      const name = data.title.replace(/[\\/:*?"<>|]/g, "-").replace(/\.pdf$/i, "") + ".pdf";
      const metadata = { id, type: "price-list", name, size: buffer.length, storageName: `price-list/${id}.pdf`, order, updatedAt: new Date().toISOString(), priceData: data, priceHistory: [], priceRevision: cryptoId(), retailEnabled: payload.retailEnabled === true };
      await saveClientDocument(metadata, buffer);
      // Preserve inferred source choices when introducing an explicit selection.
      const updated = records.map(record => record.type === "price-list" ? { ...record, retailEnabled: catalog.lists.find(list => list.id === record.id).enabled } : record);
      await writeClientDocuments([...updated, metadata]);
      return sendJson(res, 201, { document: publicDocumentMetadata(metadata), revision: metadata.priceRevision });
    }
    const priceEditorMatch = url.pathname.match(/^\/api\/client-documents\/([^/]+)\/(prices|preview|versions|restore)(?:\/([^/]+))?$/);
    if (priceEditorMatch) return await handlePriceEditor(req, res, priceEditorMatch[1], priceEditorMatch[2], priceEditorMatch[3] ? decodeURIComponent(priceEditorMatch[3]) : undefined);

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
      await writeClientDocuments(records.filter(item => item !== document));
      const storageNames = new Set([clientDocumentStorageName(document), ...(document.priceHistory || []).map(version => version.storageName)]);
      // The document is no longer published. Cleanup failure must not leave a
      // published record pointing at an object that has already been deleted.
      for (const storageName of storageNames) await deleteClientDocumentFile({ ...document, storageName }).catch(error => console.error("Document cleanup:", error.message));
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
      if (!customer.name || customerPhoneKey(customer.phone).length < 8) return sendJson(res, 400, { error: "Completa el nombre y un telefono valido (al menos 8 numeros)." });
      const customers = await readCustomers();
      const duplicate = findDuplicateCustomer(customers, customer);
      if (duplicate && duplicate.active !== false) return sendJson(res, 409, { error: "Ya existe un cliente con ese telefono, CUIT o numero de cliente/marcada." });
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
      if (!customer.name || customerPhoneKey(customer.phone).length < 8) return sendJson(res, 400, { error: "Completa el nombre y un telefono valido (al menos 8 numeros)." });
      const duplicate = findDuplicateCustomer(customers, customer, customers[index].id);
      if (duplicate) return sendJson(res, 409, { error: "Ya existe otro cliente con ese telefono, CUIT o numero de cliente/marcada." });
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
        return sendJson(res, 409, { error: "Ya existe un cliente con ese telefono, CUIT o numero de cliente/marcada." });
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
      return sendJson(res, 200, await publicOrderPolicyWithAvailability(url.searchParams.get("deliveryType"), new Date(), url.searchParams.get("deliveryZone")));
    }

    if (url.pathname === "/api/caba-delivery-streets" && req.method === "GET") {
      const neighborhood = normalizeCabaNeighborhood(url.searchParams.get("neighborhood"));
      if (!neighborhood) return sendJson(res, 400, { error: "Seleccioná uno de los barrios habilitados." });
      return sendJson(res, 200, { neighborhood, streets: cabaStreetsForNeighborhood(neighborhood) });
    }

    if (url.pathname === "/api/public-orders" && req.method === "POST") {
      const payload = await readBody(req);
      let cartQuote = null;
      if (payload.cart !== undefined) {
        if (normalizeSaleType(payload.saleType) !== "Minorista") return sendJson(res, 400, { error: "El carrito está disponible para pedidos minoristas." });
        if (payload.estimatedAccepted !== true) return sendJson(res, 400, { error: "Confirmá que entendés que el total es estimado y varía según el peso real." });
        if (typeof payload.requestId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(payload.requestId)) return sendJson(res, 400, { error: "Volvé a revisar el carrito antes de enviarlo." });
        const duplicate = (await readOrders()).find(order => order.retailRequestId === payload.requestId);
        if (duplicate) return sendJson(res, 200, { ok: true, number: duplicate.number, retailCart: duplicate.retailCart });
        cartQuote = await quoteRetailCart(payload);
        if (payload.quoteId !== cartQuote.quoteId) return sendJson(res, 409, { error: "Cambió un precio, una oferta o el envío. Revisá el nuevo total estimado antes de enviar.", quote: cartQuote });
        payload.detail = RetailCart.detail(cartQuote);
        payload.items = [];
        payload.orderAmount = 0;
        payload.deliveryFee = 0;
      }
      const cabaDelivery = payload.deliveryZone === "CABA_VIERNES";
      const effectiveDeliveryType = cabaDelivery ? "DELIVERY" : payload.deliveryType;
      const datePolicy = await publicOrderPolicyWithAvailability(effectiveDeliveryType, new Date(), payload.deliveryZone);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanText(payload.prepDate)) || payload.prepDate < datePolicy.minDate) {
        const error = datePolicy.afterCutoff
          ? `Los pedidos con ${datePolicy.deliveryType === "DELIVERY" ? "delivery" : "retiro por el local"} para hoy cerraron a las ${datePolicy.cutoffHour}:00. Elegi una fecha desde ${datePolicy.minDate}.`
          : `Elegi una fecha desde ${datePolicy.minDate}.`;
        return sendJson(res, 400, { error, ...datePolicy });
      }
      if (isSundayDate(payload.prepDate)) {
        return sendJson(res, 400, { error: "Los domingos no trabajamos ni realizamos entregas. Elegi otra fecha." });
      }
      if (cabaDelivery && !isFridayDate(payload.prepDate)) {
        return sendJson(res, 400, { error: "El delivery CABA se realiza únicamente los viernes." });
      }
      const unavailable = isOrderDateUnavailable(await readOrderAvailability(), payload.prepDate, effectiveDeliveryType);
      if (unavailable) {
        const reason = unavailable.type === "CLOSED" ? "El local permanecera cerrado" : "No habra delivery";
        return sendJson(res, 400, { error: `${reason} el ${payload.prepDate}${unavailable.note ? `: ${unavailable.note}` : "."}` });
      }
      if (cabaDelivery) {
        if (!validateCabaDeliveryAddress(payload.cabaNeighborhood, payload.cabaStreet, Number(payload.cabaStreetNumber))) {
          return sendJson(res, 400, { error: "La calle y altura no corresponden al barrio seleccionado o están fuera de la zona de entrega CABA." });
        }
        payload.deliveryType = "DELIVERY";
        payload.deliveryZone = "CABA_VIERNES";
        payload.cabaNeighborhood = normalizeCabaNeighborhood(payload.cabaNeighborhood);
        payload.cabaStreetNumber = Number.parseInt(payload.cabaStreetNumber, 10);
        payload.address = [payload.cabaStreet, payload.cabaStreetNumber, cleanText(payload.cabaAddressExtra), payload.cabaNeighborhood, "CABA"].filter(Boolean).join(" - ");
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
      if (cartQuote) {
        order.retailCart = { ...cartQuote, estimatedAccepted: true, acceptedAt: new Date().toISOString() };
        order.retailRequestId = payload.requestId;
      }
      order.updatedBy = "Cliente";
      orders.push(order);
      await writeOrders(orders);
      await appendMovement(order, "Pedido provisorio recibido", "Cliente", "Cargado desde formulario de cliente");
      return sendJson(res, 201, { ok: true, number: order.number, ...(cartQuote ? { retailCart: order.retailCart } : {}) });
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
    return sendJson(res, error.statusCode || 500, { error: error.message || "Error del servidor." });
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

module.exports = { cabaStreetsForNeighborhood, customerPhoneKey, findDuplicateCustomer, isOrderDateUnavailable, normalizeCustomer, normalizeOrder, normalizeSaleType, publicOrderDatePolicy, runDataMigrations, server, startServer, validateCabaDeliveryAddress };
