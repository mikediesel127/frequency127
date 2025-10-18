// utils: JSON helpers, cookies, JWT (legacy-compatible), hashing, auth
function b64url(str) {
  return btoa(str).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function fromB64url(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g,"+").replace(/_/g,"/");
  return atob(b64);
}

export function json(data = {}, init = {}) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  return new Response(JSON.stringify(data), { headers, ...init });
}
export function bad(msg = "Bad Request", code = 400) {
  return json({ error: msg }, { status: code });
}
export async function readJson(req) {
  try { return await req.json(); } catch { return null; }
}
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
export function setCookie(name, value, maxAge = 1209600) {
  return [
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    maxAge ? `Max-Age=${maxAge}` : ""
  ].filter(Boolean).join("; ");
}
export function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

export async function signJWT(payload, secret) {
  // base64url for ALL segments (standard)
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = b64url(JSON.stringify(payload));
  const toSign = `${header}.${body}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const sig = b64url(String.fromCharCode(...new Uint8Array(sigBuf)));
  return `${toSign}.${sig}`;
}
export async function verifyJWT(token, secret) {
  try{
    const [h, b, s] = token.split(".");
    if (!h || !b || !s) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, Uint8Array.from(fromB64url(s), c=>c.charCodeAt(0)), new TextEncoder().encode(`${h}.${b}`));
    if (!ok) return null;
    const payload = JSON.parse(fromB64url(b));
    if (payload.exp && Date.now()/1000 > payload.exp) return null;
    return payload;
  }catch{ return null; }
}

export function sanitizeUsername(name) {
  if (typeof name !== "string") return null;
  return /^[a-zA-Z0-9_.~-]{3,24}$/.test(name) ? name : null;
}
export function sanitizePasscode(p) {
  if (typeof p !== "string") return null;
  return /^\d{4}$/.test(p) ? p : null;
}
export async function hashPass(passcode, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passcode + ":" + salt), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", iterations: 200000, salt: enc.encode(salt) }, keyMaterial, 256);
  return Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
export function uid() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// Auth helper that tolerates legacy token shapes
export function requireAuth(c, env) {
  return {
    async getUser() {
      const cookie = c.request.headers.get("Cookie") || "";
      const match = cookie.match(/(?:^|;\s*)f127=([^;]+)/);
      if (!match) return null;
      const raw = decodeURIComponent(match[1]);
      const payload = await verifyJWT(raw, env.JWT_SECRET);
      if (!payload) return null;

      // legacy payload fallback keys
      const userId = payload.user_id || payload.uid || payload.sub || null;

      if (!userId) return null;
      const user = await env.DB.prepare("SELECT id, username, xp, streak FROM users WHERE id = ?").bind(userId).first();
      return user || null;
    }
  };
}
