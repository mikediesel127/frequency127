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

const userProfileModal = $('#user-profile-modal');
const profileClose = $('#profile-close');
const profileDone = $('#profile-done');
const profileUsername = $('#profile-username');
const profileAvatar = $('#profile-avatar');
const profileXP = $('#profile-xp');
const profileStreak = $('#profile-streak');
const profileCompletions = $('#profile-completions');
const profileRoutinesList = $('#profile-routines-list');
const profileNoRoutines = $('#profile-no-routines');
const profileAchievementsList = $('#profile-achievements-list');
const profileNoAchievements = $('#profile-no-achievements');
const profileAddFriendSection = $('#profile-add-friend-section');
const profileAddFriendBtn = $('#profile-add-friend-btn');

const leaderboardBtn = $('#leaderboard-btn');
const leaderboardModal = $('#leaderboard-modal');
const leaderboardClose = $('#leaderboard-close');
const leaderboardDone = $('#leaderboard-done');

const activityFeed = $('#activity-feed');
const notificationsEnabled = $('#notifications-enabled');
const notificationTimesSection = $('#notification-times-section');
const notificationTimesList = $('#notification-times-list');
const addNotificationTime = $('#add-notification-time');
const achievementsList = $('#achievements-list');

let user = null;
let notificationSettings = { enabled: false, times: [] };
let currentProfileUser = null;
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

const ACHIEVEMENTS = {
  first_routine: { icon: '🎯', name: 'First Steps', desc: 'Complete your first routine' },
  xp_100: { icon: '⭐', name: 'Rising Star', desc: 'Earn 100 XP' },
  xp_500: { icon: '🌟', name: 'Shining Bright', desc: 'Earn 500 XP' },
  xp_1000: { icon: '💫', name: 'Superstar', desc: 'Earn 1000 XP' },
  streak_3: { icon: '🔥', name: '3-Day Streak', desc: 'Maintain a 3-day streak' },
  streak_7: { icon: '🔥🔥', name: 'Week Warrior', desc: 'Maintain a 7-day streak' },
  streak_30: { icon: '🔥🔥🔥', name: 'Month Master', desc: 'Maintain a 30-day streak' },
  completions_10: { icon: '✅', name: 'Getting Started', desc: 'Complete 10 routines' },
  completions_50: { icon: '✅✅', name: 'Dedicated', desc: 'Complete 50 routines' },
  completions_100: { icon: '✅✅✅', name: 'Unstoppable', desc: 'Complete 100 routines' }
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
  loadActivities();
  loadNotificationSettings();
  registerServiceWorker();
}

async function loadRecent() {
  const { data } = await api('/users/recent');
  recent.innerHTML = '';
  (data.users || []).forEach(u => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = u;
    chip.style.cursor = 'pointer';
    chip.title = 'Click to view profile';
    chip.onclick = () => openUserProfile(u);
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
      loadActivities();
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

async function openUserProfile(username) {
  const { ok, data } = await api(`/users/${encodeURIComponent(username)}`);
  if (!ok) {
    alert('Failed to load user profile');
    return;
  }

  currentProfileUser = data;
  profileUsername.textContent = data.username;
  profileAvatar.textContent = data.username.charAt(0).toUpperCase();
  profileXP.textContent = data.xp || 0;
  profileStreak.textContent = data.streak || 0;
  profileCompletions.textContent = data.total_completions || 0;

  // Show/hide add friend button
  if (data.username !== user.username && !data.is_friend) {
    profileAddFriendSection.hidden = false;
  } else {
    profileAddFriendSection.hidden = true;
  }

  // Render routines
  profileRoutinesList.innerHTML = '';
  if (data.public_routines && data.public_routines.length > 0) {
    profileNoRoutines.hidden = true;
    data.public_routines.forEach(r => {
      const card = document.createElement('div');
      card.className = 'routine-card glass';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        <div class="routine-header">
          <h4 class="routine-name">${r.name}</h4>
        </div>
        <div class="routine-meta">
          <span class="step-count">${r.steps.length} steps</span>
        </div>
      `;
      card.onclick = () => {
        copyRoutine(r);
        userProfileModal.close();
      };
      profileRoutinesList.appendChild(card);
    });
  } else {
    profileNoRoutines.hidden = false;
  }

  // Render achievements
  profileAchievementsList.innerHTML = '';
  if (data.achievements && data.achievements.length > 0) {
    profileNoAchievements.hidden = true;
    data.achievements.forEach(a => {
      const achData = ACHIEVEMENTS[a.key];
      if (achData) {
        const badge = document.createElement('div');
        badge.className = 'achievement-badge';
        badge.innerHTML = `
          <div class="achievement-icon">${achData.icon}</div>
          <div class="achievement-name">${achData.name}</div>
        `;
        profileAchievementsList.appendChild(badge);
      }
    });
  } else {
    profileNoAchievements.hidden = false;
  }

  userProfileModal.showModal();
}

async function loadActivities() {
  const { data } = await api('/activities');
  activityFeed.innerHTML = '';

  if (!data.activities || data.activities.length === 0) {
    activityFeed.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 13px; text-align: center;">No recent activity</div>';
    return;
  }

  data.activities.slice(0, 10).forEach(activity => {
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.style.cursor = 'pointer';
    item.onclick = () => openUserProfile(activity.username);

    const timeAgo = formatTimeAgo(activity.created_at);

    if (activity.type === 'routine_completed') {
      item.innerHTML = `
        <div style="font-size: 13px; color: var(--text);"><strong>${activity.username}</strong> completed a routine</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${timeAgo}</div>
      `;
    }

    activityFeed.appendChild(item);
  });
}

function formatTimeAgo(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function openLeaderboard() {
  const { data } = await api('/users/leaderboard');

  const xpList = $('#leaderboard-xp-list');
  const streakList = $('#leaderboard-streak-list');

  xpList.innerHTML = '';
  streakList.innerHTML = '';

  (data.top_xp || []).forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    item.style.cursor = 'pointer';
    item.onclick = () => {
      openUserProfile(u.username);
      leaderboardModal.close();
    };
    item.innerHTML = `
      <div class="leaderboard-rank">${i + 1}</div>
      <div class="leaderboard-username">${u.username}</div>
      <div class="leaderboard-stat">${u.xp} XP</div>
    `;
    xpList.appendChild(item);
  });

  (data.top_streak || []).forEach((u, i) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    item.style.cursor = 'pointer';
    item.onclick = () => {
      openUserProfile(u.username);
      leaderboardModal.close();
    };
    item.innerHTML = `
      <div class="leaderboard-rank">${i + 1}</div>
      <div class="leaderboard-username">${u.username}</div>
      <div class="leaderboard-stat">${u.streak} day streak</div>
    `;
    streakList.appendChild(item);
  });

  leaderboardModal.showModal();
}

async function loadNotificationSettings() {
  const { data } = await api('/settings/notifications');
  notificationSettings = data;

  notificationsEnabled.checked = data.enabled;
  notificationTimesSection.hidden = !data.enabled;

  renderNotificationTimes();
  await loadAchievements();
}

function renderNotificationTimes() {
  notificationTimesList.innerHTML = '';
  notificationSettings.times.forEach((time, index) => {
    const timeItem = document.createElement('div');
    timeItem.style.display = 'flex';
    timeItem.style.alignItems = 'center';
    timeItem.style.gap = '8px';
    timeItem.style.marginBottom = '8px';
    timeItem.innerHTML = `
      <input type="time" value="${time}" class="notification-time-input" data-index="${index}" style="flex: 1; padding: 8px; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 14px;">
      <button class="btn-icon-ghost remove-time-btn" data-index="${index}" style="color: var(--text-muted);">×</button>
    `;
    notificationTimesList.appendChild(timeItem);
  });
}

async function saveNotificationSettings() {
  await api('/settings/notifications', {
    method: 'POST',
    body: JSON.stringify(notificationSettings)
  });
}

async function loadAchievements() {
  const { data } = await api('/achievements');
  achievementsList.innerHTML = '';

  const unlockedKeys = new Set((data.achievements || []).map(a => a.key));

  Object.entries(ACHIEVEMENTS).forEach(([key, achData]) => {
    const unlocked = unlockedKeys.has(key);
    const badge = document.createElement('div');
    badge.className = 'achievement-badge' + (unlocked ? '' : ' locked');
    badge.innerHTML = `
      <div class="achievement-icon">${achData.icon}</div>
      <div class="achievement-name">${achData.name}</div>
      <div class="achievement-desc">${achData.desc}</div>
    `;
    achievementsList.appendChild(badge);
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/assets/sw.js');
    console.log('Service Worker registered');
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('This browser does not support notifications');
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await subscribeToPush();
    return true;
  }

  return false;
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // This is a placeholder - in production you'd use your actual VAPID public key
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('YOUR_PUBLIC_VAPID_KEY_HERE')
    });

    await api('/settings/notifications', {
      method: 'POST',
      body: JSON.stringify({
        ...notificationSettings,
        push_subscription: subscription
      })
    });
  } catch (error) {
    console.error('Push subscription failed:', error);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
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

profileClose.onclick = () => userProfileModal.close();
profileDone.onclick = () => userProfileModal.close();

profileAddFriendBtn.onclick = async () => {
  if (!currentProfileUser) return;

  const { ok, data } = await api('/friends', {
    method: 'POST',
    body: JSON.stringify({ username: currentProfileUser.username })
  });

  if (ok) {
    alert('Friend added!');
    profileAddFriendSection.hidden = true;
    loadFriends();
  } else {
    alert(data.error || 'Failed to add friend');
  }
};

leaderboardBtn.onclick = openLeaderboard;
leaderboardClose.onclick = () => leaderboardModal.close();
leaderboardDone.onclick = () => leaderboardModal.close();

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('leaderboard-tab')) {
    document.querySelectorAll('.leaderboard-tab').forEach(tab => tab.classList.remove('active'));
    e.target.classList.add('active');

    const tab = e.target.dataset.tab;
    $('#leaderboard-xp').hidden = tab !== 'xp';
    $('#leaderboard-streak').hidden = tab !== 'streak';
  }
});

notificationsEnabled.onchange = async (e) => {
  notificationSettings.enabled = e.target.checked;
  notificationTimesSection.hidden = !e.target.checked;

  if (e.target.checked) {
    const granted = await requestNotificationPermission();
    if (!granted) {
      e.target.checked = false;
      notificationSettings.enabled = false;
      notificationTimesSection.hidden = true;
    }
  }

  await saveNotificationSettings();
};

addNotificationTime.onclick = () => {
  notificationSettings.times.push('09:00');
  renderNotificationTimes();
  saveNotificationSettings();
};

document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('remove-time-btn')) {
    const index = parseInt(e.target.dataset.index);
    notificationSettings.times.splice(index, 1);
    renderNotificationTimes();
    await saveNotificationSettings();
  }
});

document.addEventListener('change', async (e) => {
  if (e.target.classList.contains('notification-time-input')) {
    const index = parseInt(e.target.dataset.index);
    notificationSettings.times[index] = e.target.value;
    await saveNotificationSettings();
  }
});

loadMe();
})();