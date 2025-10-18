import { json, bad, readJson, requireAuth } from "../../_utils.js";

export const onRequestGet = async (c) => {
  const { env, params } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const r = await env.DB.prepare("SELECT id, name FROM routines WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
  if (!r) return bad("Not found", 404);
  const steps = await env.DB.prepare("SELECT type, ord FROM routine_steps WHERE routine_id = ? AND user_id = ? ORDER BY ord ASC").bind(params.id, user.id).all();
  return json({ id: r.id, name: r.name, steps: steps.results.map(s=>({ type: s.type })) });
};

export const onRequestPatch = async (c) => {
  const { env, params, request } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const r = await env.DB.prepare("SELECT id FROM routines WHERE id = ? AND user_id = ?").bind(params.id, user.id).first();
  if (!r) return bad("Not found", 404);

  const body = await readJson(request);
  if (!body) return bad("Invalid payload");
  const name = typeof body.name === "string" ? body.name.trim().slice(0,48) : null;
  const steps = Array.isArray(body.steps) ? body.steps.slice(0,24) : null;

  if (name) await env.DB.prepare("UPDATE routines SET name = ? WHERE id = ? AND user_id = ?").bind(name, params.id, user.id).run();
  if (steps) {
    await env.DB.prepare("DELETE FROM routine_steps WHERE routine_id = ? AND user_id = ?").bind(params.id, user.id).run();
    let i = 0;
    for (const s of steps) {
      await env.DB.prepare("INSERT INTO routine_steps (id, user_id, routine_id, type, ord) VALUES (?,?,?,?,?)")
        .bind(crypto.randomUUID?.() ?? Math.random().toString(16).slice(2), user.id, params.id, String(s.type).slice(0,16), i++).run();
    }
  }
  return json({ ok: true });
};

export const onRequestDelete = async (c) => {
  const { env, params } = c;
  const auth = requireAuth(c, env);
  const user = await auth.getUser();
  if (!user) return new Response("Unauthorized",  { status: 401 });

  await env.DB.batch([
    env.DB.prepare("DELETE FROM routine_steps WHERE routine_id = ? AND user_id = ?").bind(params.id, user.id),
    env.DB.prepare("DELETE FROM routines WHERE id = ? AND user_id = ?").bind(params.id, user.id)
  ]);
  return json({ ok: true });
};
