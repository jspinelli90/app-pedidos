const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const prices = require('../lib/produce-customer-prices');
const { isPublicRequest } = require('../lib/admin-access');
const source = [
  { name: 'Banana', unit: 'KG', salePrice: '1000', offerPrice: '800', offerQuantity: '2', referenceCost: 'PRIVATE-COST', packageType: 'Cajón', packagePrice: '15000' },
  { name: 'Acelga', unit: 'UNIT', salePrice: '500', offerPrice: '400', offerQuantity: '3' },
  { name: 'Solo mayorista', unit: 'KG', packageType: 'Bolsa', packagePrice: '9999' },
  { name: 'Solo costo privado', unit: 'KG', referenceCost: '444' },
];
test('lectura pública consulta únicamente campos de venta y recalcula ofertas y precios vigentes', async () => {
  let sql, records = source;
  const query = async text => { sql = text; return { rows: records }; };
  const first = await prices.read(query);
  assert.match(sql, /EssentialsProduceItem/);assert.doesNotMatch(sql, /\*|referenceCost|Receipt|totalCost|unitCost/);
  assert.equal(first.length, 3);assert.match(first[0].article, /Acelga/);
  assert.match(first.find(r=>r.article.includes('Banana')).offer, /2 kg por \$\s*1\.600,00/);
  assert.match(first[0].offer, /3 unidades por \$\s*1\.200,00/);
  assert.match(first.find(r=>r.article.includes('Solo mayorista')).wholesale, /Bolsa/);
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE|referenc|Solo costo privado/);
  records = [{...source[0],salePrice:'1200',offerPrice:null,packagePrice:null}];
  const fresh = await prices.read(query);assert.match(fresh[0].retail,/1\.200,00/);assert.equal(fresh[0].offer,'—');assert.equal(fresh[0].wholesale,'—');
  assert.equal(isPublicRequest('GET','/api/public-produce-prices'),true);assert.equal(isPublicRequest('POST','/api/public-produce-prices'),false);
});
test('PDF unificado tiene título, todas las columnas, cantidades de oferta y no contiene costos', async () => {
  const rows=prices.customerRows(source),buffer=await prices.pdf(rows,new Date('2026-11-19T15:00:00Z'));
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise;
  let text='';for(let n=1;n<=pdf.numPages;n++)text+=(await(await pdf.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ');
  assert.match(text,/Esenciales - Verdulería Mayorista y Minorista/);assert.match(text,/Precio minorista/);assert.match(text,/Precio por bulto/);assert.match(text,/Oferta/);assert.match(text,/1\.600,00/);assert.doesNotMatch(text,/PRIVATE|Costo|Solo costo privado/);
  const directory=path.resolve('work/produce-price-preview');fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'lista.pdf'),buffer);
  const many=Array.from({length:90},(_,i)=>({...source[0],name:`Artículo de prueba ${String(i).padStart(3,'0')} con nombre largo para comprobar el ajuste de texto`}));
  fs.writeFileSync(path.join(directory,'lista-larga.pdf'),await prices.pdf(prices.customerRows(many)));
});
test('las dos páginas muestran la misma lista y las fallas no ocultan los otros documentos', async t => {
  const html=fs.readFileSync(path.resolve('public/cliente.html'),'utf8');
  const script=fs.readFileSync(path.resolve('public/cliente.js'),'utf8');
  const names=['loadClientDocuments','renderClientDocumentLinks','documentNode'];
  const functions=names.map(name=>{const start=script.indexOf((name==='loadClientDocuments'?'async ':'')+`function ${name}(`);return script.slice(start,script.indexOf('\n}',start)+2);}).join('\n');
  for(const page of ['cliente.html','pedido-mayorista.html']) {
    const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/'+page});t.after(()=>dom.window.close());
    const window=dom.window;let available=true,docsFail=false;
    window.fetch=async url=>url.includes('public-produce-prices')?{ok:true,json:async()=>({available})}:docsFail?{ok:false}:{ok:true,json:async()=>({'price-list':[{id:'carne',name:'Carne'}],offers:[]})};
    const ids=['clientDocuments','clientPriceListsGroup','clientOffersGroup','clientPriceLists','clientOffers','clientProducePricesGroup'];
    const load=window.eval(ids.map(id=>`const ${id}=document.getElementById('${id}');`).join('\n')+functions+'\nloadClientDocuments;');
    await load();assert.equal(window.document.getElementById('clientProducePricesGroup').hidden,false);
    assert.equal(window.document.querySelector('#clientProducePricesGroup a').getAttribute('href'),'/api/public-produce-prices?formato=pdf');
    docsFail=true;await load();assert.equal(window.document.getElementById('clientDocuments').hidden,false);
    available=false;docsFail=false;await load();assert.equal(window.document.getElementById('clientProducePricesGroup').hidden,true);assert.equal(window.document.getElementById('clientDocuments').hidden,false);
  }
});
test('endpoint anónimo no cachea, vuelve a leer al abrir PDF y no revela errores de la conexión', async t => {
  process.env.PORT='0';fs.mkdirSync(path.resolve('work'),{recursive:true});process.env.DATA_DIR=fs.mkdtempSync(path.resolve('work/produce-endpoint-'));
  const reader=t.mock.method(prices,'read',async()=>prices.customerRows(source));
  const {server,startServer}=require('../server');await startServer();t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/public-produce-prices`;
  const metadata=await fetch(url);assert.equal(metadata.status,200);assert.match(metadata.headers.get('cache-control'),/no-store/);assert.deepEqual(await metadata.json(),{available:true,title:prices.TITLE});
  const response=await fetch(url+'?formato=pdf');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,4).toString(),'%PDF');assert.equal(reader.mock.callCount(),2);
  reader.mock.mockImplementation(async()=>{throw Error('postgres://SECRET:user@private-host')});const failed=await fetch(url);assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/SECRET|postgres|private-host/);
});
