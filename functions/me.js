import { json, requireAuth } from "./_utils.js";

export const onRequestGet = async (c) => {
  const { env } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  // routines + steps
  const routinesRes = await env.DB.prepare(
    "SELECT id, name FROM routines WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(user.id).all();

  const stepsRes = await env.DB.prepare(
    "SELECT routine_id, type, ord FROM routine_steps WHERE user_id = ? ORDER BY ord ASC"
  ).bind(user.id).all();

  const byId = new Map();
  for (const r of routinesRes.results) byId.set(r.id, { id: r.id, name: r.name, steps: [] });
  for (const s of stepsRes.results) byId.get(s.routine_id)?.steps.push({ type: s.type });

  // recent users for unlocks
  const recentRes = await env.DB.prepare(
    "SELECT username FROM users ORDER BY created_at DESC LIMIT 12"
  ).all();

  return json({
    user,
    routines: [...byId.values()],
    recent: recentRes.results.map(r=>r.username)
  });
};
