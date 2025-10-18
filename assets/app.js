/* Frequency127 – minimal client */
const $ = (q, root = document) => root.querySelector(q);
const $$ = (q, root = document) => [...root.querySelectorAll(q)];
const state = {
  me: null,
  routines: [],
  theme: localStorage.getItem("theme") || "auto",
  run: { idx: 0, steps: [], routineId: null, routineName: "" }
};

// ---------- fetch wrapper ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "include"
  });
  if (!res.ok) throw new Error((await res.json().catch(()=>({error:res.statusText}))).error || res.statusText);
  return res.headers.get("content-type")?.includes("application/json") ? res.json() : res.text();
}

// ---------- theme ----------
function applyTheme(next = state.theme) {
  state.theme = next;
  localStorage.setItem("theme", next);
  if (next === "auto") document.documentElement.removeAttribute("data-theme");
  if (next === "dark") document.documentElement.setAttribute("data-theme","dark");
  if (next === "light") document.documentElement.setAttribute("data-theme","light");
}

// ---------- auth views ----------
function showAuth() {
  $("#auth-view").hidden = false;
  $("#shell").hidden = true;
  $("#btn-logout").hidden = true;
}
function showShell() {
  $("#auth-view").hidden = true;
  $("#shell").hidden = false;
  $("#btn-logout").hidden = false;
}

// ---------- render ----------
function renderRoutines() {
  const list = $("#routine-list");
  list.innerHTML = "";
  if (!state.routines.length) { $("#empty-state").hidden = false; return; }
  $("#empty-state").hidden = true;
  const tpl = $("#tpl-routine-item").content;
  state.routines.forEach(r => {
    const node = tpl.cloneNode(true);
    node.querySelector(".title").textContent = r.name;
    node.querySelector(".steps").textContent = r.steps.map(s => s.type).join(" · ");
    node.querySelector(".run").onclick = () => startRun(r);
    node.querySelector(".edit").onclick = () => openEditor(r);
    node.querySelector(".del").onclick = async () => {
      if (!confirm("Delete routine?")) return;
      await api(`/routines/${r.id}`, { method: "DELETE" });
      await loadData();
    };
    list.appendChild(node);
  });
}

function renderStats() {
  $("#stat-xp").textContent = state.me?.xp ?? 0;
  $("#stat-level").textContent = 1 + Math.floor((state.me?.xp ?? 0) / 100);
  $("#stat-streak").textContent = state.me?.streak ?? 0;
  $("#me-username").textContent = state.me?.username ?? "";
}

// ---------- data ----------
async function loadData() {
  const { user, routines, recent } = await api("/me");
  state.me = user;
  state.routines = routines;
  renderRoutines();
  renderStats();
  $("#recent-users").innerHTML = (recent || []).map(u=>`<span class="chip">${u}</span>`).join("");
  showShell();
}

// ---------- tabs ----------
$$(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$(".tab").forEach(b=>b.classList.remove("is-active"));
    btn.classList.add("is-active");
    const t = btn.dataset.tab;
    $$(".tabpane").forEach(p=>p.classList.remove("is-active"));
    $(`#tab-${t}`).classList.add("is-active");
  });
});

// ---------- editor ----------
const editor = $("#routine-editor");
const queue = $("#re-queue");
const picked = new Map(); // type -> count

function openEditor(r = null) {
  $("#re-title").textContent = r ? "Edit routine" : "New routine";
  $("#re-name").value = r?.name || "";
  queue.innerHTML = "";
  picked.clear();
  (r?.steps || []).forEach(s => pushStep(s.type));
  editor.showModal();
  editor.onclose = ()=>{ picked.clear(); queue.innerHTML=""; };
  $("#re-save").onclick = async (e) => {
    e.preventDefault();
    const name = $("#re-name").value.trim();
    const steps = [...queue.querySelectorAll("li")].map(li=>({ type: li.dataset.type }));
    if (!name || !steps.length) return;
    if (r) {
      await api(`/routines/${r.id}`, { method:"PATCH", body:{ name, steps } });
    } else {
      await api("/routines", { method:"POST", body:{ name, steps } });
    }
    editor.close();
    await loadData();
  };
}
function pushStep(type){
  const li = document.createElement("li");
  li.dataset.type = type;
  li.textContent = type;
  li.title = "Remove";
  li.onclick = ()=> li.remove();
  queue.appendChild(li);
}
$("#re-steps").addEventListener("click", e=>{
  const b = e.target.closest(".chip"); if(!b) return;
  pushStep(b.dataset.type);
});
$("#btn-new-routine").onclick = ()=>openEditor();

// ---------- runner ----------
const runner = $("#runner");
function startRun(r){
  state.run.idx = 0;
  state.run.steps = r.steps;
  state.run.routineId = r.id;
  state.run.routineName = r.name;
  $("#run-title").textContent = r.name;
  renderRun();
  runner.showModal();
}
function renderRun(){
  const body = $("#run-body");
  const step = state.run.steps[state.run.idx];
  if (!step) { body.innerHTML = `<div class="muted">Done.</div>`; return; }
  if (step.type === "box") body.innerHTML = boxBreathUI();
  else if (step.type === "affirm") body.innerHTML = affirmUI();
  else if (step.type === "white") body.innerHTML = whiteLightUI();
}
$("#run-next").onclick = async (e)=>{
  e.preventDefault();
  state.run.idx++;
  if (state.run.idx >= state.run.steps.length){
    await api(`/routines/${state.run.routineId}/complete`, { method:"POST" });
    runner.close();
    await loadData();
  } else {
    renderRun();
  }
};

function boxBreathUI(){
  return `<div>
    <h4>Box Breathing</h4>
    <div class="muted">Inhale 4 · Hold 4 · Exhale 4 · Hold 4 (x4)</div>
  </div>`;
}
function affirmUI(){
  return `<div>
    <h4>Affirmations</h4>
    <div class="muted">Speak 3 lines slowly with full attention.</div>
  </div>`;
}
function whiteLightUI(){
  return `<div>
    <h4>White-Light Visualization</h4>
    <div class="muted">Dissolve the dark cloud into a bright white calm.</div>
  </div>`;
}

// ---------- auth ----------
$("#btn-to-signup").onclick = ()=>{ $("#login-form").hidden = true; $("#signup-form").hidden = false; $("#auth-error").hidden = true; };
$("#btn-to-login").onclick = ()=>{ $("#signup-form").hidden = true; $("#login-form").hidden = false; $("#auth-error").hidden = true; };

$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  try{
    const username = $("#login-username").value.trim();
    const passcode = $("#login-passcode").value.trim();
    await api("/auth-login", { method:"POST", body:{ username, passcode } });
    await loadData();
  }catch(err){ showAuthError(err.message); }
});
$("#signup-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  try{
    const username = $("#signup-username").value.trim();
    const passcode = $("#signup-passcode").value.trim();
    await api("/auth-signup", { method:"POST", body:{ username, passcode } });
    await loadData();
  }catch(err){ showAuthError(err.message); }
});
function showAuthError(msg){
  const el = $("#auth-error");
  el.textContent = msg || "Error";
  el.hidden = false;
}

// ---------- me / logout / share ----------
$("#btn-logout").onclick = async ()=>{ await api("/auth-logout", { method:"POST" }); showAuth(); };
$("#btn-share-profile").onclick = async ()=>{
  const { url } = await api("/share", { method:"POST" });
  navigator.clipboard?.writeText(url);
  alert("Share URL copied.");
};

// ---------- theme buttons ----------
$("#btn-theme").onclick = ()=> applyTheme(state.theme === "dark" ? "light" : state.theme === "light" ? "auto" : "dark");
$$('#tab-settings [data-theme]').forEach(b=>{
  b.onclick = ()=> applyTheme(b.dataset.theme);
});

// ---------- boot ----------
applyTheme();
(async () => {
  try { await loadData(); } catch { showAuth(); }
})();
