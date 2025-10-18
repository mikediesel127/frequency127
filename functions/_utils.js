export function json(data = {}, init = {}) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };
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
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), da = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
}
export function setCookie(name, value, maxAge = 1209600) {
  const base = [
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Secure`,
    maxAge ? `Max-Age=${maxAge}` : ""
  ].filter(Boolean).join("; ");
  return base;
}
export function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}
export async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const toSign = `${header}.${body}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
  return `${toSign}.${sig}`;
}
export async function verifyJWT(token, secret) {
  try{
    const enc = new TextEncoder();
    const [headerB64, bodyB64, sigB64] = token.split(".");
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", key, sig, enc.encode(`${headerB64}.${bodyB64}`));
    if (!ok) return null;
    const payload = JSON.parse(atob(bodyB64));
    if (payload.exp && Date.now()/1000 > payload.exp) return null;
    return payload;
  }catch{ return null; }
}
export function requireAuth(c, env) {
  return {
    async getUser() {
      const cookie = c.request.headers.get("Cookie") || "";
      const match = cookie.match(/(?:^|;\s*)f127=([^;]+)/);
      if (!match) return null;
      const payload = await verifyJWT(decodeURIComponent(match[1]), env.JWT_SECRET);
      if (!payload) return null;
      const { user_id } = payload;
      const user = await env.DB.prepare("SELECT id, username, xp, streak FROM users WHERE id = ?").bind(user_id).first();
      return user || null;
    }
  };
}
export function sanitizeUsername(name) {
  if (typeof name !== "string") return null;
  if (!/^[a-zA-Z0-9_.~-]{3,24}$/.test(name)) return null;
  return name;
}
export function sanitizePasscode(p) {
  if (typeof p !== "string") return null;
  if (!/^\d{4}$/.test(p)) return null;
  return p;
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
