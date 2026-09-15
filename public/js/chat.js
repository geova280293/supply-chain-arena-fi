(()=>{
let chatCfg={teams:[]},messages=[],open=false,unread=0;
const role=location.pathname.includes('tower')?'Torre de Control':location.pathname.includes('production')?'Producción':'Transporte';
function teamId(){return document.getElementById('team')?.value||''}
function sender(){if(role==='Transporte'){const el=document.getElementById('member');return el?.value||el?.selectedOptions?.[0]?.textContent||'Transportista'}return role}
function mount(){
 if(document.getElementById('teamChat'))return;
 document.body.insertAdjacentHTML('beforeend','<button id="chatFab" class="chat-fab" aria-label="Chat de equipo">💬<span id="chatUnread" class="chat-unread hidden">0</span></button><section id="teamChat" class="team-chat hidden"><div class="chat-head"><div><strong>Chat del equipo</strong><span id="chatTeamName">Comunicación operativa</span></div><button class="chat-close" id="chatClose">×</button></div><div id="chatMessages" class="chat-messages"></div><div class="chat-quick" id="chatQuick"></div><div class="chat-compose"><input id="chatInput" maxlength="100" placeholder="Mensaje corto…"><button id="chatSend">Enviar</button></div></section>');
 document.getElementById('chatFab').onclick=()=>toggle(true);document.getElementById('chatClose').onclick=()=>toggle(false);document.getElementById('chatSend').onclick=sendInput;document.getElementById('chatInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();sendInput()}};
 const quick=role==='Torre de Control'?['Priorizar este pedido','Ruta actualizada','Eviten ruta caliente','Apoyar pedido urgente']:role==='Producción'?['Pedido listo','Falta material','Reciban captura en fábrica','Necesito transportista']:['Voy a planta','En ruta','Ruta comprometida','Llevo material recuperado'];
 document.getElementById('chatQuick').innerHTML=quick.map(x=>'<button>'+esc(x)+'</button>').join('');document.querySelectorAll('#chatQuick button').forEach(b=>b.onclick=()=>send(b.textContent));
}
function toggle(v){open=v;document.getElementById('teamChat').classList.toggle('hidden',!v);if(v){unread=0;drawUnread();render();setTimeout(()=>document.getElementById('chatInput')?.focus(),50)}}
function drawUnread(){const el=document.getElementById('chatUnread');el.textContent=unread;el.classList.toggle('hidden',!unread)}
function render(){
 const id=teamId(),t=chatCfg.teams.find(x=>x.id===id);document.getElementById('chatTeamName').textContent=t?.name||'Equipo';
 const list=messages.filter(m=>m.teamId===id&&m.type==='chat_message').slice(-60);
 document.getElementById('chatMessages').innerHTML=list.length?list.map(m=>'<div class="chat-msg '+(m.kind||'')+'"><div class="chat-meta">'+esc(m.senderName||m.senderRole||'Sistema')+' · '+fmtTime(m.ts)+'</div><div>'+esc(m.text||'')+'</div></div>').join(''):'<div class="empty">Sin mensajes todavía.</div>';
 const box=document.getElementById('chatMessages');box.scrollTop=box.scrollHeight
}
async function send(text){text=String(text||'').trim().slice(0,100);if(!text||!teamId())return;try{await api('/api/action',{method:'POST',body:JSON.stringify({type:'chat_message',teamId:teamId(),senderRole:role,senderName:sender(),text})});document.getElementById('chatInput').value=''}catch(e){toast('No se pudo enviar el mensaje')}}
function sendInput(){send(document.getElementById('chatInput').value)}
async function init(){mount();try{chatCfg=await api('/api/config');messages=(await api('/api/events')).filter(e=>e.type==='chat_message');render();const s=new EventSource('/api/stream');s.addEventListener('config',e=>{chatCfg=JSON.parse(e.data);render()});s.addEventListener('event',e=>{const m=JSON.parse(e.data);if(m.type!=='chat_message')return;messages.push(m);if(m.teamId===teamId()&&!open){unread++;drawUnread()}render()})}catch(e){}}
window.addEventListener('arena-team-changed',()=>{unread=0;drawUnread();render()});document.addEventListener('change',e=>{if(e.target?.id==='team'){setTimeout(()=>{unread=0;drawUnread();render()},0)}});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();