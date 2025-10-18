import { json, bad, readJson, setCookie, signJWT, sanitizeUsername, sanitizePasscode, hashPass, uid } from "./_utils.js";

export const onRequestPost = async (c) => {
  const { env, request } = c;
  const body = await readJson(request);
  if (!body) return bad("Invalid JSON");
  const username = sanitizeUsername(body.username);
  const passcode = sanitizePasscode(body.passcode);
  if (!username || !passcode) return bad("Invalid credentials");

  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (exists) return bad("Username taken", 409);

  const salt = uid().slice(0,16);
  const passhash = await hashPass(passcode, salt);
  const id = uid();

  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, username, salt, passhash, xp, streak) VALUES (?, ?, ?, ?, 0, 0)").bind(id, username, salt, passhash)
  ]);

  const token = await signJWT({ user_id: id, exp: Math.floor(Date.now()/1000) + 60*60*24*14 }, env.JWT_SECRET);
  const headers = { "Set-Cookie": setCookie("f127", encodeURIComponent(token)) };
  return json({ ok: true }, { headers });
};
