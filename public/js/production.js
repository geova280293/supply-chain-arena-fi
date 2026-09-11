let cfg=null;const $=id=>document.getElementById(id);
const BRICK_COLORS=['#e7656f','#4c8fe8','#f5c84b','#63b97a','#ef9651','#8b77d9','#263446','#f1f3f6'];
let selectedColor=BRICK_COLORS[0],designDrafts={},activeDesignTeam='',designHistory=[];
function normalize(c){c=c||{};c.teams=c.teams||[];c.orders=c.orders||[];c.productDesigns=c.productDesigns||{};return c}
function team(){return cfg.teams.find(t=>t.id===$('team').value)||cfg.teams[0]}
function renderTeam(){const prev=localStorage.getItem('productionTeam')||$('team').value;$('team').innerHTML=cfg.teams.map(t=>`<option value="${esc(t.id)}" ${t.id===prev?'selected':''}>${esc(t.name)}</option>`).join('');localStorage.setItem('productionTeam',$('team').value)}
function card(o){const target=(+o.quantity||0)+(+o.lostQty||0),need=Math.max(0,target-(+o.producedQty||0)),pct=Math.min(100,Math.round((+o.producedQty||0)/Math.max(1,target)*100)),canRelease=!o.releasedAt && (+o.producedQty||0)>=o.quantity;return `<div class="prod-card"><div class="top"><div><strong>${esc(o.label)}</strong><div class="muted small">Destino: ${esc(o.destination)} · ${o.quantity} u</div></div><span class="state ${stateClass(effectiveStatus(o))}">${stateLabel(effectiveStatus(o))}</span></div><div class="row" style="margin-top:10px"><span class="tag ${esc(o.priority)}">${esc(o.priority)}</span><span class="countdown ${dueMs(o)<120000?'danger':dueMs(o)<240000?'warn':''}">⏱ ${countdownText(o)}</span></div><div class="progress" style="margin-top:12px"><span style="width:${pct}%"></span></div><div class="mini-stats" style="margin-top:10px"><div class="mini-stat"><span class="small muted">Producido</span><b>${o.producedQty||0}</b></div><div class="mini-stat"><span class="small muted">Objetivo actual</span><b>${target}</b></div></div>${o.lostQty?`<div class="pill red" style="margin-top:10px">Reposición por intercepción: ${o.lostQty} u</div>`:''}<div class="row" style="margin-top:12px"><button class="btn yellow" onclick="produce('${esc(o.id)}',1)">+ 1 producto</button><button class="btn light" onclick="produce('${esc(o.id)}',${Math.max(1,need)})">Completar faltante (${need})</button></div>${canRelease?`<button class="btn green big" style="margin-top:10px" onclick="releaseOrder('${esc(o.id)}')">LIBERAR PEDIDO A TRANSPORTE</button>`:o.releasedAt?'<div class="pill green" style="margin-top:10px">Pedido liberado · los transportistas pueden recoger lotes disponibles</div>':'<div class="small muted" style="margin-top:10px">Libera cuando alcances la cantidad original solicitada.</div>'}</div>`}
function renderOrders(){const os=cfg.orders.filter(o=>o.teamId===team()?.id && !['ENTREGADO','ENTREGADO_TARDE','CANCELADO'].includes(o.status) && (o.status!=='NUEVO'||o.routeNodes?.length));$('productionOrders').innerHTML=os.length?os.map(card).join(''):'<div class="card empty">No hay órdenes de producción pendientes.</div>'}
function getDraft(){
  const t=team();if(!t)return {name:'Producto del equipo',pieces:[],dirty:false};
  if(!designDrafts[t.id]){
    const saved=cfg.productDesigns?.[t.id]||{name:'Producto del equipo',pieces:[]};
    designDrafts[t.id]={name:saved.name||'Producto del equipo',pieces:JSON.parse(JSON.stringify(saved.pieces||[])),dirty:false};
  }
  return designDrafts[t.id];
}
function parseSize(v){const [h,w]=String(v).split('x').map(Number);return {h,w}}
function brickOverlaps(p,q){return !(p.x+p.w<=q.x||q.x+q.w<=p.x||p.y+p.h<=q.y||q.y+q.h<=p.y)}
function renderPalette(){$('brickColors').innerHTML=BRICK_COLORS.map(c=>`<button class="brick-color ${c===selectedColor?'selected':''}" style="background:${c}" data-color="${c}" aria-label="Color"></button>`).join('');document.querySelectorAll('.brick-color').forEach(b=>b.onclick=()=>{selectedColor=b.dataset.color;renderPalette()})}
function renderStage(){
  const d=getDraft(),stage=$('legoStage');if(!stage)return;
  stage.innerHTML='<div class="lego-grid"></div>'+d.pieces.map(p=>`<button class="lego-piece" title="${p.h}×${p.w} · clic para retirar" data-id="${p.id}" style="--x:${p.x};--y:${p.y};--w:${p.w};--h:${p.h};--brick:${p.color}">${Array.from({length:p.h*p.w}).map(()=>'<i></i>').join('')}</button>`).join('');
  stage.querySelectorAll('.lego-piece').forEach(el=>el.onclick=e=>{e.stopPropagation();const d=getDraft();designHistory.push(JSON.stringify(d.pieces));d.pieces=d.pieces.filter(p=>p.id!==el.dataset.id);d.dirty=true;renderDesign()});
}
function bomData(){const d=getDraft(),m={};for(const p of d.pieces){const k=`${p.h}×${p.w}|${p.color}`;m[k]=(m[k]||0)+1}return Object.entries(m)}
function renderBom(){const rows=bomData();$('designBom').innerHTML=rows.length?rows.map(([k,n])=>{const [size,color]=k.split('|');return `<div class="bom-row"><span class="bom-swatch" style="background:${color}"></span><strong>${size}</strong><span class="muted">${n} pieza${n===1?'':'s'}</span></div>`}).join(''):'<div class="empty">Aún no hay piezas en el diseño.</div>'}
function renderDesign(){
  const d=getDraft();$('productName').value=d.name||'Producto del equipo';$('designStatus').textContent=d.dirty?'cambios sin guardar':'guardado';$('designStatus').className='status '+(d.dirty?'offline':'online');renderPalette();renderStage();renderBom()
}
function placePieceAtCell(cellX,cellY){
  const d=getDraft(),{h,w}=parseSize($('brickSize').value),cols=16,rows=10;if(cellX+w>cols||cellY+h>rows)return toast('La pieza no cabe en esa posición');
  const np={id:uuid(),x:cellX,y:cellY,w,h,color:selectedColor};if(d.pieces.some(p=>brickOverlaps(p,np)))return toast('Ese espacio ya está ocupado');
  designHistory.push(JSON.stringify(d.pieces));d.pieces.push(np);d.dirty=true;renderDesign()
}
function bindStage(){
  $('legoStage').onclick=e=>{if(e.target.closest('.lego-piece'))return;const r=$('legoStage').getBoundingClientRect(),x=Math.floor((e.clientX-r.left)/(r.width/16)),y=Math.floor((e.clientY-r.top)/(r.height/10));placePieceAtCell(Math.max(0,Math.min(15,x)),Math.max(0,Math.min(9,y)))}
}
window.produce=async(id,qty)=>{try{await api('/api/action',{method:'POST',body:JSON.stringify({type:'produce',orderId:id,qty})});toast(`Producción registrada: +${qty}`)}catch(e){toast(e.message)}};
window.releaseOrder=async id=>{try{await api('/api/action',{method:'POST',body:JSON.stringify({type:'release',orderId:id})});toast('Pedido liberado a transporte')}catch(e){toast(e.message)}};
$('team').onchange=()=>{localStorage.setItem('productionTeam',$('team').value);activeDesignTeam=$('team').value;renderOrders();renderDesign()};
$('productName').oninput=()=>{const d=getDraft();d.name=$('productName').value;d.dirty=true;$('designStatus').textContent='cambios sin guardar';$('designStatus').className='status offline'};
$('undoBrick').onclick=()=>{if(!designHistory.length)return;const d=getDraft();d.pieces=JSON.parse(designHistory.pop());d.dirty=true;renderDesign()};
$('clearDesign').onclick=()=>{if(!confirm('¿Limpiar completamente el diseño?'))return;const d=getDraft();designHistory.push(JSON.stringify(d.pieces));d.pieces=[];d.dirty=true;renderDesign()};
$('saveDesign').onclick=async()=>{const d=getDraft(),t=team();try{await api('/api/action',{method:'POST',body:JSON.stringify({type:'save_product_design',teamId:t.id,name:d.name.trim()||'Producto del equipo',pieces:d.pieces})});d.dirty=false;renderDesign();toast('Diseño guardado para el equipo')}catch(e){toast(e.message)}};
function render(){renderTeam();renderOrders();if(activeDesignTeam!==$('team').value){activeDesignTeam=$('team').value;renderDesign()}}
(async()=>{cfg=normalize(await api('/api/config'));render();bindStage();renderDesign();const s=new EventSource('/api/stream');s.onopen=()=>{$('net').textContent='en línea';$('net').className='status online'};s.onerror=()=>{$('net').textContent='reconectando';$('net').className='status offline'};s.addEventListener('config',e=>{const next=normalize(JSON.parse(e.data));const t=team();if(t&&!getDraft().dirty)delete designDrafts[t.id];cfg=next;render();renderDesign()});setInterval(renderOrders,1000)})().catch(e=>toast(e.message));