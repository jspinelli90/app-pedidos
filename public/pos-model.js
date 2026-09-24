(function(root,factory){const m=factory();if(typeof module==='object'&&module.exports)module.exports=m;if(root)root.POSModel=m;})(typeof window==='undefined'?null:window,function(){
  const fail=message=>{throw Object.assign(new Error(message),{statusCode:400});};
  function validEAN(code){if(!/^\d{13}$/.test(code))return false;const sum=[...code.slice(0,12)].reduce((s,c,i)=>s+Number(c)*(i%2?3:1),0);return (10-sum%10)%10===Number(code[12]);}
  function decode(value){
    const code=String(value||'').trim();if(!/^\d{1,14}$/.test(code))fail('Ingresá un código numérico de hasta 14 dígitos.');
    if(code.length===13&&!validEAN(code))fail('El código está incompleto o tiene un dígito incorrecto. Volvé a escanear.');
    if(code.length===13&&code[0]==='2'){
      const grams=Number(code.slice(6,12));if(grams<=0)fail('La etiqueta no contiene un peso válido.');
      return {kind:'plu',code:code.slice(1,6),quantity:grams/1000,barcode:code};
    }
    return {kind:'barcode',code,quantity:1,barcode:code};
  }
  function resolve(value,catalog){const decoded=decode(value);const matches=catalog.mappings.filter(m=>m.kind===decoded.kind&&m.code===decoded.code);if(matches.length!==1)fail(matches.length?'El código tiene más de un artículo asociado. Revisá los códigos.':`Código ${decoded.code} sin vincular. Asociá el código al artículo en Códigos de productos.`);
    const product=catalog.products.find(p=>p.id===matches[0].productId);if(!product)fail('El artículo vinculado ya no está disponible en el catálogo.');
    if(decoded.kind==='plu'&&product.unit!=='kg')fail('La etiqueta contiene peso, pero el artículo no está configurado por kilo.');
    if(!product.unit||product.price===null)fail('Completá la unidad y el precio del artículo antes de venderlo.');return {...decoded,product};
  }
  function defaultMappings(products){
    const mappings=[];
    for(const p of products){const match=p.name.match(/^(\d{1,14})\s*-\s*/);if(match&&(match[1].length!==13||(validEAN(match[1])&&match[1][0]!=='2')))mappings.push({kind:'barcode',code:match[1],productId:p.id});}
    for(const [code,name]of [['00001','ASADO AMERICANO'],['00003','AZOTILLO LIMPIO'],['00005','BIFE ANGOSTO']]){
      const matches=products.filter(p=>p.name===name&&/CARNE MINORISTA/i.test(p.listName));if(matches.length===1)mappings.push({kind:'plu',code,productId:matches[0].id});
    }
    return mappings.filter((m,i,all)=>all.findIndex(x=>x.kind===m.kind&&x.code===m.code)===i&&all.filter(x=>x.kind===m.kind&&x.code===m.code).length===1);
  }
  function normalizeMappings(input,products){if(!Array.isArray(input)||input.length>2000)fail('Se admiten hasta 2000 códigos.');const keys=new Set();return input.map(m=>{
    if(!m||!['plu','barcode'].includes(m.kind))fail('Elegí código de artículo o PLU de balanza.');const code=String(m.code||'').trim();
    if(m.kind==='plu'?!/^\d{5}$/.test(code)||Number(code)===0:!/^\d{1,14}$/.test(code))fail('El PLU debe tener 5 dígitos; el código de artículo, de 1 a 14.');
    if(m.kind==='barcode'&&code.length===13&&(!validEAN(code)||code[0]==='2'))fail('Los códigos de 13 dígitos deben ser válidos y no comenzar con el prefijo de balanza 2.');
    const p=products.find(p=>p.id===m.productId);if(!p)fail('Seleccioná un artículo vigente.');if(m.kind==='plu'&&p.unit!=='kg')fail('Un PLU de balanza debe vincularse a un artículo por kilo.');
    const key=m.kind+':'+code;if(keys.has(key))fail(`Código repetido: ${code}`);keys.add(key);return {kind:m.kind,code,productId:p.id};
  });}
  function payment(method,received,total){if(!['Efectivo','Transferencia','Tarjeta de débito','Tarjeta de crédito'].includes(method))fail('Elegí un medio de pago.');if(typeof received!=='number'||!Number.isFinite(received)||received<total||received>999999999||Math.abs(received*100-Math.round(received*100))>1e-5)fail('El importe recibido debe cubrir el total y tener hasta dos decimales.');if(method!=='Efectivo'&&received!==total)fail('Para este medio de pago el importe debe coincidir con el total.');return {method,received,change:Math.round((received-total)*100)/100};}
  return {decode,resolve,validEAN,defaultMappings,normalizeMappings,payment};
});
