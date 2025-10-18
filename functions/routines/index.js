import { json, bad, readJson, requireAuth, uid } from "../_utils.js";

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

  return json([...map.values()]);
};

export const onRequestPost = async (c) => {
  const { env, request } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await readJson(request);
  if (!body || typeof body.name !== "string" || !Array.isArray(body.steps)) return bad("Invalid payload");
  const name = body.name.trim().slice(0,48);
  if (!name) return bad("Name required");

  const rid = uid();
  const now = Date.now();
  const batches = [
    env.DB.prepare("INSERT INTO routines (id, user_id, name, created_at) VALUES (?, ?, ?, ?)").bind(rid, user.id, name, now)
  ];
  body.steps.slice(0,24).forEach((s, i) => {
    if (!s || !s.type) return;
    batches.push(env.DB.prepare("INSERT INTO routine_steps (id, user_id, routine_id, type, ord) VALUES (?, ?, ?, ?, ?)")
      .bind(uid(), user.id, rid, String(s.type).slice(0,16), i));
  });
  await env.DB.batch(batches);

  return json({ id: rid, name, steps: body.steps });
};
