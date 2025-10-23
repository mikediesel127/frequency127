(function() {
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

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

const builderModal = $('#builder-modal');
const builderTitle = $('#builder-title');
const builderClose = $('#builder-close');
const builderCancel = $('#builder-cancel');
const builderSave = $('#builder-save');
const builderRoutineName = $('#builder-routine-name');
const builderIsPublic = $('#builder-is-public');
const builderStepsList = $('#builder-steps-list');

const runnerModal = $('#runner-modal');
const runnerClose = $('#runner-close');
const runnerStep = $('#runner-step');
const runnerPrev = $('#runner-prev');
const runnerNext = $('#runner-next');
const runnerCurrent = $('#runner-current');
const runnerTotal = $('#runner-total');

const stepItemTpl = $('#step-item-tpl');
const routineCardTpl = $('#routine-card-tpl');

const settingsBtn = $('#settings-btn');
const settingsModal = $('#settings-modal');
const settingsClose = $('#settings-close');
const settingsDone = $('#settings-done');

const addFriendBtn = $('#add-friend-btn');
const addFriendModal = $('#add-friend-modal');
const addFriendClose = $('#add-friend-close');
const addFriendCancel = $('#add-friend-cancel');
const addFriendSubmit = $('#add-friend-submit');
const friendUsername = $('#friend-username');
const friendError = $('#friend-error');
const friendsList = $('#friends-list');

const discoverBtn = $('#discover-btn');
const discoverModal = $('#discover-modal');
const discoverClose = $('#discover-close');
const discoverDone = $('#discover-done');
const publicRoutinesList = $('#public-routines-list');
const discoverEmpty = $('#discover-empty');

let user = null;
let currentRoutineId = null;
let builderSteps = [];
let runnerState = { routine: null, currentIndex: 0, intervalId: null };

const STEP_ICONS = {
  affirmation: '💭',
  breathwork: '🌬️',
  timer: '⏱️',
  note: '📝'
};

const STEP_LABELS = {
  affirmation: 'Affirmation',
  breathwork: 'Breathwork',
  timer: 'Timer',
  note: 'Note'
};

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...opts.headers }
  });
  const data = await res.json().catch(() => ({}));
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
  xp.textContent = data.xp;
  renderRoutines(data.routines || []);
  applyTheme(data.theme || 'dark');
  showApp();
  loadRecent();
  loadFriends();
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

async function loadFriends() {
  const { data } = await api('/friends');
  friendsList.innerHTML = '';
  (data.friends || []).forEach(f => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = f.username;
    chip.style.cursor = 'pointer';
    chip.title = 'Click to remove';
    chip.onclick = () => removeFriend(f.id, chip);
    friendsList.appendChild(chip);
  });

  if (!data.friends || !data.friends.length) {
    friendsList.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">No friends yet</span>';
  }
}

async function removeFriend(friendId, chipElement) {
  if (!confirm('Remove this friend?')) return;
  const { ok } = await api(`/friends/${friendId}`, { method: 'DELETE' });
  if (ok) {
    chipElement.remove();
    if (!friendsList.children.length) {
      friendsList.innerHTML = '<span style="color: var(--text-muted); font-size: 13px;">No friends yet</span>';
    }
  }
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });
}

async function setTheme(theme) {
  applyTheme(theme);
  await api('/auth/theme', {
    method: 'POST',
    body: JSON.stringify({ theme })
  });
}

async function openDiscoverModal() {
  const { data } = await api('/routines/public');
  publicRoutinesList.innerHTML = '';

  if (!data.routines || !data.routines.length) {
    discoverEmpty.hidden = false;
    publicRoutinesList.hidden = true;
  } else {
    discoverEmpty.hidden = true;
    publicRoutinesList.hidden = false;

    data.routines.forEach(r => {
      const clone = routineCardTpl.content.cloneNode(true);
      const card = clone.querySelector('.routine-card');

      clone.querySelector('.routine-name').textContent = r.name;
      clone.querySelector('.step-count').textContent = `${r.steps.length} steps • by ${r.username}`;

      const preview = clone.querySelector('.routine-steps-preview');
      r.steps.slice(0, 3).forEach(s => {
        const stepDiv = document.createElement('div');
        stepDiv.className = 'step-preview';
        stepDiv.innerHTML = `<span>${STEP_ICONS[s.type] || '📝'}</span><span>${s.content ? s.content.slice(0, 40) + '...' : STEP_LABELS[s.type]}</span>`;
        preview.appendChild(stepDiv);
      });

      const actions = clone.querySelector('.routine-actions');
      actions.innerHTML = '';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-icon run-btn';
      copyBtn.title = 'Copy to My Routines';
      copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 2h8v8M2 5h8v8H2V5z" stroke="currentColor" stroke-width="1.5"/></svg>';
      copyBtn.onclick = () => copyRoutine(r);
      actions.appendChild(copyBtn);

      publicRoutinesList.appendChild(clone);
    });
  }

  discoverModal.showModal();
}

async function copyRoutine(routine) {
  const { ok } = await api('/routines', {
    method: 'POST',
    body: JSON.stringify({
      name: routine.name + ' (Copy)',
      steps: routine.steps
    })
  });

  if (ok) {
    alert('Routine copied to your collection!');
    discoverModal.close();
    await loadMe();
  }
}

function renderRoutines(routines) {
  list.innerHTML = '';
  
  if (!routines.length) {
    empty.hidden = false;
    return;
  }
  
  empty.hidden = true;
  
  routines.forEach(r => {
    const clone = routineCardTpl.content.cloneNode(true);
    const card = clone.querySelector('.routine-card');
    
    clone.querySelector('.routine-name').textContent = r.name;
    clone.querySelector('.step-count').textContent = `${r.steps.length} steps`;
    
    const completionBadge = clone.querySelector('.completion-badge');
    if (r.completed_today) {
      completionBadge.hidden = false;
    }
    
    const preview = clone.querySelector('.routine-steps-preview');
    r.steps.slice(0, 3).forEach(s => {
      const stepDiv = document.createElement('div');
      stepDiv.className = 'step-preview';
      stepDiv.innerHTML = `<span>${STEP_ICONS[s.type] || '📝'}</span><span>${s.content ? s.content.slice(0, 40) + '...' : STEP_LABELS[s.type]}</span>`;
      preview.appendChild(stepDiv);
    });
    
    clone.querySelector('.run-btn').onclick = () => runRoutine(r);
    clone.querySelector('.edit-btn').onclick = () => editRoutine(r);
    clone.querySelector('.del-btn').onclick = () => deleteRoutine(r.id, card);
    
    list.appendChild(clone);
  });
}

function openBuilder(routine = null) {
  currentRoutineId = routine ? routine.id : null;
  builderTitle.textContent = routine ? 'Edit Routine' : 'New Routine';
  builderRoutineName.value = routine ? routine.name : '';
  builderIsPublic.checked = routine ? routine.is_public : false;
  builderSteps = routine ? [...routine.steps] : [];
  renderBuilderSteps();
  builderModal.showModal();
}

function renderBuilderSteps() {
  builderStepsList.innerHTML = '';
  builderSteps.forEach((step, index) => {
    const clone = stepItemTpl.content.cloneNode(true);
    const item = clone.querySelector('.step-item');
    
    item.dataset.index = index;
    item.querySelector('.step-icon').textContent = STEP_ICONS[step.type];
    item.querySelector('.step-type-label').textContent = STEP_LABELS[step.type];
    
    const input = item.querySelector('.step-input');
    input.value = step.content || '';
    
    if (step.type === 'timer') {
      input.placeholder = 'Seconds (e.g., 60)';
      input.type = 'number';
      input.min = '1';
      input.classList.add('timer-input');
    } else {
      input.placeholder = `Enter ${STEP_LABELS[step.type].toLowerCase()} content...`;
      input.type = 'text';
    }
    
    input.oninput = (e) => {
      builderSteps[index].content = e.target.value;
    };
    
    item.querySelector('.step-remove').onclick = () => {
      builderSteps.splice(index, 1);
      renderBuilderSteps();
    };
    
    item.ondragstart = (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', index);
      item.classList.add('dragging');
    };
    
    item.ondragend = () => {
      item.classList.remove('dragging');
    };
    
    item.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    };
    
    item.ondrop = (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/html'));
      const toIndex = parseInt(item.dataset.index);
      if (fromIndex !== toIndex) {
        const [moved] = builderSteps.splice(fromIndex, 1);
        builderSteps.splice(toIndex, 0, moved);
        renderBuilderSteps();
      }
    };
    
    builderStepsList.appendChild(clone);
  });
}

function addStep(type) {
  builderSteps.push({ type, content: '' });
  renderBuilderSteps();
}

async function saveRoutine() {
  const name = builderRoutineName.value.trim();
  if (!name) {
    alert('Please enter a routine name');
    return;
  }

  if (!builderSteps.length) {
    alert('Please add at least one step');
    return;
  }

  const steps = builderSteps.filter(s => s.content.trim());
  const is_public = builderIsPublic.checked ? 1 : 0;

  if (currentRoutineId) {
    await api(`/routines/${currentRoutineId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, steps, is_public })
    });
  } else {
    await api('/routines', {
      method: 'POST',
      body: JSON.stringify({ name, steps, is_public })
    });
  }

  builderModal.close();
  await loadMe();
}

function editRoutine(routine) {
  openBuilder(routine);
}

async function deleteRoutine(id, cardElement) {
  if (!confirm('Delete this routine?')) return;
  const { ok } = await api(`/routines/${id}`, { method: 'DELETE' });
  if (ok) {
    if (cardElement) cardElement.remove();
    if (!list.children.length) empty.hidden = false;
  }
}

function runRoutine(routine) {
  if (!routine.steps.length) {
    alert('This routine has no steps');
    return;
  }
  
  runnerState = {
    routine,
    currentIndex: 0,
    intervalId: null
  };
  
  runnerTotal.textContent = routine.steps.length;
  runnerModal.showModal();
  showRunnerStep(0);
}

function showRunnerStep(index) {
  const step = runnerState.routine.steps[index];
  runnerState.currentIndex = index;
  runnerCurrent.textContent = index + 1;
  
  runnerPrev.disabled = index === 0;
  runnerNext.textContent = index === runnerState.routine.steps.length - 1 ? 'Complete' : 'Next →';
  
  if (runnerState.intervalId) {
    clearInterval(runnerState.intervalId);
    runnerState.intervalId = null;
  }
  
  runnerStep.innerHTML = '';
  
  switch (step.type) {
    case 'affirmation':
      renderAffirmation(step.content);
      break;
    case 'breathwork':
      renderBreathwork(step.content);
      break;
    case 'timer':
      renderTimer(step.content);
      break;
    case 'note':
      renderNote(step.content);
      break;
  }
}

function renderAffirmation(content) {
  const container = document.createElement('div');
  container.className = 'runner-affirmation';

  const words = content.split(' ');
  const delayPerWord = Math.max(200, Math.min(500, 8000 / words.length));

  words.forEach((word, index) => {
    const wordSpan = document.createElement('span');
    wordSpan.className = 'affirmation-word';
    wordSpan.textContent = word;
    wordSpan.style.animationDelay = `${index * delayPerWord}ms`;
    container.appendChild(wordSpan);

    if (index < words.length - 1) {
      container.appendChild(document.createTextNode(' '));
    }
  });

  runnerStep.appendChild(container);

  const totalDuration = words.length * delayPerWord + 800;
  runnerState.intervalId = setTimeout(() => {
    runnerState.intervalId = null;
  }, totalDuration);
}

function renderBreathwork(content) {
  const container = document.createElement('div');
  container.className = 'runner-breathwork';
  container.innerHTML = `
    <div class="breath-circle"></div>
    <p>${content || 'Breathe in... hold... breathe out...'}</p>
  `;
  runnerStep.appendChild(container);
}

function renderTimer(content) {
  const parts = content.split('|');
  const seconds = parseInt(parts[0]) || 60;
  const label = parts[1] || '';
  
  const container = document.createElement('div');
  container.className = 'runner-timer';
  
  const timerDisplay = document.createElement('div');
  timerDisplay.className = 'runner-timer-display';
  timerDisplay.textContent = formatTime(seconds);
  
  const timerLabel = document.createElement('div');
  timerLabel.className = 'runner-timer-label';
  timerLabel.textContent = label;
  
  container.appendChild(timerDisplay);
  if (label) container.appendChild(timerLabel);
  runnerStep.appendChild(container);
  
  let remaining = seconds;
  runnerState.intervalId = setInterval(() => {
    remaining--;
    timerDisplay.textContent = formatTime(remaining);
    if (remaining <= 0) {
      clearInterval(runnerState.intervalId);
      runnerState.intervalId = null;
      timerDisplay.textContent = '✓';
      timerDisplay.style.color = 'var(--success)';
    }
  }, 1000);
}

function renderNote(content) {
  const container = document.createElement('div');
  container.className = 'runner-note';
  container.textContent = content || 'Take a moment...';
  runnerStep.appendChild(container);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function nextStep() {
  const nextIndex = runnerState.currentIndex + 1;
  
  if (nextIndex >= runnerState.routine.steps.length) {
    completeRoutine();
  } else {
    showRunnerStep(nextIndex);
  }
}

function prevStep() {
  const prevIndex = runnerState.currentIndex - 1;
  if (prevIndex >= 0) {
    showRunnerStep(prevIndex);
  }
}

async function completeRoutine() {
  const { ok, data } = await api(`/routines/${runnerState.routine.id}/complete`, { method: 'POST' });
  
  if (ok && !data.already_completed) {
    const currentXP = parseInt(xp.textContent) || 0;
    xp.textContent = currentXP + (data.xp_awarded || 0);
    
    runnerStep.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
        <h2 style="font-size: 36px; font-weight: 800; margin-bottom: 16px; color: var(--text);">Routine Complete!</h2>
        <p style="font-size: 20px; color: var(--text-muted); margin-bottom: 24px;">+${data.xp_awarded} XP earned</p>
      </div>
    `;
    
    setTimeout(() => {
      runnerModal.close();
      loadMe();
    }, 3000);
  } else if (data.already_completed) {
    runnerStep.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 80px; margin-bottom: 20px;">✓</div>
        <h2 style="font-size: 36px; font-weight: 800; margin-bottom: 16px; color: var(--text);">Already Completed</h2>
        <p style="font-size: 20px; color: var(--text-muted);">You've already completed this routine today</p>
      </div>
    `;
    
    setTimeout(() => {
      runnerModal.close();
    }, 2000);
  }
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
  const usernameVal = $('#login-user').value.trim();
  const passcode = $('#login-pass').value.trim();
  
  const { ok, data } = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: usernameVal, passcode })
  });
  
  if (!ok) return showError(data.error || 'Login failed');
  await loadMe();
};

signupForm.onsubmit = async e => {
  e.preventDefault();
  const usernameVal = $('#signup-user').value.trim();
  const passcode = $('#signup-pass').value.trim();
  
  if (!/^\d{4}$/.test(passcode)) return showError('Code must be 4 digits');
  
  const { ok, data } = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username: usernameVal, passcode })
  });
  
  if (!ok) return showError(data.error || 'Signup failed');
  await loadMe();
};

logout.onclick = async () => {
  await api('/auth/logout', { method: 'POST' });
  location.reload();
};

newBtn.onclick = () => openBuilder();
emptyBtn.onclick = () => openBuilder();

builderClose.onclick = () => builderModal.close();
builderCancel.onclick = () => builderModal.close();
builderSave.onclick = saveRoutine;

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('step-type-btn') || e.target.closest('.step-type-btn')) {
    const btn = e.target.classList.contains('step-type-btn') ? e.target : e.target.closest('.step-type-btn');
    addStep(btn.dataset.type);
  }
});

runnerClose.onclick = () => {
  if (runnerState.intervalId) {
    clearInterval(runnerState.intervalId);
  }
  runnerModal.close();
};

runnerPrev.onclick = prevStep;
runnerNext.onclick = nextStep;

runnerModal.addEventListener('close', () => {
  if (runnerState.intervalId) {
    clearInterval(runnerState.intervalId);
    runnerState.intervalId = null;
  }
});

settingsBtn.onclick = () => {
  applyTheme(user?.theme || 'dark');
  settingsModal.showModal();
};

settingsClose.onclick = () => settingsModal.close();
settingsDone.onclick = () => settingsModal.close();

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('theme-option') || e.target.closest('.theme-option')) {
    const btn = e.target.classList.contains('theme-option') ? e.target : e.target.closest('.theme-option');
    const theme = btn.dataset.theme;
    if (theme) {
      setTheme(theme);
      user.theme = theme;
    }
  }
});

addFriendBtn.onclick = () => {
  friendUsername.value = '';
  friendError.hidden = true;
  addFriendModal.showModal();
};

addFriendClose.onclick = () => addFriendModal.close();
addFriendCancel.onclick = () => addFriendModal.close();

addFriendSubmit.onclick = async () => {
  const username = friendUsername.value.trim();
  if (!username) {
    friendError.textContent = 'Please enter a username';
    friendError.hidden = false;
    return;
  }

  const { ok, data } = await api('/friends', {
    method: 'POST',
    body: JSON.stringify({ username })
  });

  if (!ok) {
    friendError.textContent = data.error || 'Failed to add friend';
    friendError.hidden = false;
  } else {
    addFriendModal.close();
    loadFriends();
  }
};

discoverBtn.onclick = openDiscoverModal;
discoverClose.onclick = () => discoverModal.close();
discoverDone.onclick = () => discoverModal.close();

loadMe();
})();