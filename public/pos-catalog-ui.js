(() => {
  const el=id=>document.getElementById(id);let catalog=null;
  const status=text=>el('salesCatalogStatus').textContent=text;
  const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  const selected=()=>catalog?.products.find(p=>p.id===el('salesProductSelect').value);
  function fill(){const p=selected();for(const id of ['salesProductPrice','salesProductUnit','salesProductVAT','saveSalesProduct'])el(id).disabled=!p;
    el('salesProductPrice').value=p?.price??'';el('salesProductUnit').value=p?.unit||'';el('salesProductVAT').value=p?.vatRate??'';
    el('salesProductNotes').textContent=p?`${p.category} · Código ${p.code}${p.notes?' · '+p.notes:''}`:'';
  }
  function options(){if(!catalog)return;const old=el('salesProductSelect').value;const search=norm(el('salesProductSearch').value);
    const list=catalog.products.filter(p=>(norm(p.name).includes(search)||p.code.includes(search))&&(!el('salesOnlyPending').checked||!p.unit||p.vatRate===null||p.price===null));
    el('salesProductSelect').replaceChildren(...list.map(p=>new Option(`${p.code} · ${p.name}${!p.unit||p.vatRate===null?' · pendiente':''}`,p.id)));
    if(list.some(p=>p.id===old))el('salesProductSelect').value=old;fill();
  }
  async function request(options){const r=await fetch('/api/pos/catalog',{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo guardar.');return data;}
  el('loadSalesCatalog').onclick=async()=>{try{catalog=await request();if(catalog.source!=='sales'){status('El catálogo independiente todavía no está cargado.');return;}el('salesProductForm').hidden=false;options();status(`${catalog.products.length} artículos. ${catalog.products.filter(p=>!p.unit).length} con unidad pendiente; ${catalog.products.filter(p=>p.vatRate===null).length} con IVA pendiente.`);}catch(e){status(e.message);}};
  el('salesProductSearch').oninput=options;el('salesOnlyPending').onchange=options;el('salesProductSelect').onchange=fill;
  el('salesProductForm').onsubmit=async event=>{event.preventDefault();const p=selected();if(!p)return;el('saveSalesProduct').disabled=true;
    try{const changed={...p,price:el('salesProductPrice').value===''?null:Number(el('salesProductPrice').value),unit:el('salesProductUnit').value,vatRate:el('salesProductVAT').value===''?null:Number(el('salesProductVAT').value)};
      if(changed.unit)changed.notes=changed.notes.replace('Confirmar unidad de venta.','').trim();
      if(changed.vatRate!==null)changed.notes=changed.notes.replace('Confirmar alícuota de IVA.','').trim();
      catalog=await request({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:catalog.revision,products:catalog.products.map(x=>x.id===p.id?changed:x)})});
      options();status(`${p.code} · ${p.name}: guardado. Las listas de pedidos no se modificaron.`);el('refreshCatalog').click();
    }catch(e){status(e.message+' Volvé a cargar el catálogo si hubo cambios desde otra pantalla.');}finally{el('saveSalesProduct').disabled=false;}
  };
})();
