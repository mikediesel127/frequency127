var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// _utils.js
function b64url(str) {
  return btoa(str).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(b64url, "b64url");
function fromB64url(s) {
  const pad = "=".repeat((4 - s.length % 4) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64);
}
__name(fromB64url, "fromB64url");
function json(data = {}, init = {}) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  return new Response(JSON.stringify(data), { headers, ...init });
}
__name(json, "json");
function bad(msg = "Bad Request", code = 400) {
  return json({ error: msg }, { status: code });
}
__name(bad, "bad");
async function readJson(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
__name(readJson, "readJson");
function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
__name(dayKey, "dayKey");
function setCookie(name, value, maxAge = 1209600) {
  return [
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    maxAge ? `Max-Age=${maxAge}` : ""
  ].filter(Boolean).join("; ");
}
__name(setCookie, "setCookie");
function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}
__name(clearCookie, "clearCookie");
async function signJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const toSign = `${header}.${body}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const sig = b64url(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${toSign}.${sig}`;
}
__name(signJWT, "signJWT");
async function verifyJWT(token, secret) {
  try {
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, Uint8Array.from(fromB64url(s), (c) => c.charCodeAt(0)), new TextEncoder().encode(`${h}.${b}`));
    if (!ok) return null;
    const payload = JSON.parse(fromB64url(b));
    if (payload.exp && Date.now() / 1e3 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verifyJWT, "verifyJWT");
function sanitizeUsername(name) {
  if (typeof name !== "string") return null;
  return /^[a-zA-Z0-9_.~-]{3,24}$/.test(name) ? name : null;
}
__name(sanitizeUsername, "sanitizeUsername");
function sanitizePasscode(p) {
  if (typeof p !== "string") return null;
  return /^\d{4}$/.test(p) ? p : null;
}
__name(sanitizePasscode, "sanitizePasscode");
async function hashPass(passcode, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passcode + ":" + salt), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 2e5, salt: enc.encode(salt) }, keyMaterial, 256);
  return Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashPass, "hashPass");
function uid() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(uid, "uid");
function requireAuth(c, env) {
  return {
    async getUser() {
      const cookie = c.request.headers.get("Cookie") || "";
      const match2 = cookie.match(/(?:^|;\s*)f127=([^;]+)/);
      if (!match2) return null;
      const raw = decodeURIComponent(match2[1]);
      const payload = await verifyJWT(raw, env.JWT_SECRET);
      if (!payload) return null;
      const userId = payload.user_id || payload.uid || payload.sub || null;
      if (!userId) return null;
      const user = await env.DB.prepare("SELECT id, username, xp, streak FROM users WHERE id = ?").bind(userId).first();
      return user || null;
    }
  };
}
__name(requireAuth, "requireAuth");

// routines/[id]/complete.js
var onRequestPost = /* @__PURE__ */ __name(async (c) => {
  const { env, params } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const r = await env.DB.prepare("SELECT id FROM routines WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
  if (!r) return bad("Not found", 404);
  const dk = dayKey();
  const existing = await env.DB.prepare("SELECT id FROM routine_completions WHERE user_id = ? AND routine_id = ? AND day_key = ?").bind(user.id, params.id, dk).first();
  if (existing) return json({ ok: true, xp: user.xp, already: true });
  const xpGain = 10;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO routine_completions (user_id, routine_id, day_key, created_at) VALUES (?, ?, ?, ?)").bind(user.id, params.id, dk, Date.now()),
    env.DB.prepare("UPDATE users SET xp = xp + ? WHERE id = ?").bind(xpGain, user.id)
  ]);
  return json({ ok: true, xpGain });
}, "onRequestPost");

// routines/[id]/index.js
var onRequestGet = /* @__PURE__ */ __name(async (c) => {
  const { env, params } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const r = await env.DB.prepare("SELECT id, name FROM routines WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
  if (!r) return bad("Not found", 404);
  const steps = await env.DB.prepare("SELECT type, ord FROM routine_steps WHERE routine_id = ? AND user_id = ? ORDER BY ord ASC").bind(params.id, user.id).all();
  return json({ id: r.id, name: r.name, steps: steps.results.map((s) => ({ type: s.type })) });
}, "onRequestGet");
var onRequestPatch = /* @__PURE__ */ __name(async (c) => {
  const { env, params, request } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const r = await env.DB.prepare("SELECT id FROM routines WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
  if (!r) return bad("Not found", 404);
  const body = await readJson(request);
  if (!body) return bad("Invalid payload");
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 48) : null;
  const steps = Array.isArray(body.steps) ? body.steps.slice(0, 24) : null;
  if (name) await env.DB.prepare("UPDATE routines SET name = ? WHERE id = ? AND user_id = ?").bind(name, params.id, user.id).run();
  if (steps) {
    await env.DB.prepare("DELETE FROM routine_steps WHERE routine_id = ? AND user_id = ?").bind(params.id, user.id).run();
    let i = 0;
    for (const s of steps) {
      await env.DB.prepare("INSERT INTO routine_steps (id, user_id, routine_id, type, ord) VALUES (?,?,?,?,?)").bind(crypto.randomUUID?.() ?? Math.random().toString(16).slice(2), user.id, params.id, String(s.type).slice(0, 16), i++).run();
    }
  }
  return json({ ok: true });
}, "onRequestPatch");
var onRequestDelete = /* @__PURE__ */ __name(async (c) => {
  const { env, params } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM routine_steps WHERE routine_id = ? AND user_id = ?").bind(params.id, user.id),
    env.DB.prepare("DELETE FROM routines WHERE id = ? AND user_id = ?").bind(params.id, user.id)
  ]);
  return json({ ok: true });
}, "onRequestDelete");

// auth-login.js
var onRequestPost2 = /* @__PURE__ */ __name(async (c) => {
  const { env, request } = c;
  const body = await readJson(request);
  if (!body) return bad("Invalid JSON");
  const username = sanitizeUsername(body.username);
  const passcode = sanitizePasscode(body.passcode);
  if (!username || !passcode) return bad("Invalid credentials");
  const row = await env.DB.prepare("SELECT id, salt, passhash FROM users WHERE username = ?").bind(username).first();
  if (!row) return bad("Invalid login", 401);
  const calc = await hashPass(passcode, row.salt);
  if (calc !== row.passhash) return bad("Invalid login", 401);
  const token = await signJWT({ user_id: row.id, exp: Math.floor(Date.now() / 1e3) + 60 * 60 * 24 * 14 }, env.JWT_SECRET);
  const headers = { "Set-Cookie": setCookie("f127", encodeURIComponent(token)) };
  return json({ ok: true }, { headers });
}, "onRequestPost");

// auth-logout.js
var onRequestPost3 = /* @__PURE__ */ __name(async (c) => {
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookie("f127") } });
}, "onRequestPost");

// auth-signup.js
var onRequestPost4 = /* @__PURE__ */ __name(async (c) => {
  const { env, request } = c;
  const body = await readJson(request);
  if (!body) return bad("Invalid JSON");
  const username = sanitizeUsername(body.username);
  const passcode = sanitizePasscode(body.passcode);
  if (!username || !passcode) return bad("Invalid credentials");
  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (exists) return bad("Username taken", 409);
  const salt = uid().slice(0, 16);
  const passhash = await hashPass(passcode, salt);
  const id = uid();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, username, salt, passhash, xp, streak) VALUES (?, ?, ?, ?, 0, 0)").bind(id, username, salt, passhash)
  ]);
  const token = await signJWT({ user_id: id, exp: Math.floor(Date.now() / 1e3) + 60 * 60 * 24 * 14 }, env.JWT_SECRET);
  const headers = { "Set-Cookie": setCookie("f127", encodeURIComponent(token)) };
  return json({ ok: true }, { headers });
}, "onRequestPost");

// me.js
var onRequestGet2 = /* @__PURE__ */ __name(async (c) => {
  const { env } = c;
  try {
    const auth = requireAuth(c, env);
    const user = await auth.getUser();
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }
    const routinesRes = await env.DB.prepare(
      "SELECT id, name FROM routines WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(user.id).all();
    const routines = (routinesRes?.results || []).map((r) => ({ id: r.id, name: r.name, steps: [] }));
    if (!routines.length) {
      const recentRes2 = await env.DB.prepare(
        "SELECT username FROM users ORDER BY created_at DESC LIMIT 12"
      ).all();
      return json({
        user,
        routines: [],
        recent: (recentRes2?.results || []).map((r) => r.username)
      });
    }
    const ids = routines.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    let stepsRows = [];
    try {
      const stepsWithUserId = await env.DB.prepare(
        `SELECT routine_id, type, ord FROM routine_steps WHERE user_id = ? AND routine_id IN (${placeholders}) ORDER BY ord ASC`
      ).bind(user.id, ...ids).all();
      stepsRows = stepsWithUserId?.results || [];
    } catch (e) {
      const stepsLegacy = await env.DB.prepare(
        `SELECT routine_id, type, ord FROM routine_steps WHERE routine_id IN (${placeholders}) ORDER BY ord ASC`
      ).bind(...ids).all();
      stepsRows = stepsLegacy?.results || [];
    }
    const byId = new Map(routines.map((r) => [r.id, r]));
    for (const s of stepsRows) {
      const rec = byId.get(s.routine_id);
      if (rec) rec.steps.push({ type: s.type });
    }
    const recentRes = await env.DB.prepare(
      "SELECT username FROM users ORDER BY created_at DESC LIMIT 12"
    ).all();
    return json({
      user,
      routines: [...byId.values()],
      recent: (recentRes?.results || []).map((r) => r.username)
    });
  } catch (err) {
    return json({ error: "Internal error", detail: String(err?.message || err) }, { status: 500 });
  }
}, "onRequestGet");

// routines/index.js
var onRequestGet3 = /* @__PURE__ */ __name(async (c) => {
  const { env } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const routines = await env.DB.prepare("SELECT id, name FROM routines WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
  const stepRows = await env.DB.prepare("SELECT routine_id, type, ord FROM routine_steps WHERE user_id = ? ORDER BY ord ASC").bind(user.id).all();
  const map = /* @__PURE__ */ new Map();
  for (const r of routines.results) map.set(r.id, { id: r.id, name: r.name, steps: [] });
  for (const s of stepRows.results) map.get(s.routine_id)?.steps.push({ type: s.type });
  return json([...map.values()]);
}, "onRequestGet");
var onRequestPost5 = /* @__PURE__ */ __name(async (c) => {
  const { env, request } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const body = await readJson(request);
  if (!body || typeof body.name !== "string" || !Array.isArray(body.steps)) return bad("Invalid payload");
  const name = body.name.trim().slice(0, 48);
  if (!name) return bad("Name required");
  const rid = uid();
  const now = Date.now();
  const batches = [
    env.DB.prepare("INSERT INTO routines (id, user_id, name, created_at) VALUES (?, ?, ?, ?)").bind(rid, user.id, name, now)
  ];
  body.steps.slice(0, 24).forEach((s, i) => {
    if (!s || !s.type) return;
    batches.push(env.DB.prepare("INSERT INTO routine_steps (id, user_id, routine_id, type, ord) VALUES (?, ?, ?, ?, ?)").bind(uid(), user.id, rid, String(s.type).slice(0, 16), i));
  });
  await env.DB.batch(batches);
  return json({ id: rid, name, steps: body.steps });
}, "onRequestPost");

// share.js
var onRequestPost6 = /* @__PURE__ */ __name(async (c) => {
  const { env } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  let tokenRow = await env.DB.prepare("SELECT share_token FROM users WHERE id = ?").bind(user.id).first();
  let share = tokenRow?.share_token;
  if (!share) {
    share = uid();
    await env.DB.prepare("UPDATE users SET share_token = ? WHERE id = ?").bind(share, user.id).run();
  }
  const url = new URL(c.request.url);
  url.pathname = "/";
  url.search = `?u=${share}`;
  return json({ url: url.toString() });
}, "onRequestPost");

// users-recent.js
var onRequestGet4 = /* @__PURE__ */ __name(async (c) => {
  const { env } = c;
  const recent = await env.DB.prepare("SELECT username FROM users ORDER BY created_at DESC LIMIT 20").all();
  return json(recent.results.map((r) => r.username));
}, "onRequestGet");

// ../.wrangler/tmp/pages-98zQpB/functionsRoutes-0.5964157264655656.mjs
var routes = [
  {
    routePath: "/routines/:id/complete",
    mountPath: "/routines/:id",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/routines/:id",
    mountPath: "/routines/:id",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/routines/:id",
    mountPath: "/routines/:id",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/routines/:id",
    mountPath: "/routines/:id",
    method: "PATCH",
    middlewares: [],
    modules: [onRequestPatch]
  },
  {
    routePath: "/auth-login",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/auth-logout",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/auth-signup",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/me",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/routines",
    mountPath: "/routines",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/routines",
    mountPath: "/routines",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/share",
    mountPath: "/",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/users-recent",
    mountPath: "/",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  }
];

// ../../../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-oeOCaW/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-oeOCaW/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.026466035272494692.mjs.map
