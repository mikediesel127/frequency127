/* Frequency127 – robust minimal client (DOM-safe) */
(() => {
  // ---------- tiny utils ----------
  const $ = (q, root = document) => root.querySelector(q);
  const $$ = (q, root = document) => [...root.querySelectorAll(q)];
  const on = (el, evt, fn) => { if (el) el.addEventListener(evt, fn); };
  const setText = (el, v) => { if (el) el.textContent = v; };

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

  // ---------- view flips ----------
  function showAuth() {
    const a = $("#auth-view"), s = $("#shell"), lo = $("#btn-logout");
    if (a) a.hidden = false;
    if (s) s.hidden = true;
    if (lo) lo.hidden = true;
  }
  function showShell() {
    const a = $("#auth-view"), s = $("#shell"), lo = $("#btn-logout");
    if (a) a.hidden = true;
    if (s) s.hidden = false;
    if (lo) lo.hidden = false;
  }

  // ---------- renderers ----------
  function renderRoutines() {
    const list = $("#routine-list");
    const empty = $("#empty-state");
    if (!list) return;

    list.innerHTML = "";
    if (!state.routines?.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    const tpl = $("#tpl-routine-item")?.content;
    state.routines.forEach(r => {
      const node = tpl ? tpl.cloneNode(true) : document.createElement("li");
      if (!tpl) node.className = "row item";
      const title = node.querySelector?.(".title");
      const steps = node.querySelector?.(".steps");
      setText(title, r.name);
      setText(steps, r.steps.map(s => s.type).join(" · "));

      const btnRun  = node.querySelector?.(".run");
      const btnEdit = node.querySelector?.(".edit");
      const btnDel  = node.querySelector?.(".del");
      if (btnRun)  btnRun.onclick  = () => startRun(r);
      if (btnEdit) btnEdit.onclick = () => openEditor(r);
      if (btnDel)  btnDel.onclick  = async () => {
        if (!confirm("Delete routine?")) return;
        await api(`/routines/${r.id}`, { method: "DELETE" });
        await loadData();
      };
      list.appendChild(node);
    });
  }

  function renderStats() {
    setText($("#stat-xp"),    state.me?.xp ?? 0);
    setText($("#stat-level"), 1 + Math.floor((state.me?.xp ?? 0) / 100));
    setText($("#stat-streak"), state.me?.streak ?? 0);
    setText($("#me-username"), state.me?.username ?? "");
  }

  // ---------- data ----------
  async function loadData() {
    const me = await api("/me");
    state.me = me.user || null;
    state.routines = me.routines || [];
    renderRoutines();
    renderStats();
    const recent = $("#recent-users");
    if (recent) recent.innerHTML = (me.recent || []).map(u=>`<span class="chip">${u}</span>`).join("");
    showShell();
  }

  // ---------- tabs ----------
  function wireTabs() {
    $$(".tab").forEach(btn=>{
      on(btn, "click", () => {
        $$(".tab").forEach(b=>b.classList.remove("is-active"));
        btn.classList.add("is-active");
        const t = btn.dataset.tab;
        $$(".tabpane").forEach(p=>p.classList.remove("is-active"));
        const pane = $(`#tab-${t}`);
        if (pane) pane.classList.add("is-active");
      });
    });
  }

  // ---------- editor ----------
  const editor = () => $("#routine-editor");
  const queue  = () => $("#re-queue");

  function openEditor(r = null) {
    const dlg = editor();
    if (!dlg) return;
    const title = $("#re-title");
    const name  = $("#re-name");
    const q     = queue();

    setText(title, r ? "Edit routine" : "New routine");
    if (name) name.value = r?.name || "";
    if (q) q.innerHTML = "";

    (r?.steps || []).forEach(s => pushStep(s.type));
    dlg.showModal();

    dlg.onclose = () => { if (queue()) queue().innerHTML = ""; };

    const btnSave = $("#re-save");
    if (btnSave) btnSave.onclick = async (e) => {
      e.preventDefault();
      const nm = name?.value.trim();
      const steps = [...(q?.querySelectorAll("li") || [])].map(li=>({ type: li.dataset.type }));
      if (!nm || !steps.length) return;
      if (r) {
        await api(`/routines/${r.id}`, { method:"PATCH", body:{ name: nm, steps } });
      } else {
        await api("/routines", { method:"POST", body:{ name: nm, steps } });
      }
      dlg.close();
      await loadData();
    };
  }

  function pushStep(type){
    const q = queue();
    if (!q) return;
    const li = document.createElement("li");
    li.dataset.type = type;
    li.textContent = type;
    li.title = "Remove";
    li.onclick = ()=> li.remove();
    q.appendChild(li);
  }

  function wireEditorPalette(){
    const palette = $("#re-steps");
    on(palette, "click", e=>{
      const b = e.target.closest?.(".chip"); if(!b) return;
      pushStep(b.dataset.type);
    });
    const btnNew = $("#btn-new-routine");
    on(btnNew, "click", ()=> openEditor());
  }

  // ---------- runner ----------
  const runner = () => $("#runner");

  function startRun(r){
    state.run.idx = 0;
    state.run.steps = r.steps || [];
    state.run.routineId = r.id;
    state.run.routineName = r.name;
    setText($("#run-title"), r.name);
    renderRun();
    runner()?.showModal();
  }

  function renderRun(){
    const body = $("#run-body");
    if (!body) return;
    const step = state.run.steps[state.run.idx];
    if (!step) { body.innerHTML = `<div class="muted">Done.</div>`; return; }
    if (step.type === "box") body.innerHTML = boxBreathUI();
    else if (step.type === "affirm") body.innerHTML = affirmUI();
    else if (step.type === "white") body.innerHTML = whiteLightUI();
    else body.innerHTML = `<div class="muted">Step</div>`;
  }

  on(window, "keydown", (e)=>{
    if (e.key === "Escape") runner()?.close?.();
  });

  function wireRunner(){
    const btnNext = $("#run-next");
    on(btnNext, "click", async (e)=>{
      e.preventDefault();
      state.run.idx++;
      if (state.run.idx >= state.run.steps.length){
        await api(`/routines/${state.run.routineId}/complete`, { method:"POST" });
        runner()?.close();
        await loadData();
      } else {
        renderRun();
      }
    });
  }

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

  // ---------- auth wiring ----------
  function wireAuth(){
    const toSignup = $("#btn-to-signup");
    const toLogin  = $("#btn-to-login");
    const loginForm  = $("#login-form");
    const signupForm = $("#signup-form");
    const errBox   = $("#auth-error");

    on(toSignup, "click", ()=>{
      if (loginForm) loginForm.hidden = true;
      if (signupForm) signupForm.hidden = false;
      if (errBox) errBox.hidden = true;
    });

    on(toLogin, "click", ()=>{
      if (signupForm) signupForm.hidden = true;
      if (loginForm) loginForm.hidden = false;
      if (errBox) errBox.hidden = true;
    });

    on(loginForm, "submit", async (e)=>{
      e.preventDefault();
      try{
        const username = $("#login-username")?.value.trim();
        const passcode = $("#login-passcode")?.value.trim();
        await api("/auth-login", { method:"POST", body:{ username, passcode } });
        await loadData();
      }catch(err){ showAuthError(err.message); }
    });

    on(signupForm, "submit", async (e)=>{
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

    const btnLogout = $("#btn-logout");
    on(btnLogout, "click", async ()=>{
      await api("/auth-logout", { method:"POST" });
      showAuth();
    });

    const shareBtn = $("#btn-share-profile");
    on(shareBtn, "click", async ()=>{
      try {
        const { url } = await api("/share", { method:"POST" });
        await navigator.clipboard?.writeText(url);
        alert("Share URL copied.");
      } catch (e) {
        alert("Could not create share link.");
      }
    });
  }

  // ---------- theme wiring ----------
  function wireTheme(){
    const toggle = $("#btn-theme");
    on(toggle, "click", ()=>{
      applyTheme(state.theme === "dark" ? "light" : state.theme === "light" ? "auto" : "dark");
    });
    $$('#tab-settings [data-theme]').forEach(b=>{
      on(b, "click", ()=> applyTheme(b.dataset.theme));
    });
  }

  // ---------- boot ----------
  async function boot() {
    applyTheme();
    wireTabs();
    wireEditorPalette();
    wireRunner();
    wireAuth();
    wireTheme();

    try { await loadData(); }
    catch { showAuth(); }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
