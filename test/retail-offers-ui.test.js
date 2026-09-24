const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const model = require("../public/retail-offers-model");
const generator = require("../public/offers-generator");
const tick = () => new Promise(resolve => setImmediate(resolve));

test("importa una placa sin activar ofertas, vincula paquetes y bloquea descargas sin guardar", async t => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8"), { runScripts: "outside-only", url: "http://localhost" });
  t.after(() => dom.window.close());
  const { window } = dom;
  const el = id => window.document.getElementById(id);
  window.RetailOffersModel = model; window.OfferImageGenerator = generator;
  window.confirm = () => true;
  window.updateOfferPoster = () => {};
  window.HTMLElement.prototype.scrollIntoView = function () {};
  const catalog = { revision: "catalog-1", lists: [{ id: "retail", name: "Minorista", enabled: true, ready: true }], products: [{ id: "retail:chicken", name: "Pata y muslo", listName: "Minorista", documentId: "retail", unit: "kg", price: 4000 }] };
  let saved = { revision: "initial", offers: [] }, generation = 0, fail = false;
  window.fetch = async (url, options) => {
    if (fail) throw new Error("Sin conexión");
    if (url.endsWith("/catalog")) return { ok: true, json: async () => catalog };
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      saved = { revision: String(++generation), offers: model.normalizeOffers(body.offers, catalog.products, saved.offers, () => "offer-1") };
    }
    return { ok: true, json: async () => structuredClone(saved) };
  };
  el("offerPosterOffersText").value = "3Kg Pata y Muslo x $9.900";
  window.eval(fs.readFileSync(path.join(__dirname, "../public/retail-offers-studio.js"), "utf8"));
  await tick();
  assert.equal(el("retailOffersFields").disabled, false);
  el("retailOfferImport").click();
  const card = el("retailOfferCards").firstElementChild;
  const input = field => card.querySelector(`[data-field="${field}"]`);
  const change = (field, value) => { if (input(field).type === "checkbox") input(field).checked = value; else input(field).value = value; input(field).dispatchEvent(new window.Event("input", { bubbles: true })); };
  assert.equal(input("active").checked, false);
  assert.equal(input("quantity").value, "3");
  assert.equal(input("price").value, "9900");
  assert.equal(input("unit").value, "kg");
  assert.equal(window.RetailOffersStudio.posterOffers().length, 0);
  change("productId", "retail:chicken"); change("active", true); change("selected", true);
  assert.equal(window.RetailOffersStudio.posterOffers()[0].unit, "PAQUETE 3 KG");
  await assert.rejects(window.RetailOffersStudio.prepareDownload(), /Guardá/);
  el("retailOffersSave").click(); await tick();
  assert.equal(saved.offers[0].quantity, 3);
  assert.equal(saved.offers[0].productId, "retail:chicken");
  assert.deepEqual(Array.from(window.RetailOffersStudio.selectedIds()), ["offer-1"]);
  await window.RetailOffersStudio.prepareDownload();
  assert.equal(el("offerPosterOffersText").value, "3Kg Pata y Muslo x $9.900");
  fail = true;
  await assert.rejects(window.RetailOffersStudio.prepareDownload(), /Sin conexión/);
  fail = false;
  saved.offers[0].endDate = "2000-01-01"; saved.revision = "external-change";
  await assert.rejects(window.RetailOffersStudio.prepareDownload(), /cambiaron/);
  assert.equal(window.RetailOffersStudio.posterOffers().length, 0);
});
