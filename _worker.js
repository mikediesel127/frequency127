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

    if (route === "/friends" && m === "GET") return listFriends(req, env);
    if (route === "/friends" && m === "POST") return addFriend(req, env);

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
  
  return json({ ok: true, xp_awarded: xp });
}