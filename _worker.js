const COOKIE = "f127";
const MAX_AGE = 1209600;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    
    if (path.startsWith("/api/")) {
      return api(req, env, path.slice(4));
    }
    
    const res = await env.ASSETS.fetch(req);
    if (res.status === 404 && req.method === "GET") {
      return env.ASSETS.fetch(new Request(new URL("/", req.url), req));
    }
    return res;
  }
};

async function api(req, env, route) {
  try {
    const m = req.method;

    if (route === "/auth/signup" && m === "POST") return signup(req, env);
    if (route === "/auth/login" && m === "POST") return login(req, env);
    if (route === "/auth/logout" && m === "POST") return logout();
    if (route === "/auth/me" && m === "GET") return me(req, env);
    if (route === "/auth/theme" && m === "POST") return updateTheme(req, env);
    if (route === "/users/recent" && m === "GET") return recent(env);
    if (route === "/users/leaderboard" && m === "GET") return leaderboard(env);

    const um = route.match(/^\/users\/([^\/]+)$/);
    if (um && m === "GET") {
      const username = decodeURIComponent(um[1]);
      return getUserProfile(req, env, username);
    }

    if (route === "/friends" && m === "GET") return listFriends(req, env);
    if (route === "/friends" && m === "POST") return addFriend(req, env);

    if (route === "/activities" && m === "GET") return getActivities(req, env);
    if (route === "/achievements" && m === "GET") return getAchievements(req, env);

    if (route === "/settings/notifications" && m === "GET") return getNotificationSettings(req, env);
    if (route === "/settings/notifications" && m === "POST") return updateNotificationSettings(req, env);

    if (route === "/streaks" && m === "GET") return getFriendStreaks(req, env);
    if (route === "/streaks" && m === "POST") return createFriendStreak(req, env);

    const sm = route.match(/^\/streaks\/([^\/]+)$/);
    if (sm && m === "DELETE") {
      const id = decodeURIComponent(sm[1]);
      return deleteFriendStreak(req, env, id);
    }

    const fm = route.match(/^\/friends\/([^\/]+)$/);
    if (fm && m === "DELETE") {
      const id = decodeURIComponent(fm[1]);
      return removeFriend(req, env, id);
    }

    if (route === "/routines" && m === "GET") return listRoutines(req, env);
    if (route === "/routines" && m === "POST") return createRoutine(req, env);
    if (route === "/routines/public" && m === "GET") return listPublicRoutines(env);

    const rm = route.match(/^\/routines\/([^\/]+)(\/complete)?$/);
    if (rm) {
      const id = decodeURIComponent(rm[1]);
      if (!rm[2]) {
        if (m === "GET") return getRoutine(req, env, id);
        if (m === "PUT") return updateRoutine(req, env, id);
        if (m === "DELETE") return deleteRoutine(req, env, id);
      } else if (m === "POST") {
        return complete(req, env, id);
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "Server error" }, 500);
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function setCookie(token) {
  return { "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}` };
}

function clearCookie() {
  return { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` };
}

function getCookie(req) {
  const raw = req.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function hash(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signJWT(payload, secret) {
  const h = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "");
  const b = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const data = `${h}.${b}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const s = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "");
  return `${data}.${s}`;
}

async function verifyJWT(token, secret) {
  try {
    const [h, b, s] = token.split(".");
    const data = `${h}.${b}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBuf = Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sigBuf, new TextEncoder().encode(data));
    if (!ok) return null;
    return JSON.parse(atob(b));
  } catch {
    return null;
  }
}

async function auth(req, env) {
  const token = getCookie(req);
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload?.uid) return null;
  return await env.DB.prepare("SELECT id, username, xp, streak, theme FROM users WHERE id = ?").bind(payload.uid).first();
}

function uid() {
  return crypto.randomUUID();
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function dayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function readJSON(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function parseSteps(str) {
  try {
    const v = JSON.parse(str || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function signup(req, env) {
  const { username, passcode } = await readJSON(req);
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return json({ error: "Username: 3-20 alphanumeric" }, 400);
  }
  if (!passcode || !/^\d{4}$/.test(passcode)) {
    return json({ error: "Passcode: 4 digits" }, 400);
  }
  
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(username).first();
  if (exists) return json({ error: "Username taken" }, 409);
  
  const id = uid();
  const salt = uid();
  const passhash = await hash(salt + passcode);
  
  await env.DB.prepare(
    "INSERT INTO users (id, username, salt, passhash, xp, streak, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)"
  ).bind(id, username, salt, passhash, now()).run();
  
  const token = await signJWT({ uid: id }, env.JWT_SECRET);
  return json({ ok: true }, 200, setCookie(token));
}

async function login(req, env) {
  const { username, passcode } = await readJSON(req);
  if (!username || !passcode) return json({ error: "Missing credentials" }, 400);
  
  const user = await env.DB.prepare("SELECT id, salt, passhash FROM users WHERE username = ?").bind(username).first();
  if (!user) return json({ error: "Invalid credentials" }, 401);
  
  const calc = await hash(user.salt + passcode);
  if (calc !== user.passhash) return json({ error: "Invalid credentials" }, 401);
  
  const token = await signJWT({ uid: user.id }, env.JWT_SECRET);
  return json({ ok: true }, 200, setCookie(token));
}

async function logout() {
  return json({ ok: true }, 200, clearCookie());
}

async function me(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const routines = await env.DB.prepare(
    "SELECT id, name, steps, is_public, created_at FROM routines WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(user.id).all();

  const today = dayKey();
  const completions = await env.DB.prepare(
    "SELECT routine_id FROM routine_completions WHERE user_id = ? AND day_key = ?"
  ).bind(user.id, today).all();

  const completedIds = new Set(completions.results.map(c => c.routine_id));

  return json({
    id: user.id,
    username: user.username,
    xp: user.xp || 0,
    streak: user.streak || 0,
    theme: user.theme || 'dark',
    routines: routines.results.map(r => ({
      id: r.id,
      name: r.name,
      steps: parseSteps(r.steps),
      is_public: r.is_public || 0,
      created_at: r.created_at,
      completed_today: completedIds.has(r.id)
    }))
  });
}

async function recent(env) {
  const res = await env.DB.prepare("SELECT username FROM users ORDER BY created_at DESC LIMIT 10").all();
  return json({ users: res.results.map(r => r.username) });
}

async function updateTheme(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { theme } = await readJSON(req);
  const validThemes = ['dark', 'light', 'ocean', 'sunset', 'forest', 'purple'];
  if (!validThemes.includes(theme)) {
    return json({ error: "Invalid theme" }, 400);
  }

  await env.DB.prepare("UPDATE users SET theme = ? WHERE id = ?").bind(theme, user.id).run();
  return json({ ok: true, theme });
}

async function listFriends(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const res = await env.DB.prepare(`
    SELECT f.id, u.id as user_id, u.username
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ?
    ORDER BY u.username ASC
  `).bind(user.id).all();

  return json({
    friends: res.results.map(r => ({
      id: r.id,
      user_id: r.user_id,
      username: r.username
    }))
  });
}

async function addFriend(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { username } = await readJSON(req);
  if (!username) return json({ error: "Username required" }, 400);

  const friend = await env.DB.prepare("SELECT id, username FROM users WHERE username = ?").bind(username).first();
  if (!friend) return json({ error: "User not found" }, 404);
  if (friend.id === user.id) return json({ error: "Cannot add yourself as friend" }, 400);

  const existing = await env.DB.prepare(
    "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?"
  ).bind(user.id, friend.id).first();

  if (existing) return json({ error: "Already friends" }, 409);

  const id = uid();
  await env.DB.prepare(
    "INSERT INTO friends (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)"
  ).bind(id, user.id, friend.id, now()).run();

  return json({ ok: true, friend: { id, username: friend.username } });
}

async function removeFriend(req, env, friendshipId) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  await env.DB.prepare("DELETE FROM friends WHERE id = ? AND user_id = ?").bind(friendshipId, user.id).run();
  return json({ ok: true });
}

async function listPublicRoutines(env) {
  const res = await env.DB.prepare(`
    SELECT r.id, r.name, r.steps, r.created_at, u.username
    FROM routines r
    JOIN users u ON r.user_id = u.id
    WHERE r.is_public = 1
    ORDER BY r.created_at DESC
    LIMIT 50
  `).all();

  return json({
    routines: res.results.map(r => ({
      id: r.id,
      name: r.name,
      steps: parseSteps(r.steps),
      username: r.username,
      created_at: r.created_at
    }))
  });
}

async function listRoutines(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);
  
  const res = await env.DB.prepare(
    "SELECT id, name, steps, created_at FROM routines WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(user.id).all();
  
  const today = dayKey();
  const completions = await env.DB.prepare(
    "SELECT routine_id FROM routine_completions WHERE user_id = ? AND day_key = ?"
  ).bind(user.id, today).all();
  
  const completedIds = new Set(completions.results.map(c => c.routine_id));
  
  return json({
    routines: res.results.map(r => ({
      id: r.id,
      name: r.name,
      steps: parseSteps(r.steps),
      created_at: r.created_at,
      completed_today: completedIds.has(r.id)
    }))
  });
}

async function createRoutine(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { name, steps, is_public } = await readJSON(req);
  if (!name || !name.trim()) return json({ error: "Name required" }, 400);

  const id = uid();
  await env.DB.prepare(
    "INSERT INTO routines (id, user_id, name, steps, is_public, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(id, user.id, name.trim(), JSON.stringify(steps || []), is_public || 0, now()).run();

  return json({ ok: true, id });
}

async function getRoutine(req, env, id) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);
  
  const r = await env.DB.prepare(
    "SELECT id, name, steps, created_at FROM routines WHERE id = ? AND user_id = ?"
  ).bind(id, user.id).first();
  
  if (!r) return json({ error: "Not found" }, 404);
  
  const today = dayKey();
  const completion = await env.DB.prepare(
    "SELECT 1 FROM routine_completions WHERE routine_id = ? AND user_id = ? AND day_key = ?"
  ).bind(id, user.id, today).first();
  
  return json({ 
    id: r.id, 
    name: r.name, 
    steps: parseSteps(r.steps), 
    created_at: r.created_at,
    completed_today: !!completion
  });
}

async function updateRoutine(req, env, id) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { name, steps, is_public } = await readJSON(req);
  const r = await env.DB.prepare("SELECT id FROM routines WHERE id = ? AND user_id = ?").bind(id, user.id).first();
  if (!r) return json({ error: "Not found" }, 404);

  const updates = [];
  const bindings = [];

  if (name) {
    updates.push("name = ?");
    bindings.push(name.trim());
  }
  if (steps !== undefined) {
    updates.push("steps = ?");
    bindings.push(JSON.stringify(steps));
  }
  if (is_public !== undefined) {
    updates.push("is_public = ?");
    bindings.push(is_public);
  }

  if (updates.length > 0) {
    bindings.push(id);
    await env.DB.prepare(`UPDATE routines SET ${updates.join(", ")} WHERE id = ?`).bind(...bindings).run();
  }

  return json({ ok: true });
}

async function deleteRoutine(req, env, id) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);
  
  await env.DB.prepare("DELETE FROM routines WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  return json({ ok: true });
}

async function complete(req, env, id) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const r = await env.DB.prepare("SELECT id FROM routines WHERE id = ? AND user_id = ?").bind(id, user.id).first();
  if (!r) return json({ error: "Not found" }, 404);

  const today = dayKey();
  const exists = await env.DB.prepare(
    "SELECT 1 FROM routine_completions WHERE routine_id = ? AND user_id = ? AND day_key = ?"
  ).bind(id, user.id, today).first();

  if (exists) return json({ ok: true, xp_awarded: 0, already_completed: true });

  const xp = 25;
  await env.DB.prepare(
    "INSERT INTO routine_completions (id, routine_id, user_id, day_key, created_at, xp_awarded) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(uid(), id, user.id, today, now(), xp).run();

  await env.DB.prepare("UPDATE users SET xp = xp + ? WHERE id = ?").bind(xp, user.id).run();

  // Log activity
  await env.DB.prepare(
    "INSERT INTO user_activities (id, user_id, activity_type, activity_data, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(uid(), user.id, "routine_completed", JSON.stringify({ routine_id: id }), now()).run();

  // Check and unlock achievements
  await checkAchievements(env, user.id);

  return json({ ok: true, xp_awarded: xp });
}

async function getUserProfile(req, env, username) {
  const requestingUser = await auth(req, env);

  const targetUser = await env.DB.prepare(
    "SELECT id, username, xp, streak, created_at FROM users WHERE username = ?"
  ).bind(username).first();

  if (!targetUser) return json({ error: "User not found" }, 404);

  const routines = await env.DB.prepare(
    "SELECT id, name, steps, created_at FROM routines WHERE user_id = ? AND is_public = 1 ORDER BY created_at DESC LIMIT 10"
  ).bind(targetUser.id).all();

  const completionCount = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM routine_completions WHERE user_id = ?"
  ).bind(targetUser.id).first();

  const achievements = await env.DB.prepare(
    "SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC LIMIT 5"
  ).bind(targetUser.id).all();

  let isFriend = false;
  if (requestingUser) {
    const friendship = await env.DB.prepare(
      "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?"
    ).bind(requestingUser.id, targetUser.id).first();
    isFriend = !!friendship;
  }

  return json({
    id: targetUser.id,
    username: targetUser.username,
    xp: targetUser.xp || 0,
    streak: targetUser.streak || 0,
    created_at: targetUser.created_at,
    total_completions: completionCount.count || 0,
    public_routines: routines.results.map(r => ({
      id: r.id,
      name: r.name,
      steps: parseSteps(r.steps),
      created_at: r.created_at
    })),
    achievements: achievements.results.map(a => ({
      key: a.achievement_key,
      unlocked_at: a.unlocked_at
    })),
    is_friend: isFriend
  });
}

async function leaderboard(env) {
  const topXP = await env.DB.prepare(
    "SELECT username, xp, streak FROM users ORDER BY xp DESC LIMIT 20"
  ).all();

  const topStreak = await env.DB.prepare(
    "SELECT username, xp, streak FROM users ORDER BY streak DESC LIMIT 20"
  ).all();

  return json({
    top_xp: topXP.results,
    top_streak: topStreak.results
  });
}

async function getActivities(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  // Get activities from friends
  const friendIds = await env.DB.prepare(
    "SELECT friend_id FROM friends WHERE user_id = ?"
  ).bind(user.id).all();

  if (!friendIds.results.length) {
    return json({ activities: [] });
  }

  const ids = friendIds.results.map(f => f.friend_id);
  const placeholders = ids.map(() => "?").join(",");

  const activities = await env.DB.prepare(`
    SELECT a.id, a.user_id, a.activity_type, a.activity_data, a.created_at, u.username
    FROM user_activities a
    JOIN users u ON a.user_id = u.id
    WHERE a.user_id IN (${placeholders})
    ORDER BY a.created_at DESC
    LIMIT 50
  `).bind(...ids).all();

  return json({
    activities: activities.results.map(a => ({
      id: a.id,
      user_id: a.user_id,
      username: a.username,
      type: a.activity_type,
      data: JSON.parse(a.activity_data || "{}"),
      created_at: a.created_at
    }))
  });
}

async function getAchievements(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const achievements = await env.DB.prepare(
    "SELECT achievement_key, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC"
  ).bind(user.id).all();

  return json({
    achievements: achievements.results.map(a => ({
      key: a.achievement_key,
      unlocked_at: a.unlocked_at
    }))
  });
}

async function checkAchievements(env, userId) {
  const user = await env.DB.prepare("SELECT xp, streak FROM users WHERE id = ?").bind(userId).first();
  if (!user) return;

  const completions = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM routine_completions WHERE user_id = ?"
  ).bind(userId).first();

  const achievementsToUnlock = [];

  // XP milestones
  if (user.xp >= 100) achievementsToUnlock.push("xp_100");
  if (user.xp >= 500) achievementsToUnlock.push("xp_500");
  if (user.xp >= 1000) achievementsToUnlock.push("xp_1000");

  // Streak milestones
  if (user.streak >= 3) achievementsToUnlock.push("streak_3");
  if (user.streak >= 7) achievementsToUnlock.push("streak_7");
  if (user.streak >= 30) achievementsToUnlock.push("streak_30");

  // Completion milestones
  if (completions.count >= 10) achievementsToUnlock.push("completions_10");
  if (completions.count >= 50) achievementsToUnlock.push("completions_50");
  if (completions.count >= 100) achievementsToUnlock.push("completions_100");

  // First completion
  if (completions.count === 1) achievementsToUnlock.push("first_routine");

  // Insert achievements if not already unlocked
  for (const key of achievementsToUnlock) {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO achievements (id, user_id, achievement_key, unlocked_at) VALUES (?, ?, ?, ?)"
    ).bind(uid(), userId, key, now()).run();
  }
}

async function getNotificationSettings(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let settings = await env.DB.prepare(
    "SELECT notification_enabled, notification_times, push_subscription FROM user_settings WHERE user_id = ?"
  ).bind(user.id).first();

  if (!settings) {
    // Create default settings
    await env.DB.prepare(
      "INSERT INTO user_settings (user_id, notification_enabled, notification_times) VALUES (?, 0, ?)"
    ).bind(user.id, "[]").run();

    settings = {
      notification_enabled: 0,
      notification_times: "[]",
      push_subscription: null
    };
  }

  return json({
    enabled: settings.notification_enabled === 1,
    times: JSON.parse(settings.notification_times || "[]"),
    has_subscription: !!settings.push_subscription
  });
}

async function updateNotificationSettings(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { enabled, times, push_subscription } = await readJSON(req);

  // Ensure settings row exists
  await env.DB.prepare(
    "INSERT OR IGNORE INTO user_settings (user_id, notification_enabled, notification_times) VALUES (?, 0, ?)"
  ).bind(user.id, "[]").run();

  const updates = [];
  const bindings = [];

  if (enabled !== undefined) {
    updates.push("notification_enabled = ?");
    bindings.push(enabled ? 1 : 0);
  }
  if (times !== undefined) {
    updates.push("notification_times = ?");
    bindings.push(JSON.stringify(times));
  }
  if (push_subscription !== undefined) {
    updates.push("push_subscription = ?");
    bindings.push(push_subscription ? JSON.stringify(push_subscription) : null);
  }

  if (updates.length > 0) {
    bindings.push(user.id);
    await env.DB.prepare(`UPDATE user_settings SET ${updates.join(", ")} WHERE user_id = ?`).bind(...bindings).run();
  }

  return json({ ok: true });
}

async function getFriendStreaks(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const streaks = await env.DB.prepare(`
    SELECT fs.id, fs.friend_id, fs.routine_id, fs.current_streak, fs.best_streak,
           fs.shared_notification_times, fs.notify_on_completion,
           u.username, r.name as routine_name
    FROM friend_streaks fs
    JOIN users u ON fs.friend_id = u.id
    JOIN routines r ON fs.routine_id = r.id
    WHERE fs.user_id = ?
    ORDER BY fs.current_streak DESC
  `).bind(user.id).all();

  return json({
    streaks: streaks.results.map(s => ({
      id: s.id,
      friend_id: s.friend_id,
      friend_username: s.username,
      routine_id: s.routine_id,
      routine_name: s.routine_name,
      current_streak: s.current_streak,
      best_streak: s.best_streak,
      notification_times: JSON.parse(s.shared_notification_times || "[]"),
      notify_on_completion: s.notify_on_completion === 1
    }))
  });
}

async function createFriendStreak(req, env) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { friend_id, routine_id, notification_times, notify_on_completion } = await readJSON(req);

  if (!friend_id || !routine_id) {
    return json({ error: "friend_id and routine_id required" }, 400);
  }

  // Verify friendship
  const friendship = await env.DB.prepare(
    "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?"
  ).bind(user.id, friend_id).first();

  if (!friendship) {
    return json({ error: "Not friends with this user" }, 400);
  }

  // Check if streak already exists
  const existing = await env.DB.prepare(
    "SELECT id FROM friend_streaks WHERE user_id = ? AND friend_id = ? AND routine_id = ?"
  ).bind(user.id, friend_id, routine_id).first();

  if (existing) {
    return json({ error: "Streak already exists" }, 409);
  }

  const id = uid();
  await env.DB.prepare(`
    INSERT INTO friend_streaks
    (id, user_id, friend_id, routine_id, current_streak, best_streak, shared_notification_times, notify_on_completion, created_at)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?)
  `).bind(
    id,
    user.id,
    friend_id,
    routine_id,
    JSON.stringify(notification_times || []),
    notify_on_completion ? 1 : 0,
    now()
  ).run();

  return json({ ok: true, id });
}

async function deleteFriendStreak(req, env, streakId) {
  const user = await auth(req, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  await env.DB.prepare(
    "DELETE FROM friend_streaks WHERE id = ? AND user_id = ?"
  ).bind(streakId, user.id).run();

  return json({ ok: true });
}