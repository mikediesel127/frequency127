(function() {
const $ = s => document.querySelector(s);

const auth = $('#auth');
const app = $('#app');
const loginForm = $('#login-form');
const signupForm = $('#signup-form');
const authError = $('#auth-error');
const showSignup = $('#show-signup');
const showLogin = $('#show-login');
const logout = $('#logout');
const username = $('#username');
const xp = $('#xp');
const recent = $('#recent');
const list = $('#list');
const empty = $('#empty');
const newBtn = $('#new-btn');
const emptyBtn = $('#empty-btn');
const modal = $('#modal');
const routineForm = $('#routine-form');
const modalCancel = $('#modal-cancel');
const tpl = $('#tpl');

let user = null;

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...opts.headers }
  });
  const data = await res.json().catch(() => ({}));
  console.log('API Response:', path, res.status, data);
  return { ok: res.ok, status: res.status, data };
}

function showAuth() {
  auth.hidden = false;
  app.hidden = true;
}

function showApp() {
  auth.hidden = true;
  app.hidden = false;
}

function showError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
  setTimeout(() => authError.hidden = true, 4000);
}

async function loadMe() {
  const { ok, data } = await api('/auth/me');
  if (!ok) return showAuth();
  
  user = data;
  username.textContent = data.username;
  xp.textContent = `${data.xp} XP`;
  renderRoutines(data.routines || []);
  showApp();
  loadRecent();
}

async function loadRecent() {
  const { data } = await api('/users/recent');
  recent.innerHTML = '';
  (data.users || []).forEach(u => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = u;
    recent.appendChild(chip);
  });
}

function renderRoutines(routines) {
  list.innerHTML = '';
  
  if (!routines.length) {
    empty.hidden = false;
    return;
  }
  
  empty.hidden = true;
  
  routines.forEach(r => {
    const clone = tpl.content.cloneNode(true);
    const card = clone.querySelector('.routine-card');
    card.dataset.id = r.id;
    
    clone.querySelector('.routine-name').textContent = r.name;
    
    const stepsEl = clone.querySelector('.routine-steps');
    const steps = r.steps || [];
    if (steps.length) {
      steps.forEach(s => {
        const step = document.createElement('div');
        step.className = 'step';
        step.textContent = s.text || s.type;
        stepsEl.appendChild(step);
      });
    } else {
      stepsEl.textContent = 'No steps';
    }
    
    clone.querySelector('.btn-complete').onclick = () => completeRoutine(r.id);
    clone.querySelector('.btn-delete').onclick = () => deleteRoutine(r.id, card);
    
    list.appendChild(clone);
  });
}

async function completeRoutine(id) {
  const { ok, data } = await api(`/routines/${id}/complete`, { method: 'POST' });
  if (ok) {
    const currentXP = parseInt(xp.textContent) || 0;
    xp.textContent = `${currentXP + (data.xp_awarded || 0)} XP`;
  }
}

async function deleteRoutine(id, card) {
  if (!confirm('Delete this routine?')) return;
  const { ok } = await api(`/routines/${id}`, { method: 'DELETE' });
  if (ok) {
    card.remove();
    if (!list.children.length) empty.hidden = false;
  }
}

function openModal() {
  $('#routine-name').value = '';
  $('#routine-steps').value = '';
  modal.showModal();
}

showSignup.onclick = () => {
  loginForm.hidden = true;
  signupForm.hidden = false;
  authError.hidden = true;
};

showLogin.onclick = () => {
  signupForm.hidden = true;
  loginForm.hidden = false;
  authError.hidden = true;
};

loginForm.onsubmit = async e => {
  e.preventDefault();
  console.log('Login form submitted');
  const username = $('#login-user').value.trim();
  const passcode = $('#login-pass').value.trim();
  
  console.log('Login attempt:', { username, passcode: '****' });
  
  const { ok, status, data } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, passcode })
  });
  
  console.log('Login result:', { ok, status, data });
  
  if (!ok) {
    showError(data.error || 'Login failed');
    return;
  }
  
  console.log('Login success, loading user data...');
  await loadMe();
};

signupForm.onsubmit = async e => {
  e.preventDefault();
  console.log('Signup form submitted');
  const username = $('#signup-user').value.trim();
  const passcode = $('#signup-pass').value.trim();
  
  console.log('Signup attempt:', { username, passcode: '****' });
  
  if (!/^\d{4}$/.test(passcode)) {
    showError('Code must be 4 digits');
    return;
  }
  
  const { ok, status, data } = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, passcode })
  });
  
  console.log('Signup result:', { ok, status, data });
  
  if (!ok) {
    showError(data.error || 'Signup failed');
    return;
  }
  
  console.log('Signup success, loading user data...');
  await loadMe();
};

logout.onclick = async () => {
  await api('/auth/logout', { method: 'POST' });
  location.reload();
};

newBtn.onclick = openModal;
emptyBtn.onclick = openModal;
modalCancel.onclick = () => modal.close();

routineForm.onsubmit = async e => {
  e.preventDefault();
  const name = $('#routine-name').value.trim();
  const stepsText = $('#routine-steps').value;
  const steps = stepsText.split('\n').map(s => s.trim()).filter(Boolean).map(text => ({ type: 'note', text }));
  
  const { ok } = await api('/routines', {
    method: 'POST',
    body: JSON.stringify({ name, steps })
  });
  
  if (ok) {
    modal.close();
    await loadMe();
  }
};

console.log('App initializing...');
loadMe();
})();