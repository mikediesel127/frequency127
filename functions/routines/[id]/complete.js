import { json, bad, requireAuth, dayKey } from "../../_utils.js";

export const onRequestPost = async (c) => {
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
};
