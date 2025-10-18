/* Frequency127 – Frontend UX polish only (endpoints unchanged) */
(() => {
  // ---------- helpers ----------
  const $  = (q, root=document) => root.querySelector(q);
  const $$ = (q, root=document) => [...root.querySelectorAll(q)];
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const set = (el, t) => { if (el) el.textContent = t; };

  const state = {
    me: null,
    routines: [],
    theme: localStorage.getItem("theme") || "auto",
    run: { idx: 0, steps: [], routineId: null, routineName: "" }
  };

  async function api(path, opts={}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "content-type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "include"
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
      throw new Error(msg);
    }
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  }

  // ---------- theme ----------
  function applyTheme(next = state.theme) {
    state.theme = next;
    localStorage.setItem("theme", next);
    const root = document.documentElement;
    if (next === "auto") root.removeAttribute("data-theme");
    if (next === "dark") root.setAttribute("data-theme","dark");
    if (next === "light") root.setAttribute("data-theme","light");
  }

  // ---------- view toggles ----------
  function showAuth() {
    $("#auth-view")?.classList.remove("hidden");
    if ($("#auth-view")) $("#auth-view").hidden = false;
    if ($("#shell")) $("#shell").hidden = true;
    if ($("#btn-logout")) $("#btn-logout").hidden = true;
  }
  function showShell() {
    if ($("#auth-view")) $("#auth-view").hidden = true;
    if ($("#shell")) $("#shell").hidden = false;
    if ($("#btn-logout")) $("#btn-logout").hidden = false;
  }

  // ---------- render ----------
  function renderStats() {
    set($("#stat-xp"), state.me?.xp ?? 0);
    set($("#stat-level"), 1 + Math.floor((state.me?.xp ?? 0) / 100));
    set($("#stat-streak"), state.me?.streak ?? 0);
    set($("#me-username"), state.me?.username ?? "");
  }

  function stepBadge(type){
    const label = type === "box" ? "Box" : type === "affirm" ? "Affirm" : type === "white" ? "White" : type;
    return `<span class="chip tiny">${label}</span>`;
  }

  function renderRoutines() {
    const list = $("#routine-list");
    const empty = $("#empty-state");
    if (!list) return;
    list.innerHTML = "";

    if (!state.routines.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    const tpl = $("#tpl-routine-item")?.content;
    state.routines.forEach(r => {
      const node = tpl ? tpl.cloneNode(true) : document.createElement("li");
      const titleEl = node.querySelector?.(".title");
      const stepsLine = node.querySelector?.(".steps");
      set(titleEl, r.name);
      if (stepsLine) stepsLine.innerHTML = r.steps.map(s => s?.type).map(stepBadge).join(" ");

      // Expand/collapse
      const item = node.querySelector(".item") || node;
      const caret = node.querySelector(".caret");
      const collapse = node.querySelector(".collapse");
      on(caret, "click", () => item.classList.toggle("is-open"));

      // Steps list inside collapse
      const stepsUl = node.querySelector(".steps-list");
      if (stepsUl) {
        stepsUl.innerHTML = (r.steps || []).map(s => `<li class="chip">${s.type}</li>`).join("");
      }

      // Actions
      const runBtn = node.querySelector(".run");
      const editBtn = node.querySelector(".edit");
      const delBtn = node.querySelector(".del");

      if (runBtn) runBtn.onclick = () => startRun(r);
      if (editBtn) editBtn.onclick = () => openEditor(r);
      if (delBtn) delBtn.onclick = async () => {
        if (!confirm("Delete routine?")) return;
        await api(`/routines/${r.id}`, { method:"DELETE" });
        await loadData();
      };

      list.appendChild(item);
    });
  }

  // ---------- data ----------
  async function loadData() {
    const { user, routines, recent } = await api("/me");
    state.me = user || null;
    state.routines = routines || [];
    renderStats();
    renderRoutines();
    const recentWrap = $("#recent-users");
    if (recentWrap) recentWrap.innerHTML = (recent || []).map(u=>`<span class="chip">${u}</span>`).join("");
    showShell();
  }

  // ---------- Editor (modal) ----------
  const editor = $("#routine-editor");
  const queue  = $("#re-queue");

  function openEditor(r=null){
    if (!editor) return;
    set($("#re-title"), r ? "Edit routine" : "New routine");
    const name = $("#re-name");
    if (name) name.value = r?.name || "";
    if (queue) queue.innerHTML = "";
    (r?.steps || []).forEach(s=> pushStep(s.type));
    editor.showModal();

    const saveBtn = $("#re-save");
    if (saveBtn) saveBtn.onclick = async (e)=>{
      e.preventDefault();
      const nm = name?.value.trim();
      const steps = [...(queue?.querySelectorAll("li") || [])].map(li=>({ type: li.dataset.type }));
      if (!nm || !steps.length) return;
      if (r) await api(`/routines/${r.id}`, { method:"PATCH", body:{ name:nm, steps } });
      else await api("/routines", { method:"POST", body:{ name:nm, steps } });
      editor.close();
      await loadData();
    };
  }
  function pushStep(type){
    if (!queue) return;
    const li = document.createElement("li");
    li.dataset.type = type;
    li.textContent = type;
    li.title = "Remove";
    li.onclick = ()=> li.remove();
    queue.appendChild(li);
  }

  on($("#re-steps"), "click", e=>{
    const b = e.target.closest?.(".chip"); if(!b) return;
    pushStep(b.dataset.type);
  });

  on($("#btn-new-routine"), "click", ()=> openEditor());
  on($("#fab-new"), "click", ()=> openEditor());

  // ---------- Runner ----------
  const runner = $("#runner");

  function startRun(r){
    state.run = { idx:0, steps: r.steps || [], routineId: r.id, routineName: r.name };
    set($("#run-title"), r.name);
    renderRun();
    runner?.showModal();
  }
  function renderRun(){
    const body = $("#run-body"); if (!body) return;
    const s = state.run.steps[state.run.idx];
    if (!s) { body.innerHTML = `<div class="muted">Done.</div>`; return; }
    if (s.type === "box") body.innerHTML = boxBreathUI();
    else if (s.type === "affirm") body.innerHTML = affirmUI();
    else if (s.type === "white") body.innerHTML = whiteLightUI();
    else body.innerHTML = `<div class="muted">Step</div>`;
  }
  on($("#run-next"), "click", async (e)=>{
    e.preventDefault();
    state.run.idx++;
    if (state.run.idx >= state.run.steps.length){
      await api(`/routines/${state.run.routineId}/complete`, { method:"POST" });
      runner?.close();
      await loadData();
    } else {
      renderRun();
    }
  });
  on(window, "keydown", (e)=>{ if (e.key === "Escape") runner?.close?.(); });

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

  // ---------- Auth ----------
  on($("#btn-to-signup"), "click", ()=>{
    $("#login-form").hidden = true;
    $("#signup-form").hidden = false;
    $("#auth-error").hidden = true;
  });
  on($("#btn-to-login"), "click", ()=>{
    $("#signup-form").hidden = true;
    $("#login-form").hidden = false;
    $("#auth-error").hidden = true;
  });

  on($("#login-form"), "submit", async (e)=>{
    e.preventDefault();
    try{
      const username = $("#login-username")?.value.trim();
      const passcode = $("#login-passcode")?.value.trim();
      await api("/auth-login", { method:"POST", body:{ username, passcode } });
      await loadData();
    }catch(err){ showAuthError(err.message); }
  });
  on($("#signup-form"), "submit", async (e)=>{
    e.preventDefault();
    try{
      const username = $("#signup-username")?.value.trim();
      const passcode = $("#signup-passcode")?.value.trim();
      await api("/auth-signup", { method:"POST", body:{ username, passcode } });
      await loadData();
    }catch(err){ showAuthError(err.message); }
  });
  function showAuthError(msg){
    const el = $("#auth-error");
    if (!el) return;
    el.textContent = msg || "Error";
    el.hidden = false;
  }

  on($("#btn-logout"), "click", async ()=>{
    await api("/auth-logout", { method:"POST" });
    showAuth();
  });

  on($("#btn-share-profile"), "click", async ()=>{
    try{
      const { url } = await api("/share", { method:"POST" });
      await navigator.clipboard?.writeText(url);
      alert("Share URL copied.");
    }catch{ alert("Could not create share link."); }
  });

  // ---------- Theme ----------
  on($("#btn-theme"), "click", ()=>{
    applyTheme(state.theme === "dark" ? "light" : state.theme === "light" ? "auto" : "dark");
  });
  $$('.chip[data-theme]').forEach(b => on(b, "click", ()=> applyTheme(b.dataset.theme)));

  // ---------- boot ----------
  async function boot(){
    applyTheme();
    try { await loadData(); }
    catch { showAuth(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
