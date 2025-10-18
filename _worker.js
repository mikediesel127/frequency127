// _worker.js — Frequency127 single-file backend (Pages advanced mode)
// Static assets are proxied via env.ASSETS; API routes handled below.

const COOKIE_NAME = "f127";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";

      // API routes we handle here; everything else goes to ASSETS.
      const isApi =
        path.startsWith("/auth-") ||
        path.startsWith("/me") ||
        path.startsWith("/users-recent") ||
        path.startsWith("/routines") ||
        path.startsWith("/share");

      if (!isApi) {
        // Serve static assets via Pages
        const res = await env.ASSETS.fetch(request);
        // SPA fallback to index.html on 404 for GET/HTML requests
        if (res.status === 404 && request.method === "GET" && acceptsHTML(request)) {
          const root = new URL(request.url);
          root.pathname = "/";
          return env.ASSETS.fetch(new Request(root.toString(), request));
        }
        return res;
      }

      // ---------- API routing ----------
      if (path === "/auth-signup" && request.method === "POST") return signup(request, env);
      if (path === "/auth-login"  && request.method === "POST") return login(request, env);
      if (path === "/auth-logout" && request.method === "POST") return logout();

      if (path === "/me" && request.method === "GET") return me(request, env);

      if (path === "/users-recent" && request.method === "GET") return usersRecent(env);

      if (path === "/routines" && request.method === "GET")  return listRoutines(request, env);
      if (path === "/routines" && request.method === "POST") return createRoutine(request, env);

      const m = path.match(/^\/routines\/([^/]+)(?:\/(complete))?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        const tail = m[2];
        if (!tail) {
          if (request.method === "GET")    return getRoutine(request, env, id);
          if (request.method === "PUT")    return updateRoutine(request, env, id);
          if (request.method === "DELETE") return deleteRoutine(request, env, id);
        } else if (tail === "complete" && request.method === "POST") {
          return completeRoutine(request, env, id);
        }
      }

      if (path === "/share" && request.method === "POST") return ensureShareToken(request, env);

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("UNCAUGHT:", err);
      return json({ error: "Server error", detail: String(err?.message || err) }, 500);
    }
  },
};

/* =========================
   Helpers (JWT / Crypto)
   ========================= */

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlString(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function textToUint8(str) { return new TextEncoder().encode(str); }

async function hmacSign(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return await crypto.subtle.sign("HMAC", key, dataBytes);
}

async function jwtSignHS256(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64urlString(JSON.stringify(header));
  const payloadB64 = b64urlString(JSON.stringify(payload));
  const toSign = `${headerB64}.${payloadB64}`;
  const signature = await hmacSign(textToUint8(secret), textToUint8(toSign));
  const sigB64 = b64url(signature);
  return `${toSign}.${sigB64}`;
}

async function jwtVerifyHS256(token, secret) {
  try {
    const [headerB64, payloadB64, sig] = token.split(".");
    if (!headerB64 || !payloadB64 || !sig) return null;
    const toSign = `${headerB64}.${payloadB64}`;
    const expect = await hmacSign(textToUint8(secret), textToUint8(toSign));
    const expectB64 = b64url(expect);
    if (expectB64 !== sig) return null;
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/* =========================
   Helpers (HTTP / Cookies)
   ========================= */

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function acceptsHTML(request) {
  const a = request.headers.get("Accept") || "";
  return a.includes("text/html");
}

function getCookie(req, name) {
  const raw = req.headers.get("Cookie") || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setAuthCookie(token) {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${COOKIE_MAX_AGE}`,
  ].join("; ");
  return { "set-cookie": attrs };
}

function clearAuthCookie() {
  const attrs = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
  return { "set-cookie": attrs };
}

async function requireUser(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return null;
  const payload = await jwtVerifyHS256(token, env.JWT_SECRET);
  if (!payload?.uid) return null;
  const { results } = await env.DB.prepare(
    "SELECT id, username, xp, streak, share_token FROM users WHERE id = ? LIMIT 1"
  ).bind(payload.uid).all();
  return results[0] || null;
}

function nowSec() { return Math.floor(Date.now() / 1000); }
function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

/* =========================
   Auth
   ========================= */

async function safeJson(request) {
  try { return await request.json(); } catch { return {}; }
}

async function signup(request, env) {
  const { username, passcode } = await safeJson(request);
  if (!username || !passcode || String(passcode).length !== 4) return json({ error: "Bad input" }, 400);

  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE username = ? LIMIT 1").bind(username).first();
  if (exists) return json({ error: "Username taken" }, 409);

  const uid = newId();
  const salt = newId();
  const passhash = await sha256Hex(salt + String(passcode));
  await env.DB.prepare(
    "INSERT INTO users (id, username, email, salt, passhash, created_at, xp, share_token, streak) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, ?)"
  ).bind(uid, username, salt, passhash, nowSec(), 0, 0).run();

  const token = await jwtSignHS256({ uid, iat: nowSec() }, env.JWT_SECRET);
  return json({ ok: true, uid, username }, 200, setAuthCookie(token));
}

async function login(request, env) {
  const { username, passcode } = await safeJson(request);
  if (!username || !passcode) return json({ error: "Bad input" }, 400);

  const row = await env.DB.prepare(
    "SELECT id, salt, passhash, username FROM users WHERE username = ? LIMIT 1"
  ).bind(username).first();

  if (!row) return json({ error: "Invalid credentials" }, 401);
  const calc = await sha256Hex(row.salt + String(passcode));
  if (calc !== row.passhash) return json({ error: "Invalid credentials" }, 401);

  const token = await jwtSignHS256({ uid: row.id, iat: nowSec() }, env.JWT_SECRET);
  return json({ ok: true, uid: row.id, username: row.username }, 200, setAuthCookie(token));
}

async function logout() {
  return json({ ok: true }, 200, clearAuthCookie());
}

async function me(request, env) {
  try {
    const user = await requireUser(request, env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const routines = await env.DB.prepare(
      "SELECT id, name, created_at, steps FROM routines WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(user.id).all();

    return json({
      id: user.id,
      username: user.username,
      xp: user.xp ?? 0,
      streak: user.streak ?? 0,
      share_token: user.share_token ?? null,
      routines: (routines.results || []).map(r => ({
        id: r.id, name: r.name, created_at: r.created_at, steps: safeParseSteps(r.steps)
      })),
    });
  } catch (err) {
    console.error("/me error:", err);
    return json({ error: "Server error", detail: String(err?.message || err) }, 500);
  }
}

async function usersRecent(env) {
  const { results } = await env.DB.prepare(
    "SELECT username FROM users ORDER BY created_at DESC LIMIT 10"
  ).all();
  return json({ users: results.map(r => r.username).filter(Boolean) });
}

/* =========================
   Routines
   ========================= */

function safeParseSteps(t) {
  if (!t) return [];
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function listRoutines(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const res = await env.DB.prepare(
    "SELECT id, name, created_at, steps FROM routines WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(user.id).all();

  return json({ routines: (res.results || []).map(r => ({
    id: r.id, name: r.name, created_at: r.created_at, steps: safeParseSteps(r.steps)
  }))});
}

async function createRoutine(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await safeJson(request);
  const id = newId();
  const name = String(body?.name || "").trim();
  const steps = Array.isArray(body?.steps) ? body.steps : [];
  if (!name) return json({ error: "Name required" }, 400);

  await env.DB.prepare(
    "INSERT INTO routines (id, user_id, name, time, created_at, steps) VALUES (?, ?, ?, NULL, ?, ?)"
  ).bind(id, user.id, name, nowSec(), JSON.stringify(steps)).run();

  return json({ ok: true, id });
}

async function getRoutine(request, env, id) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const row = await env.DB.prepare(
    "SELECT id, name, created_at, steps FROM routines WHERE id = ? AND user_id = ? LIMIT 1"
  ).bind(id, user.id).first();
  if (!row) return json({ error: "Not found" }, 404);

  return json({ id: row.id, name: row.name, created_at: row.created_at, steps: safeParseSteps(row.steps) });
}

async function updateRoutine(request, env, id) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await safeJson(request);
  const name = body?.name != null ? String(body.name).trim() : null;
  const steps = Array.isArray(body?.steps) ? body.steps : null;
  if (name == null && steps == null) return json({ error: "Nothing to update" }, 400);

  const row = await env.DB.prepare(
    "SELECT id FROM routines WHERE id = ? AND user_id = ? LIMIT 1"
  ).bind(id, user.id).first();
  if (!row) return json({ error: "Not found" }, 404);

  if (name != null && steps != null) {
    await env.DB.prepare("UPDATE routines SET name = ?, steps = ? WHERE id = ?")
      .bind(name, JSON.stringify(steps), id).run();
  } else if (name != null) {
    await env.DB.prepare("UPDATE routines SET name = ? WHERE id = ?")
      .bind(name, id).run();
  } else if (steps != null) {
    await env.DB.prepare("UPDATE routines SET steps = ? WHERE id = ?")
      .bind(JSON.stringify(steps), id).run();
  }

  return json({ ok: true });
}

async function deleteRoutine(request, env, id) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  await env.DB.prepare("DELETE FROM routines WHERE id = ? AND user_id = ?")
    .bind(id, user.id).run();
  return json({ ok: true });
}

async function completeRoutine(request, env, id) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const exists = await env.DB.prepare(
    "SELECT id FROM routines WHERE id = ? AND user_id = ? LIMIT 1"
  ).bind(id, user.id).first();
  if (!exists) return json({ error: "Not found" }, 404);

  const xp_awarded = 10;
  await env.DB.prepare(
    "INSERT INTO routine_completions (id, routine_id, user_id, created_at, xp_awarded) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), id, user.id, nowSec(), xp_awarded).run();

  await env.DB.prepare("UPDATE users SET xp = xp + ? WHERE id = ?")
    .bind(xp_awarded, user.id).run();

  return json({ ok: true, xp_awarded });
}

/* =========================
   Sharing
   ========================= */
async function ensureShareToken(request, env) {
  const user = await requireUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401);

  if (!user.share_token) {
    const token = crypto.randomUUID();
    await env.DB.prepare("UPDATE users SET share_token = ? WHERE id = ?")
      .bind(token, user.id).run();
    user.share_token = token;
  }
  return json({ share_token: user.share_token });
}
