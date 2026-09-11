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
function due(order){return new Date(order.createdAt).getTime()+(+order.deadlineMin||0)*60000}
function findOrder(cfg,id){const o=(cfg.orders||[]).find(x=>x.id===id);if(!o)throw new Error('Pedido no encontrado');return o}
function availableQty(o){const transit=(o.shipments||[]).filter(s=>s.status==='EN_TRANSITO').reduce((a,s)=>a+s.qty,0);return Math.max(0,(+o.producedQty||0)-(+o.lostQty||0)-(+o.deliveredQty||0)-transit)}
function applyAction(cfg,a){cfg.orders=cfg.orders||[];cfg.teams=cfg.teams||[];
  if(a.type==='add_order'){
    const targets=a.teamId&&a.teamId!=='ALL'?[cfg.teams.find(t=>t.id===a.teamId)].filter(Boolean):cfg.teams;
    if(!targets.length)throw new Error('No hay equipos configurados');const seq=(cfg.orderSeq||0)+1;cfg.orderSeq=seq;const label=`PED-${String(seq).padStart(2,'0')}`,requestId=`REQ-${Date.now().toString(36)}`,createdAt=new Date().toISOString();
    for(const t of targets){cfg.orders.push({id:`${requestId}-${t.id}`,requestId,label,teamId:t.id,destination:a.destination,quantity:+a.quantity||1,deadlineMin:+a.deadlineMin||8,priority:a.priority||'normal',createdAt,status:'NUEVO',routeNodes:[],lotSize:1,producedQty:0,deliveredQty:0,lostQty:0,shipments:[]});event('order_created',{teamId:t.id,orderId:`${requestId}-${t.id}`,label,destination:a.destination,quantity:+a.quantity||1})}return;
  }
  if(a.type==='plan_order'){
    const o=findOrder(cfg,a.orderId);if(['ENTREGADO','ENTREGADO_TARDE'].includes(o.status))throw new Error('El pedido ya está cerrado');o.routeNodes=(a.routeNodes||[]).filter(Boolean);o.lotSize=Math.max(1,+a.lotSize||1);o.plannedAt=new Date().toISOString();o.planRevision=(o.planRevision||0)+1;if(o.status==='NUEVO')o.status='EN_PRODUCCION';event('order_planned',{teamId:o.teamId,orderId:o.id,label:o.label,routeNodes:o.routeNodes,lotSize:o.lotSize});return;
  }
  if(a.type==='produce'){
    const o=findOrder(cfg,a.orderId);const qty=Math.max(1,+a.qty||1);o.producedQty=(+o.producedQty||0)+qty;if(o.status==='NUEVO')o.status='EN_PRODUCCION';event('produced',{teamId:o.teamId,orderId:o.id,label:o.label,units:qty,producedQty:o.producedQty});return;
  }
  if(a.type==='release'){
    const o=findOrder(cfg,a.orderId);const target=(+o.quantity||0)+(+o.lostQty||0);if((+o.producedQty||0)<target)throw new Error(`Faltan ${target-(+o.producedQty||0)} unidades por producir`);o.releasedAt=new Date().toISOString();if(!['ENTREGADO','ENTREGADO_TARDE'].includes(o.status))o.status='LISTO';event('released',{teamId:o.teamId,orderId:o.id,label:o.label,units:availableQty(o)});return;
  }
  if(a.type==='transport_start'){
    const o=findOrder(cfg,a.orderId);if(!o.routeNodes?.length)throw new Error('La torre aún no define ruta');const qty=Math.min(Math.max(1,+a.qty||o.lotSize||1),availableQty(o),Math.max(0,(+o.quantity||0)-(+o.deliveredQty||0)));if(qty<=0)throw new Error('No hay producto disponible para recoger');const s={id:a.shipmentId||`S-${Date.now().toString(36)}-${Math.random().toString(16).slice(2,6)}`,member:a.member||'Transportista',qty,startedAt:new Date().toISOString(),status:'EN_TRANSITO',routeNodes:[...o.routeNodes]};o.shipments=o.shipments||[];o.shipments.push(s);o.status='EN_DISTRIBUCION';event('transport_start',{teamId:o.teamId,orderId:o.id,label:o.label,shipmentId:s.id,member:s.member,units:qty,routeNodes:s.routeNodes});return s;
  }
  if(a.type==='intercepted'){
    const o=findOrder(cfg,a.orderId),s=(o.shipments||[]).find(x=>x.id===a.shipmentId);if(!s||s.status!=='EN_TRANSITO')throw new Error('Envío no válido');s.status='INTERCEPTADO';s.endedAt=new Date().toISOString();s.segment=a.segment||'';o.lostQty=(+o.lostQty||0)+s.qty;o.status='EN_DISTRIBUCION';event('intercepted',{teamId:o.teamId,orderId:o.id,label:o.label,shipmentId:s.id,member:s.member,units:s.qty,segment:s.segment,routeNodes:s.routeNodes});return;
  }
  if(a.type==='delivered'){
    const o=findOrder(cfg,a.orderId),s=(o.shipments||[]).find(x=>x.id===a.shipmentId);if(!s||s.status!=='EN_TRANSITO')throw new Error('Envío no válido');s.status='ENTREGADO';s.endedAt=new Date().toISOString();o.deliveredQty=(+o.deliveredQty||0)+s.qty;const complete=o.deliveredQty>=o.quantity;if(complete){o.completedAt=new Date().toISOString();o.status=Date.now()<=due(o)?'ENTREGADO':'ENTREGADO_TARDE'}else{o.status='EN_DISTRIBUCION'}event('delivered',{teamId:o.teamId,orderId:o.id,label:o.label,shipmentId:s.id,member:s.member,units:s.qty,routeNodes:s.routeNodes,complete,status:o.status});return;
  }
  throw new Error('Acción no reconocida');
}
function serveStatic(urlPath,res){let p=urlPath==='/'?'/index.html':decodeURIComponent(urlPath.split('?')[0]);const file=path.normalize(path.join(PUBLIC,p));if(!file.startsWith(PUBLIC)){res.writeHead(403);return res.end('Forbidden')}fs.stat(file,(err,st)=>{if(err||!st.isFile()){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res)})}
const server=http.createServer(async(req,res)=>{const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{
  if(req.method==='GET'&&u.pathname==='/api/config')return json(res,200,readConfig());
  if(req.method==='POST'&&u.pathname==='/api/config'){const c=await body(req);writeConfig(c);emit('config',c);return json(res,200,{ok:true})}
  if(req.method==='POST'&&u.pathname==='/api/action'){const a=await body(req),c=readConfig();const result=applyAction(c,a);writeConfig(c);emit('config',c);return json(res,200,{ok:true,result,config:c})}
  if(req.method==='GET'&&u.pathname==='/api/events')return json(res,200,readEvents());
  if(req.method==='POST'&&u.pathname==='/api/events/bulk'){const arr=await body(req);const existing=new Set(readEvents().map(e=>e.id));let added=0;for(const e of Array.isArray(arr)?arr:[]){if(e?.id&&!existing.has(e.id)){appendEvent(e);existing.add(e.id);added++;emit('event',e)}}return json(res,200,{ok:true,added})}
  if(req.method==='DELETE'&&u.pathname==='/api/events'){fs.writeFileSync(EVENTS,'');const c=readConfig();c.orders=[];c.orderSeq=0;writeConfig(c);emit('reset',{});emit('config',c);return json(res,200,{ok:true})}
  if(req.method==='GET'&&u.pathname==='/api/stream'){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write('retry: 2500\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return}
  serveStatic(u.pathname,res)
}catch(e){json(res,400,{ok:false,error:e.message})}});
server.listen(PORT,'0.0.0.0',()=>{console.log(`\nSupply Chain Arena activa en puerto ${PORT}`);console.log(`Docente: http://localhost:${PORT}/teacher.html`);for(const [name,list] of Object.entries(os.networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal){console.log(`Torre (${name}): http://${n.address}:${PORT}/tower.html`);console.log(`Producción (${name}): http://${n.address}:${PORT}/production.html`);console.log(`Transportista (${name}): http://${n.address}:${PORT}/transport.html`)}console.log('No requiere Internet ni paquetes npm externos.\n')});
