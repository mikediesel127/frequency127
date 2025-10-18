import { json, bad, readJson, setCookie, signJWT, sanitizeUsername, sanitizePasscode, hashPass } from "./_utils.js";

export const onRequestPost = async (c) => {
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

  const token = await signJWT({ user_id: row.id, exp: Math.floor(Date.now()/1000) + 60*60*24*14 }, env.JWT_SECRET);
  const headers = { "Set-Cookie": setCookie("f127", encodeURIComponent(token)) };
  return json({ ok: true }, { headers });
};
