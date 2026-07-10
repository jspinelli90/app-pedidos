const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ENV_FILE = path.join(ROOT, ".env");

const STORES = [
  { key: "orders", file: "orders.json", label: "pedidos" },
  { key: "customers", file: "customers.json", label: "clientes" },
  { key: "users", file: "users.json", label: "usuarios" },
  { key: "movements", file: "movements.json", label: "movimientos" }
];

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/);
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

function readJsonArray(fileName) {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function upsertStore({ key, file, label }) {
  const records = readJsonArray(file);
  const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/app_data`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify({ key, data: records, updated_at: new Date().toISOString() })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${label}: Supabase respondio ${response.status}. ${detail}`);
  }

  console.log(`${label}: ${records.length} registros subidos`);
}

async function main() {
  loadEnvFile();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Falta configurar SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  }

  for (const store of STORES) {
    await upsertStore(store);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
