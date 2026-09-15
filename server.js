const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const {URL}=require('url');
const PORT=Number(process.env.PORT||3000),ROOT=__dirname,PUBLIC=path.join(ROOT,'public'),DATA=path.join(ROOT,'data'),CONFIG=path.join(DATA,'config.json'),EVENTS=path.join(DATA,'events.ndjson');
const clients=new Set();fs.mkdirSync(DATA,{recursive:true});if(!fs.existsSync(EVENTS))fs.writeFileSync(EVENTS,'');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const json=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
const readConfig=()=>JSON.parse(fs.readFileSync(CONFIG,'utf8'));const writeConfig=c=>fs.writeFileSync(CONFIG,JSON.stringify(c,null,2));
const readEvents=()=>{const t=fs.readFileSync(EVENTS,'utf8').trim();return t?t.split('\n').map(x=>JSON.parse(x)):[]};const appendEvent=e=>fs.appendFileSync(EVENTS,JSON.stringify(e)+'\n');
const body=req=>new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>2_000_000){reject(new Error('too large'));req.destroy()}});req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}});req.on('error',reject)});
function emit(type,data){const msg=`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;for(const r of clients){try{r.write(msg)}catch{clients.delete(r)}}}
function event(type,data={}){const e={id:data.eventId||`${Date.now()}-${Math.random().toString(16).slice(2)}`,ts:new Date().toISOString(),type,...data};delete e.eventId;appendEvent(e);emit('event',e);return e}
function chat(teamId,text,kind='system',meta={}){if(!teamId||!text)return;return event('chat_message',{teamId,text:String(text).slice(0,180),kind,...meta})}
function due(order){return new Date(order.createdAt).getTime()+(+order.deadlineMin||0)*60000}
function findOrder(cfg,id){const o=(cfg.orders||[]).find(x=>x.id===id);if(!o)throw new Error('Pedido no encontrado');return o}
function availableQty(o){const transit=(o.shipments||[]).filter(s=>s.status==='EN_TRANSITO').reduce((a,s)=>a+s.qty,0);return Math.max(0,(+o.producedQty||0)-(+o.lostQty||0)-(+o.deliveredQty||0)-transit)}
function assertOrderOpen(o){if(o.status==='CANCELADO')throw new Error('El pedido fue cancelado');if(['ENTREGADO','ENTREGADO_TARDE'].includes(o.status))throw new Error('El pedido ya está cerrado')}
function cleanName(v){return String(v||'').trim().replace(/\s+/g,' ')}
function keyName(v){return cleanName(v).toLocaleLowerCase('es-MX')}
function ensureCfg(cfg){cfg.orders=cfg.orders||[];cfg.teams=cfg.teams||[];cfg.inventory=cfg.inventory||{};cfg.captures=cfg.captures||[];return cfg}
function inventoryFor(cfg,teamId,create=true){ensureCfg(cfg);if(!cfg.inventory[teamId]&&create)cfg.inventory[teamId]={productName:'Producto del equipo',materials:[],configuredAt:null,updatedAt:null};return cfg.inventory[teamId]||null}
function coverage(inv){const req=(inv?.materials||[]).filter(m=>(+m.perProduct||0)>0);if(!req.length)return 0;return Math.max(0,Math.min(...req.map(m=>Math.floor((+m.stockQty||0)/(+m.perProduct||1)))))}
function applyAction(cfg,a){ensureCfg(cfg);
  if(a.type==='chat_message'){
    const t=cfg.teams.find(x=>x.id===a.teamId);if(!t)throw new Error('Equipo no válido');
    const text=cleanName(a.text).slice(0,100);if(!text)throw new Error('Mensaje vacío');
    return chat(t.id,text,'user',{senderRole:cleanName(a.senderRole).slice(0,30)||'Equipo',senderName:cleanName(a.senderName).slice(0,60)||'Integrante'});
  }
  if(a.type==='save_inventory'){
    const t=cfg.teams.find(x=>x.id===a.teamId);if(!t)throw new Error('Equipo no válido');
    const old=inventoryFor(cfg,t.id,true),incoming=(Array.isArray(a.materials)?a.materials:[]).slice(0,80).map((m,i)=>({id:cleanName(m.id)||`M-${Date.now().toString(36)}-${i}`,name:cleanName(m.name)||`Pieza ${i+1}`,initialQty:Math.max(0,+m.initialQty||0),perProduct:Math.max(0,+m.perProduct||0)}));
    if(!incoming.length)throw new Error('Agrega al menos una pieza al inventario');
    const touched=(old.materials||[]).some(m=>(+m.consumedQty||0)>0||(+m.recoveredQty||0)>0)||cfg.orders.some(o=>o.teamId===t.id&&(+o.producedQty||0)>0);
    const byId=new Map((old.materials||[]).map(m=>[m.id,m])),byName=new Map((old.materials||[]).map(m=>[keyName(m.name),m]));
    const mats=incoming.map(m=>{const prev=byId.get(m.id)||byName.get(keyName(m.name));if(prev&&touched)return {...prev,id:m.id,name:m.name,perProduct:m.perProduct,initialQty:+prev.initialQty||0,stockQty:+prev.stockQty||0};return {id:m.id,name:m.name,initialQty:m.initialQty,stockQty:m.initialQty,perProduct:m.perProduct,consumedQty:prev?.consumedQty||0,recoveredQty:prev?.recoveredQty||0}});
    cfg.inventory[t.id]={productName:cleanName(a.productName)||old.productName||'Producto del equipo',materials:mats,configuredAt:old.configuredAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
    event('inventory_saved',{teamId:t.id,materials:mats.length,productName:cfg.inventory[t.id].productName,coverage:coverage(cfg.inventory[t.id])});
    chat(t.id,`Inventario/BOM actualizado · cobertura actual: ${coverage(cfg.inventory[t.id])} producto(s).`,'system',{senderRole:'Sistema'});
    return cfg.inventory[t.id];
  }
  if(a.type==='receive_capture'){
    const cap=cfg.captures.find(x=>x.id===a.captureId);if(!cap)throw new Error('Captura no encontrada');if(cap.status!=='PENDIENTE_RETORNO')throw new Error('La captura ya fue ingresada');if(cap.interceptorTeamId!==a.teamId)throw new Error('La captura pertenece a otro equipo');
    const inv=inventoryFor(cfg,a.teamId,true);for(const cm of cap.materials||[]){let m=(inv.materials||[]).find(x=>keyName(x.name)===keyName(cm.name));if(!m){m={id:`REC-${Date.now().toString(36)}-${Math.random().toString(16).slice(2,6)}`,name:cm.name,initialQty:0,stockQty:0,perProduct:0,consumedQty:0,recoveredQty:0};inv.materials.push(m)}m.stockQty=(+m.stockQty||0)+(+cm.qty||0);m.recoveredQty=(+m.recoveredQty||0)+(+cm.qty||0)}
    inv.updatedAt=new Date().toISOString();cap.status='RECIBIDO';cap.receivedAt=new Date().toISOString();cap.receivedBy=cleanName(a.receivedBy)||'Producción';
    event('capture_received',{teamId:a.teamId,captureId:cap.id,sourceTeamId:cap.sourceTeamId,sourceOrderId:cap.sourceOrderId,materials:cap.materials});
    chat(a.teamId,`Material capturado ingresado al inventario desde ${cap.sourceLabel||'envío rival'}.`,'system',{senderRole:'Sistema'});
    return cap;
  }
  if(a.type==='cancel_order'){
    const o=findOrder(cfg,a.orderId);if(['ENTREGADO','ENTREGADO_TARDE','CANCELADO'].includes(o.status))throw new Error('El pedido ya está cerrado');
    const active=(o.shipments||[]).filter(s=>s.status==='EN_TRANSITO');for(const s of active){s.status='CANCELADO';s.endedAt=new Date().toISOString()}
    o.status='CANCELADO';o.cancelledAt=new Date().toISOString();o.cancelReason=a.reason||'Cancelado por el docente';
    event('order_cancelled',{teamId:o.teamId,orderId:o.id,label:o.label,reason:o.cancelReason});chat(o.teamId,`${o.label} fue CANCELADO por el docente.`,'alert',{senderRole:'Sistema'});return;
  }
  if(a.type==='add_order'){
    const targets=a.teamId&&a.teamId!=='ALL'?[cfg.teams.find(t=>t.id===a.teamId)].filter(Boolean):cfg.teams;
    if(!targets.length)throw new Error('No hay equipos configurados');const seq=(cfg.orderSeq||0)+1;cfg.orderSeq=seq;const label=`PED-${String(seq).padStart(2,'0')}`,requestId=`REQ-${Date.now().toString(36)}`,createdAt=new Date().toISOString();
    for(const t of targets){const id=`${requestId}-${t.id}`;cfg.orders.push({id,requestId,label,teamId:t.id,destination:a.destination,quantity:+a.quantity||1,deadlineMin:+a.deadlineMin||8,priority:a.priority||'normal',createdAt,status:'NUEVO',routeNodes:[],lotSize:1,producedQty:0,deliveredQty:0,lostQty:0,shipments:[]});event('order_created',{teamId:t.id,orderId:id,label,destination:a.destination,quantity:+a.quantity||1});chat(t.id,`Nuevo ${label}: ${+a.quantity||1} u → ${a.destination}. Tiempo: ${+a.deadlineMin||8} min.`,'order',{senderRole:'Docente'})}return;
  }
  if(a.type==='plan_order'){
    const o=findOrder(cfg,a.orderId);assertOrderOpen(o);const wasNew=o.status==='NUEVO';o.routeNodes=(a.routeNodes||[]).filter(Boolean);o.lotSize=Math.max(1,+a.lotSize||1);o.plannedAt=new Date().toISOString();o.planRevision=(o.planRevision||0)+1;if(o.status==='NUEVO')o.status='EN_PRODUCCION';event('order_planned',{teamId:o.teamId,orderId:o.id,label:o.label,routeNodes:o.routeNodes,lotSize:o.lotSize});chat(o.teamId,`${o.label} ${wasNew?'enviado a Producción':'actualizado'} · lote ${o.lotSize} · ${o.routeNodes.join(' → ')}.`,'plan',{senderRole:'Torre de Control'});return;
  }
  if(a.type==='produce'){
    const o=findOrder(cfg,a.orderId);assertOrderOpen(o);const qty=Math.max(1,+a.qty||1),inv=inventoryFor(cfg,o.teamId,false);
    if(!inv||!(inv.materials||[]).some(m=>(+m.perProduct||0)>0))throw new Error('Configura el inventario y la BOM antes de producir');
    const required=inv.materials.filter(m=>(+m.perProduct||0)>0).map(m=>({m,need:(+m.perProduct||0)*qty}));
    const shortage=required.filter(x=>(+x.m.stockQty||0)<x.need);if(shortage.length)throw new Error('Inventario insuficiente: '+shortage.map(x=>`${x.m.name} (faltan ${x.need-(+x.m.stockQty||0)})`).join(', '));
    for(const x of required){x.m.stockQty=(+x.m.stockQty||0)-x.need;x.m.consumedQty=(+x.m.consumedQty||0)+x.need}inv.updatedAt=new Date().toISOString();
    o.producedQty=(+o.producedQty||0)+qty;if(o.status==='NUEVO')o.status='EN_PRODUCCION';event('produced',{teamId:o.teamId,orderId:o.id,label:o.label,units:qty,producedQty:o.producedQty,coverage:coverage(inv)});return;
  }
  if(a.type==='release'){
    const o=findOrder(cfg,a.orderId);assertOrderOpen(o);const target=(+o.quantity||0)+(+o.lostQty||0);if((+o.producedQty||0)<target)throw new Error(`Faltan ${target-(+o.producedQty||0)} unidades por producir`);o.releasedAt=new Date().toISOString();if(!['ENTREGADO','ENTREGADO_TARDE'].includes(o.status))o.status='LISTO';event('released',{teamId:o.teamId,orderId:o.id,label:o.label,units:availableQty(o)});chat(o.teamId,`${o.label} LISTO para transporte · ${availableQty(o)} unidad(es) disponible(s).`,'ready',{senderRole:'Producción'});return;
  }
  if(a.type==='transport_start'){
    const o=findOrder(cfg,a.orderId);assertOrderOpen(o);if(!o.routeNodes?.length)throw new Error('La torre aún no define ruta');const qty=Math.min(Math.max(1,+a.qty||o.lotSize||1),availableQty(o),Math.max(0,(+o.quantity||0)-(+o.deliveredQty||0)));if(qty<=0)throw new Error('No hay producto disponible para recoger');const s={id:a.shipmentId||`S-${Date.now().toString(36)}-${Math.random().toString(16).slice(2,6)}`,member:a.member||'Transportista',qty,startedAt:new Date().toISOString(),status:'EN_TRANSITO',routeNodes:[...o.routeNodes]};o.shipments=o.shipments||[];o.shipments.push(s);o.status='EN_DISTRIBUCION';event('transport_start',{teamId:o.teamId,orderId:o.id,label:o.label,shipmentId:s.id,member:s.member,units:qty,routeNodes:s.routeNodes});chat(o.teamId,`${s.member} inició ${o.label} con ${qty} u · ${s.routeNodes.join(' → ')}.`,'transport',{senderRole:'Transporte',senderName:s.member});return s;
  }
  if(a.type==='intercepted'){
    const o=findOrder(cfg,a.orderId);assertOrderOpen(o);const s=(o.shipments||[]).find(x=>x.id===a.shipmentId);if(!s||s.status!=='EN_TRANSITO')throw new Error('Envío no válido');
    s.status='INTERCEPTADO';s.endedAt=new Date().toISOString();s.segment=a.segment||'';s.interceptorTeamId=a.interceptorTeamId||'';o.lostQty=(+o.lostQty||0)+s.qty;o.status='EN_DISTRIBUCION';
    let capture=null;const rival=cfg.teams.find(t=>t.id===a.interceptorTeamId);if(rival&&rival.id!==o.teamId){const src=inventoryFor(cfg,o.teamId,false),materials=(src?.materials||[]).filter(m=>(+m.perProduct||0)>0).map(m=>({name:m.name,qty:(+m.perProduct||0)*s.qty,sourceMaterialId:m.id})).filter(m=>m.qty>0);capture={id:`CAP-${Date.now().toString(36)}-${Math.random().toString(16).slice(2,6)}`,interceptorTeamId:rival.id,sourceTeamId:o.teamId,sourceOrderId:o.id,sourceLabel:o.label,shipmentId:s.id,qtyProducts:s.qty,materials,status:'PENDIENTE_RETORNO',createdAt:new Date().toISOString(),segment:s.segment};cfg.captures.push(capture);chat(rival.id,`CAPTURA: ${s.qty} u de ${o.label}. Lleva físicamente el material a fábrica para ingresarlo al inventario.`,'capture',{senderRole:'Sistema',captureId:capture.id})}
    event('intercepted',{teamId:o.teamId,orderId:o.id,label:o.label,shipmentId:s.id,member:s.member,units:s.qty,segment:s.segment,routeNodes:s.routeNodes,interceptorTeamId:a.interceptorTeamId||'',captureId:capture?.id||''});chat(o.teamId,`${o.label} INTERCEPTADO en ${s.segment||'ruta'} · pérdida: ${s.qty} u.`,'alert',{senderRole:'Sistema'});return capture;
  }
  if(a.type==='delivered'){
    const o=findOrder(cfg,a.orderId);assertOrderOpen(o);const s=(o.shipments||[]).find(x=>x.id===a.shipmentId);if(!s||s.status!=='EN_TRANSITO')throw new Error('Envío no válido');s.status='ENTREGADO';s.endedAt=new Date().toISOString();o.deliveredQty=(+o.deliveredQty||0)+s.qty;const complete=o.deliveredQty>=o.quantity;if(complete){o.completedAt=new Date().toISOString();o.status=Date.now()<=due(o)?'ENTREGADO':'ENTREGADO_TARDE'}else{o.status='EN_DISTRIBUCION'}event('delivered',{teamId:o.teamId,orderId:o.id,label:o.label,shipmentId:s.id,member:s.member,units:s.qty,routeNodes:s.routeNodes,complete,status:o.status});chat(o.teamId,`${s.member} entregó ${s.qty} u de ${o.label}${complete?' · PEDIDO COMPLETADO':''}.`,'delivery',{senderRole:'Transporte',senderName:s.member});return;
  }
  throw new Error('Acción no reconocida');
}
function serveStatic(urlPath,res){let p=urlPath==='/'?'/index.html':decodeURIComponent(urlPath.split('?')[0]);const file=path.normalize(path.join(PUBLIC,p));if(!file.startsWith(PUBLIC)){res.writeHead(403);return res.end('Forbidden')}fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res)})}
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{
  if(req.method==='GET'&&u.pathname==='/api/config')return json(res,200,readConfig());
  if(req.method==='POST'&&u.pathname==='/api/config'){const c=ensureCfg(await body(req));writeConfig(c);emit('config',c);return json(res,200,{ok:true})}
  if(req.method==='POST'&&u.pathname==='/api/action'){const a=await body(req),c=ensureCfg(readConfig());const result=applyAction(c,a);writeConfig(c);emit('config',c);return json(res,200,{ok:true,result,config:c})}
  if(req.method==='GET'&&u.pathname==='/api/events')return json(res,200,readEvents());
  if(req.method==='POST'&&u.pathname==='/api/events/bulk'){const arr=await body(req);const existing=new Set(readEvents().map(e=>e.id));let added=0;for(const e of Array.isArray(arr)?arr:[]){if(e?.id&&!existing.has(e.id)){appendEvent(e);existing.add(e.id);added++;emit('event',e)}}return json(res,200,{ok:true,added})}
  if(req.method==='DELETE'&&u.pathname==='/api/events'){fs.writeFileSync(EVENTS,'');const c=ensureCfg(readConfig());c.orders=[];c.orderSeq=0;c.captures=[];for(const inv of Object.values(c.inventory||{})){for(const m of inv.materials||[]){m.stockQty=+m.initialQty||0;m.consumedQty=0;m.recoveredQty=0}inv.updatedAt=new Date().toISOString()}writeConfig(c);emit('reset',{});emit('config',c);return json(res,200,{ok:true})}
  if(req.method==='GET'&&u.pathname==='/api/stream'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write('retry: 2500\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return}
  serveStatic(u.pathname,res)
}catch(e){json(res,400,{ok:false,error:e.message})}});
server.listen(PORT,'0.0.0.0',()=>{console.log(`\nSupply Chain Arena activa en puerto ${PORT}`);console.log(`Docente: http://localhost:${PORT}/teacher.html`);for(const [name,list] of Object.entries(os.networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal){console.log(`Torre (${name}): http://${n.address}:${PORT}/tower.html`);console.log(`Producción (${name}): http://${n.address}:${PORT}/production.html`);console.log(`Transportista (${name}): http://${n.address}:${PORT}/transport.html`)}console.log('No requiere Internet ni paquetes npm externos.\n')});