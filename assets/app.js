(() => {
  // ------- tiny helpers -------
  const $ = (sel, p = document) => p.querySelector(sel);
  const j = (u, o={}) => fetch(u, { headers: { 'content-type': 'application/json' }, credentials:'include', ...o });
  const pj = r => r.json().catch(()=> ({}));

  // ------- nodes -------
  const authView   = $('#auth-view');
  const authCard   = $('#auth-card');
  const appView    = $('#app-view');
  const logoutBtn  = $('#btn-logout');
  const authErr    = $('#auth-error');

  const loginForm  = $('#login-form');
  const signupForm = $('#signup-form');
  const toSignup   = $('#btn-to-signup');
  const toLogin    = $('#btn-to-login');

  const meUsername = $('#me-username');
  const meXP       = $('#me-xp');
  const recentWrap = $('#recent-users');

  const list       = $('#routine-list');
  const emptyState = $('#empty-state');
  const newBtn     = $('#btn-new');

  const modal      = $('#routine-modal');
  const rmName     = $('#rm-name');
  const rmSteps    = $('#rm-steps');
  const tplItem    = $('#tpl-item');

  // ------- view toggles (hard) -------
  function showAuth() {
    authView.hidden = false;
    appView.hidden  = true;
    logoutBtn.hidden = true;
  }
  function showApp() {
    authView.hidden = true;
    appView.hidden  = false;
    logoutBtn.hidden = false;
  }
  function destroyAuth() {
    // permanently remove to avoid any overlay/stacking weirdness
    authView.remove();
    logoutBtn.hidden = false;
  }

  // ------- utils -------
  function stepsToArray(text) {
    return String(text||'')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => ({ type:'note', text:s }));
  }
  const stepsSummary = (steps=[]) =>
    steps.length ? steps.map(s => s.text||s.type).slice(0,3).join(' • ') + (steps.length>3?' …':'') : 'No steps yet';

  // ------- state -------
  let ME = null;

  async function loadMe() {
    const r = await j('/me');
    if (r.status === 401) { showAuth(); return; }
    if (!r.ok) { console.error('ME failed', r.status); showAuth(); return; }
    const me = await pj(r);
    ME = me;
    meUsername.textContent = me.username || '';
    meXP.textContent = me.xp ?? 0;
    renderRoutines(me.routines || []);
    showApp();
    // auth is no longer needed once user is in
    destroyAuth();
    loadRecent().catch(()=>{});
  }

  async function loadRecent() {
    const r = await fetch('/users-recent');
    const data = await pj(r);
    recentWrap.innerHTML = '';
    (data.users || []).forEach(u => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = u;
      recentWrap.appendChild(b);
    });
  }

  function renderRoutines(items) {
    list.innerHTML = '';
    if (!items.length) { emptyState.hidden = false; return; }
    emptyState.hidden = true;

    for (const it of items) {
      const node = tplItem.content.firstElementChild.cloneNode(true);
      node.querySelector('.title').textContent = it.name;
      node.querySelector('.steps').textContent = stepsSummary(it.steps);

      node.querySelector('.run').addEventListener('click', async () => {
        const r = await j(`/routines/${encodeURIComponent(it.id)}/complete`, { method:'POST' });
        if (r.ok) {
          const data = await pj(r);
          const add = Number(data.xp_awarded || 0);
          meXP.textContent = Number(meXP.textContent||0) + add;
        }
      });

      node.querySelector('.del').addEventListener('click', async () => {
        if (!confirm('Delete this routine?')) return;
        const r = await j(`/routines/${encodeURIComponent(it.id)}`, { method:'DELETE' });
        if (r.ok) {
          node.remove();
          if (!list.children.length) emptyState.hidden = false;
        }
      });

      list.appendChild(node);
    }
  }

  // ------- events -------
  document.addEventListener('DOMContentLoaded', () => {
    // Ensure signup is hidden on first paint (belt & braces)
    signupForm.hidden = true;

    toSignup.addEventListener('click', () => {
      signupForm.hidden = false;
      loginForm.hidden  = true;
      authErr.hidden = true;
    });
    toLogin.addEventListener('click', () => {
      signupForm.hidden = true;
      loginForm.hidden  = false;
      authErr.hidden = true;
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      authErr.hidden = true;
      const username = $('#login-username').value.trim();
      const passcode = $('#login-passcode').value.trim();
      const r = await j('/auth-login', { method:'POST', body: JSON.stringify({ username, passcode }) });
      const data = await pj(r);
      if (!r.ok) {
        authErr.textContent = data.error || 'Login failed';
        authErr.hidden = false;
        return;
      }
      await loadMe();
    });

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      authErr.hidden = true;
      const username = $('#signup-username').value.trim();
      const passcode = $('#signup-passcode').value.trim();
      const r = await j('/auth-signup', { method:'POST', body: JSON.stringify({ username, passcode }) });
      const data = await pj(r);
      if (!r.ok) {
        authErr.textContent = data.error || 'Signup failed';
        authErr.hidden = false;
        return;
      }
      await loadMe();
    });

    logoutBtn.addEventListener('click', async () => {
      await j('/auth-logout', { method:'POST' });
      // Refresh to fully reset app state
      location.reload();
    });

    newBtn?.addEventListener('click', () => {
      $('#routine-modal').showModal();
      rmName.value = '';
      rmSteps.value = '';
    });

    $('#rm-save')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const name  = rmName.value.trim();
      const steps = stepsToArray(rmSteps.value);
      if (!name) return;
      const r = await j('/routines', { method:'POST', body: JSON.stringify({ name, steps }) });
      if (r.ok) {
        $('#routine-modal').close();
        await loadMe();
      }
    });

    // Boot
    loadMe();
  });
})();
