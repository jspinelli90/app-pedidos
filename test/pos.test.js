const test=require('node:test');const assert=require('node:assert/strict');const M=require('../public/pos-model');
const products=[{id:'a',name:'ASADO AMERICANO',listName:'CARNE MINORISTA.pdf',price:17000,unit:'kg'},{id:'b',name:'BIFE ANGOSTO',listName:'CARNE MINORISTA.pdf',price:13500,unit:'kg'},{id:'z',name:'AZOTILLO LIMPIO',listName:'CARNE MINORISTA.pdf',price:11990,unit:'kg'},{id:'u',name:'700 - CARBON',unit:'unit',price:8500}];
test('lee los tres códigos de balanza fotografiados y rechaza checksum o peso inválido',()=>{
 for(const [barcode,code,quantity]of [['2000010001057','00001',.105],['2000050022555','00005',2.255],['2000030005653','00003',.565]])assert.deepEqual(M.decode(barcode),{kind:'plu',code,quantity,barcode});
 for(const code of ['2000010001058','2000010000005','abc','123456789012345'])assert.throws(()=>M.decode(code));
 const mappings=M.defaultMappings(products);assert.equal(M.resolve('2000050022555',{products,mappings}).product.id,'b');assert.equal(M.resolve('700',{products,mappings}).quantity,1);
 assert.throws(()=>M.resolve('999',{products,mappings}),/sin vincular/);
});
test('no adivina códigos repetidos y valida relaciones, PLU por kilo y códigos EAN',()=>{
 const mappings=M.defaultMappings(products);assert.deepEqual(M.normalizeMappings(mappings,products),mappings);
 assert.throws(()=>M.normalizeMappings([...mappings,mappings[0]],products),/repetido/);
 assert.throws(()=>M.normalizeMappings([{kind:'plu',code:'00008',productId:'u'}],products),/kilo/);
 assert.throws(()=>M.normalizeMappings([{kind:'barcode',code:'700',productId:'no'}],products),/vigente/);
 const ambiguous=[...products,{...products[0],id:'other'},{...products[3],id:'duplicate'},{id:'bad',name:'7798398543097 - Invalid'}];
 assert.equal(M.defaultMappings(ambiguous).some(m=>['00001','700','7798398543097'].includes(m.code)),false);
});
test('vuelto en centavos y pagos inválidos',()=>{
 assert.deepEqual(M.payment('Efectivo',31000,30442.5),{method:'Efectivo',received:31000,change:557.5});
 for(const n of [NaN,Infinity,-1,30442,31000.001])assert.throws(()=>M.payment('Efectivo',n,30442.5));
 assert.throws(()=>M.payment('Transferencia',31000,30442.5));assert.throws(()=>M.payment('Desconocido',31000,30442.5));
 assert.equal(M.payment('Tarjeta de débito',30442.5,30442.5).change,0);
});
