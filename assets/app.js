/* frequency127 front-end SPA (vanilla) */
const api = (path, opt = {}) =>
  fetch(path, Object.assign({
    headers: { 'content-type': 'application/json' },
    credentials: 'include'
  }, opt)).then(r => r.json());

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const state = { me:null, steps:[] };

// Tabs
$('#tabs').addEventListener('click', e=>{
  const b = e.target.closest('button.tab'); if(!b) return;
  $$('#tabs .tab').forEach(t=>t.classList.remove('active'));
  b.classList.add('active');
  ['begin','guides','unlocks','settings','auth','routineEditor','runner'].forEach(id=>$('#'+id)?.classList.add('hide'));
  const id = b.dataset.tab;
  if(id==='begin' && !state.me){ $('#auth').classList.remove('hide'); }
  else $('#'+id)?.classList.remove('hide');
});

// Auth tab toggle
$('#authTabs').addEventListener('click', e=>{
  const b = e.target.closest('button.tab'); if(!b) return;
  $$('#authTabs .tab').forEach(t=>t.classList.remove('active')); b.classList.add('active');
  $('#loginForm').classList.toggle('hide', b.dataset.sub!=='login');
  $('#signupForm').classList.toggle('hide', b.dataset.sub!=='signup');
});

// Auth forms
$('#loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = new FormData(e.target);
  const res = await api('/auth-login', {method:'POST', body:JSON.stringify(Object.fromEntries(f))});
  if(res.ok){ await loadMe(); toast('Welcome back.'); }
  else alert(res.error||'Login failed');
});
$('#signupForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = new FormData(e.target);
  const res = await api('/auth-signup', {method:'POST', body:JSON.stringify(Object.fromEntries(f))});
  if(res.ok){ await loadMe(); toast('Account created.'); }
  else alert(res.error||'Sign up failed');
});
$('#logout').addEventListener('click', async ()=>{
  await api('/auth-logout',{method:'POST'}); state.me=null; renderAuth();
});

// Theme
document.addEventListener('click', e=>{
  const t = e.target.closest('button.theme'); if(!t) return;
  document.documentElement.setAttribute('data-theme', t.dataset.theme);
  localStorage.setItem('f127-theme', t.dataset.theme);
});
const savedTheme = localStorage.getItem('f127-theme') || 'violet';
document.documentElement.setAttribute('data-theme', savedTheme);

// New routine builder
const stepPreview = $('#stepPreview');
$('#newRoutine').addEventListener('click', e=>{
  const b = e.target.closest('button[data-step]'); if(!b) return;
  const type = b.dataset.step;
  const step = type==='box' ? {type:'box', cycles:2}
    : type==='aff' ? {type:'aff', text:"I close loops.\nI breathe and see clearly."}
    : {type:'wl', seconds:60};
  state.steps.push(step);
  stepPreview.textContent = 'Steps: ' + state.steps.map(s=>s.type).join(' • ');
});
$('#newRoutine').addEventListener('submit', async e=>{
  e.preventDefault();
  if(!state.me) return alert('Login first.');
  const f = new FormData(e.target);
  const body = { name: f.get('name'), time: f.get('time')||null, steps: state.steps };
  const res = await api('/routines', {method:'POST', body:JSON.stringify(body)});
  if(res.ok){ state.steps=[]; stepPreview.textContent=''; e.target.reset(); await loadMe(); }
  else alert(res.error||'Failed');
});

// Routine list actions
async function loadMe(){
  const res = await api('/me'); if(res.ok){ state.me = res.user; renderAuth(); renderRoutines(res.routines); }
  else { state.me=null; renderAuth(); }
}
function renderAuth(){
  $('#username').textContent = state.me ? '@'+state.me.username : '';
  $('#avatar').classList.toggle('hide', !state.me);
  $('#auth').classList.toggle('hide', !!state.me);
  $('#begin').classList.toggle('hide', !state.me);
}
function renderRoutines(list){
  const el = $('#routineList'); el.innerHTML='';
  for(const r of list){
    const div = document.createElement('div'); div.className='item';
    const left = document.createElement('div');
    left.innerHTML = `<strong>${r.name}</strong> <span class="muted small">Lv.${r.level} • +${r.xp}xp</span>`;
    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='6px';
    const open = btn('Open', ()=> openRoutine(r.id));
    const run = btn('Run', ()=> runRoutine(r.id));
    const del = icon('🗑️', async ()=>{
      if(!confirm('Delete routine?')) return;
      await api('/routines/'+r.id,{method:'DELETE'}); loadMe();
    });
    right.append(open, run, del); div.append(left, right); el.append(div);
  }
}
function btn(text, onclick){ const b=document.createElement('button'); b.textContent=text; b.onclick=onclick; return b; }
function icon(txt, onclick){ const b=document.createElement('button'); b.className='icon-btn'; b.textContent=txt; b.onclick=onclick; return b; }

async function openRoutine(id){
  const res = await api('/routines/'+id); if(!res.ok) return alert('Failed');
  const r = res.routine; const s = $('#routineEditor'); s.classList.remove('hide'); $('#begin').classList.add('hide');
  s.innerHTML = `<div class="small muted"><a href="#" id="back">&larr; Your routines</a></div>
  <h3>${r.name}</h3>
  <div class="list" id="editList"></div>
  <div class="chips">
    <button data-add="box">+ Box breathing</button>
    <button data-add="aff">+ Affirmations</button>
    <button data-add="wl">+ White Light</button>
  </div>
  <div class="row" style="margin-top:10px">
    <button id="saveRoutine">Save</button>
    <button id="runRoutine">Run now</button>
  </div>`;
  const steps = (r.steps||[]).slice(); // local copy

  const draw = ()=>{
    const list = $('#editList'); list.innerHTML='';
    steps.forEach((st,i)=>{
      const li = document.createElement('div'); li.className='item'; li.innerHTML = `<div>${i+1}. <code>${st.type}</code> ${desc(st)}</div>`;
      const tools = document.createElement('div'); tools.style.display='flex'; tools.style.gap='6px';
      const up = icon('▲', ()=>{ if(i>0){ [steps[i-1],steps[i]]=[steps[i],steps[i-1]]; draw(); } });
      const down = icon('▼', ()=>{ if(i<steps.length-1){ [steps[i+1],steps[i]]=[steps[i],steps[i+1]]; draw(); } });
      const rm = icon('🗑️', ()=>{ steps.splice(i,1); draw(); });
      tools.append(up,down,rm); li.append(tools); list.append(li);
    });
  };
  function desc(st){
    if(st.type==='box') return `(cycles ${st.cycles||2})`;
    if(st.type==='aff') return `(${(st.text||'').split('\\n').length} lines)`;
    if(st.type==='wl') return `(${st.seconds||60}s)`;
    return '';
  }
  draw();

  s.onclick = async e=>{
    if(e.target.id==='back'){ e.preventDefault(); s.classList.add('hide'); $('#begin').classList.remove('hide'); return; }
    if(e.target.dataset.add){
      const type = e.target.dataset.add;
      steps.push(type==='box'?{type:'box',cycles:2}:type==='aff'?{type:'aff',text:'I close loops.'}:{type:'wl',seconds:60}); draw();
    }
    if(e.target.id==='saveRoutine'){
      await api('/routines/'+id,{method:'PUT',body:JSON.stringify({steps})}); toast('Saved.'); await loadMe();
    }
    if(e.target.id==='runRoutine'){ runRoutine(id); }
  }
}

async function runRoutine(id){
  const res = await api('/routines/'+id); if(!res.ok) return alert('Failed');
  const r = res.routine; const modal = $('#runner'); modal.classList.remove('hide');
  const box = document.createElement('div'); box.className='runner-center';
  const content = $('#runnerContent'); content.innerHTML=''; content.append(box);

  modal.style.top = '10vh';

  async function doBox(s){ box.innerHTML=''; const cycles = s.cycles||2;
    const svgWrap = document.createElement('div'); svgWrap.className='svg-wrap'; svgWrap.style.position='relative';
    svgWrap.innerHTML = svgBox(); const counter = document.createElement('div'); counter.className='counter'; counter.id='ctr'; svgWrap.append(counter);
    box.append(svgWrap);
    for(let i=0;i<cycles;i++){ await animateBox(4,4,4,4); }
  }
  async function doAff(s){
    box.innerHTML=''; const lines = (s.text||'').split('\\n').filter(Boolean);
    const p = document.createElement('div'); p.style.fontSize='22px'; p.style.textAlign='center'; p.style.lineHeight='1.8';
    box.append(p);
    for(const line of lines){
      p.innerHTML=''; const words=line.split(' ');
      for(const w of words){ const span=document.createElement('span'); span.textContent=w+' '; p.append(span);
        await wait(450); span.style.color='#fff'; }
      await wait(800);
    }
  }
  async function doWL(s){
    box.innerHTML='<div class="center muted">White‑Light visualization '+(s.seconds||60)+'s</div>';
    await wait((s.seconds||60)*1000);
  }

  for(const step of r.steps||[]){
    if(step.type==='box') await doBox(step);
    if(step.type==='aff') await doAff(step);
    if(step.type==='wl') await doWL(step);
  }
  await api('/routines/'+id+'/complete',{method:'POST'});
  toast('Routine complete. +10xp'); modal.classList.add('hide'); await loadMe();
}
$('#runnerClose').addEventListener('click', ()=> $('#runner').classList.add('hide'));

function svgBox(){
  return `<svg viewBox="0 0 120 120">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c6cff"/><stop offset="1" stop-color="#4cc9f0"/>
    </linearGradient></defs>
    <rect x="10" y="10" width="100" height="100" rx="8" fill="none" stroke="#24304a" stroke-width="6"/>
    <rect id="p" x="10" y="10" width="100" height="100" rx="8" fill="none" stroke="url(#g)" stroke-width="6" stroke-linecap="round" pathLength="400" stroke-dasharray="0 400"/>
  </svg>`;
}
async function animateBox(a=4,b=4,c=4,d=4){
  const p = document.getElementById('p'); let dash=0;
  const ctr = document.getElementById('ctr');
  async function seg(sec,label){ ctr.textContent=label; const start=performance.now(); const dur=sec*1000;
    return new Promise(res=>{
      function loop(t){ const k=Math.min(1,(t-start)/dur); const add=100*k; p.setAttribute('stroke-dasharray', `${dash+add} ${400-(dash+add)}`);
        if(k<1) requestAnimationFrame(loop); else { dash+=100; res(); } }
      requestAnimationFrame(loop);
    })
  }
  await seg(a,'Inhale'); await seg(b,'Hold'); await seg(c,'Exhale'); await seg(d,'Hold');
}

function wait(ms){ return new Promise(r=>setTimeout(r, ms)); }
function toast(msg){
  const t=document.createElement('div'); t.textContent=msg; t.style.position='fixed'; t.style.bottom='18px'; t.style.left='50%'; t.style.transform='translateX(-50%)';
  t.style.background='#0f1524'; t.style.border='1px solid #253257'; t.style.padding='10px 14px'; t.style.borderRadius='10px'; t.style.zIndex=50;
  document.body.append(t); setTimeout(()=>t.remove(),1800);
}

// Initial load
loadMe().catch(()=>{});
