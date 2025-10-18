(() => {
  const $ = (sel, p = document) => p.querySelector(sel);
  const $$ = (sel, p = document) => [...p.querySelectorAll(sel)];

  const authView = $('#auth-view');
  const appView  = $('#app-view');

  const loginForm  = $('#login-form');
  const signupForm = $('#signup-form');
  const toSignup   = $('#btn-to-signup');
  const toLogin    = $('#btn-to-login');
  const logoutBtn  = $('#btn-logout');
  const authErr    = $('#auth-error');

  const meUsername = $('#me-username');
  const meXP       = $('#me-xp');
  const recentWrap = $('#recent-users');

  const list       = $('#routine-list');
  const emptyState = $('#empty-state');
  const newBtn     = $('#btn-new');

  const modal      = $('#routine-modal');
  const rmTitle    = $('#rm-title');
  const rmName     = $('#rm-name');
  const rmSteps    = $('#rm-steps');
  const rmSave     = $('#rm-save');
  const tplItem    = $('#tpl-item');

  // ---------- helpers ----------
  const j = (u, o={}) => fetch(u, { headers: { 'content-type': 'application/json' }, ...o });
  const pj = (r) => r.json().catch(() => ({}));

  function showAuth() { authView.hidden = false; appView.hidden = true; logoutBtn.hidden = true; }
  function showApp()  { authView.hidden = true; appView.hidden = false; logoutBtn.hidden = false; }

  function stepsToArray(text) {
    return String(text||'')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => ({ type: 'note', text: s }));
  }
  function stepsSummary(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return 'No steps yet';
    return steps.map(s => s.text || s.type).slice(0,3).join(' • ') + (steps.length>3?' …':'');
  }

  // ---------- state ----------
  let ME = null;

  async function loadMe() {
    const r = await fetch('/me', { credentials: 'include' });
    if (r.status === 401) {
      showAuth();
      return;
    }
    if (!r.ok) {
      console.error('ME failed', r.status);
      showAuth();
      return;
    }
    const me = await pj(r);
    ME = me;
    meUsername.textContent = me.username || '';
    meXP.textContent = me.xp ?? 0;
    renderRoutines(me.routines || []);
    showApp();
    loadRecent();
  }

  async function loadRecent() {
    try {
      const r = await fetch('/users-recent');
      const data = await pj(r);
      recentWrap.innerHTML = '';
      (data.users || []).forEach(u => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = u;
        recentWrap.appendChild(b);
      });
    } catch (e) {}
  }

  function renderRoutines(items) {
    list.innerHTML = '';
    if (!items.length) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    items.forEach(it => {
      const node = tplItem.content.firstElementChild.cloneNode(true);
      $('.title', node).textContent = it.name;
      $('.steps', node).textContent = stepsSummary(it.steps);

      $('.run', node).addEventListener('click', async () => {
        // simple "complete" call; you can expand runner later
        const r = await j(`/routines/${encodeURIComponent(it.id)}/complete`, { method: 'POST' });
        if (r.ok) {
          const data = await pj(r);
          // bump xp in UI
          const add = Number(data.xp_awarded || 0);
          const curr = Number(meXP.textContent || 0);
          meXP.textContent = curr + add;
        }
      });

      $('.del', node).addEventListener('click', async () => {
        if (!confirm('Delete this routine?')) return;
        const r = await j(`/routines/${encodeURIComponent(it.id)}`, { method: 'DELETE' });
        if (r.ok) {
          node.remove();
          if (!list.children.length) emptyState.hidden = false;
        }
      });

      list.appendChild(node);
    });
  }

  // ---------- events ----------
  document.addEventListener('DOMContentLoaded', () => {
    // Switch forms
    toSignup.addEventListener('click', () => {
      signupForm.hidden = false; loginForm.hidden = true; authErr.hidden = true;
    });
    toLogin.addEventListener('click', () => {
      signupForm.hidden = true; loginForm.hidden = false; authErr.hidden = true;
    });

    // Login
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      authErr.hidden = true;
      const username = $('#login-username').value.trim();
      const passcode = $('#login-passcode').value.trim();
      const r = await j('/auth-login', { method: 'POST', body: JSON.stringify({ username, passcode }) });
      const data = await pj(r);
      if (!r.ok) {
        authErr.textContent = data.error || 'Login failed';
        authErr.hidden = false;
        return;
      }
      await loadMe();
    });

    // Signup
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      authErr.hidden = true;
      const username = $('#signup-username').value.trim();
      const passcode = $('#signup-passcode').value.trim();
      const r = await j('/auth-signup', { method: 'POST', body: JSON.stringify({ username, passcode }) });
      const data = await pj(r);
      if (!r.ok) {
        authErr.textContent = data.error || 'Signup failed';
        authErr.hidden = false;
        return;
      }
      await loadMe();
    });

    // Logout
    logoutBtn.addEventListener('click', async () => {
      await j('/auth-logout', { method: 'POST' });
      showAuth();
    });

    // New Routine
    newBtn.addEventListener('click', () => {
      rmTitle.textContent = 'New routine';
      rmName.value = '';
      rmSteps.value = '';
      modal.showModal();
    });

    rmSave.addEventListener('click', async (e) => {
      e.preventDefault();
      const name = rmName.value.trim();
      const steps = stepsToArray(rmSteps.value);
      if (!name) return;
      const r = await j('/routines', { method: 'POST', body: JSON.stringify({ name, steps }) });
      if (r.ok) {
        modal.close();
        // reload list
        await loadMe();
      }
    });

    // Initial
    loadMe();
  });
})();
