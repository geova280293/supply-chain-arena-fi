function uuid(){return (crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`)}
function nowISO(){return new Date().toISOString()}
function fmtTime(ts){try{return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}catch{return ts}}
function fmtDateTime(ts){try{return new Date(ts).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})}catch{return ts||'—'}}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(msg){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',2400)}
async function api(url,opts={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Error de comunicación');return j}
const INSTITUTION={university:'Universidad Autónoma de Querétaro',faculty:'Facultad de Ingeniería',program:'Ingeniería Industrial y de Manufactura',course:'Logística',author:'Dr. Edwin Geovanny Vergara Ayala'};
const FI_PLACES=['Edificio A','Edificio B','Edificio C','Centro de Cómputo','Gimnasio','FiTacate','Cafecito','Oxxito','Bosquesito','Aula al Aire Libre','Laboratorio de Automatización','Laboratorio de Mecatrónica','Laboratorio de Suelos','Laboratorio de Hidráulica','CETEVI','CEDIT','Edificio Biotecnológico','Estadio','Estacionamiento','Sótano','Canchas de Squash','Canchas de Frontón','Auditorio','Explanada del Biotecnológico','Edificio E','Edificio F','Edificio G','Edificio I','Plaza de Arquitectura','Edificio H'];
function defaultColor(i=0){return ['#e7656f','#4c8fe8','#f5c84b','#63b97a','#8b77d9','#ef9651'][i%6]}
function effectiveStatus(o){if(!o)return'';if(['ENTREGADO','ENTREGADO_TARDE','CANCELADO'].includes(o.status))return o.status;const due=new Date(o.createdAt).getTime()+(+o.deadlineMin||0)*60000;return Date.now()>due?'VENCIDO':o.status}
function dueMs(o){return new Date(o.createdAt).getTime()+(+o.deadlineMin||0)*60000-Date.now()}
function countdownText(o){const ms=dueMs(o);const abs=Math.abs(ms);const m=Math.floor(abs/60000),s=Math.floor((abs%60000)/1000);return `${ms<0?'-':''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function stateClass(st){return ({NUEVO:'nuevo',EN_PRODUCCION:'produccion',LISTO:'listo',EN_DISTRIBUCION:'distribucion',ENTREGADO:'entregado',ENTREGADO_TARDE:'tarde',VENCIDO:'vencido',CANCELADO:'cancelado'})[st]||'nuevo'}
function stateLabel(st){return ({NUEVO:'Nuevo',EN_PRODUCCION:'En producción',LISTO:'Listo',EN_DISTRIBUCION:'En distribución',ENTREGADO:'Entregado',ENTREGADO_TARDE:'Entregado tarde',VENCIDO:'Vencido',CANCELADO:'Cancelado'})[st]||st}
function pathSegments(nodes=[]){const a=[];for(let i=0;i<nodes.length-1;i++)a.push(`${nodes[i]} → ${nodes[i+1]}`);return a}
function formatPath(nodes=[]){return nodes.filter(Boolean).join(' → ')||'Sin ruta'}
function minutesBetween(a,b){if(!a||!b)return null;return Math.max(0,(new Date(b)-new Date(a))/60000)}
function mountInstitutionalIdentity(){
  if(!document.body||document.querySelector('.institutional-strip'))return;
  document.body.insertAdjacentHTML('afterbegin',`<div class="institutional-strip"><div class="institutional-inner"><div class="institutional-monogram">UAQ</div><div><strong>${esc(INSTITUTION.university)}</strong><span>${esc(INSTITUTION.faculty)} · ${esc(INSTITUTION.program)}</span></div><div class="institutional-course"><strong>${esc(INSTITUTION.course)}</strong><span>${esc(INSTITUTION.author)}</span></div></div></div>`);
  document.body.insertAdjacentHTML('beforeend',`<footer class="institutional-footer"><strong>${esc(INSTITUTION.university)}</strong> · ${esc(INSTITUTION.faculty)} · ${esc(INSTITUTION.program)}<br><span>${esc(INSTITUTION.course)} · Autor académico: ${esc(INSTITUTION.author)}</span></footer>`);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountInstitutionalIdentity);else mountInstitutionalIdentity();