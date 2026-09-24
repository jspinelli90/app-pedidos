(() => {
 const el=id=>document.getElementById(id);
 function view(name){document.querySelectorAll('[data-pos-panel]').forEach(p=>p.hidden=p.dataset.posPanel!==name);document.querySelectorAll('[data-pos-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.posView===name)));}
 document.querySelectorAll('[data-pos-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.posView)));
 el('newSale').addEventListener('click',()=>view('sale'));
 el('posWorkDate').textContent=new Date().toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'});
 el('toggleProductSearch').onclick=()=>{const p=el('posProductFinder');p.hidden=!p.hidden;el('toggleProductSearch').setAttribute('aria-expanded',String(!p.hidden));if(!p.hidden)el('productSearch').focus();};
})();
