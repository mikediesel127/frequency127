// functions/auth-signup.js
export async function onRequest(context) {
  const { env, request } = context;

  try {
    if (request.method !== 'POST') {
      return json(405, { ok:false, error:'Method not allowed' });
    }

    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return json(400, { ok:false, error:'Content-Type must be application/json' });
    }

    const { username, passcode } = await request.json();

    // Basic validation – matches your UI (4-digit passcode)
    if (!username || typeof username !== 'string' || !username.trim()) {
      return json(400, { ok:false, error:'Username required' });
    }
    if (!/^\d{4}$/.test(String(passcode || ''))) {
      return json(400, { ok:false, error:'Passcode must be 4 digits' });
    }

    // Ensure DB binding exists
    if (!env.DB) {
      return json(500, { ok:false, error:'DB binding missing. Bind D1 as `DB` in Pages → Settings → Functions → Bindings (Production).' });
    }

    // Enforce unique username
    const exists = await env.DB
      .prepare('SELECT 1 FROM users WHERE username = ?')
      .bind(username)
      .first();
    if (exists) {
      return json(409, { ok:false, error:'Username already taken' });
    }

    // Derive passhash = SHA-256(salt + passcode)
    const id = crypto.randomUUID();
    const salt = crypto.randomUUID().replace(/-/g, '');
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(salt + String(passcode)));
    const passhash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');

    // Insert user (schema: id, username, salt, passhash, xp DEFAULT 0, created_at)
    await env.DB.prepare(
      'INSERT INTO users (id, username, salt, passhash, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, username, salt, passhash, Date.now()).run();

    // Issue a signed session (JWT) cookie
    if (!env.JWT_SECRET) {
      return json(500, { ok:false, error:'JWT_SECRET missing in Pages → Settings → Variables (Production).' });
    }
    const tokenPayload = { uid: id, u: username, iat: Date.now() };
    const token = await signJWT(tokenPayload, env.JWT_SECRET);

    return new Response(JSON.stringify({ ok:true, id, username }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie('f127', token, { httpOnly:true, sameSite:'Lax', path:'/', maxAge:60*60*24*14 })
      }
    });

  } catch (err) {
    console.error('auth-signup error:', err);
    return json(500, { ok:false, error: String(err?.message || err) });
  }
}

/* ---------- tiny utilities (local to this file) ---------- */

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

function cookie(name, value, { httpOnly=false, sameSite='Lax', path='/', maxAge } = {}) {
  const parts = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (typeof maxAge === 'number') parts.push(`Max-Age=${Math.floor(maxAge)}`);
  return parts.join('; ');
}

// Minimal JWT (HS256) using Web Crypto
async function signJWT(payload, secret) {
  const enc = new TextEncoder();
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${body}`));
  const sig = base64url(sigBuf);
  return `${header}.${body}.${sig}`;
}

function base64url(data) {
  let str = (data instanceof ArrayBuffer)
    ? String.fromCharCode(...new Uint8Array(data))
    : btoa(String.fromCharCode(...new TextEncoder().encode(data)));
  // If input was ArrayBuffer we already built str as binary; else it's base64 now.
  if (!(data instanceof ArrayBuffer)) return str.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  // For ArrayBuffer path:
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
