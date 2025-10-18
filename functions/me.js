import { json, requireAuth } from "./_utils.js";

export const onRequestGet = async (c) => {
  const { env } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const routines = await env.DB.prepare("SELECT id, name FROM routines WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
  const stepRows = await env.DB.prepare("SELECT routine_id, type, ord FROM routine_steps WHERE user_id = ? ORDER BY ord ASC").bind(user.id).all();

  const map = new Map();
  for (const r of routines.results) map.set(r.id, { id: r.id, name: r.name, steps: [] });
  for (const s of stepRows.results) map.get(s.routine_id)?.steps.push({ type: s.type });

  const recent = await env.DB.prepare("SELECT username FROM users ORDER BY created_at DESC LIMIT 12").all();

  return json({ user, routines: [...map.values()], recent: recent.results.map(r=>r.username) });
};
