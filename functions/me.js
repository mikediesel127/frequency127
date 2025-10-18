import { json, requireAuth } from "./_utils.js";

export const onRequestGet = async (c) => {
  const { env } = c;

  try {
    const auth = requireAuth(c, env);
    const user = await auth.getUser();
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1) Routines for this user
    const routinesRes = await env.DB.prepare(
      "SELECT id, name FROM routines WHERE user_id = ? ORDER BY created_at DESC"
    ).bind(user.id).all();

    const routines = (routinesRes?.results || []).map(r => ({ id: r.id, name: r.name, steps: [] }));

    // Early exit if no routines
    if (!routines.length) {
      const recentRes = await env.DB.prepare(
        "SELECT username FROM users ORDER BY created_at DESC LIMIT 12"
      ).all();
      return json({
        user,
        routines: [],
        recent: (recentRes?.results || []).map(r => r.username)
      });
    }

    // 2) Steps — try new schema (with user_id). If it fails, fallback to legacy (without user_id).
    const ids = routines.map(r => r.id);
    const placeholders = ids.map(() => "?").join(",");
    let stepsRows = [];

    try {
      const stepsWithUserId = await env.DB.prepare(
        `SELECT routine_id, type, ord FROM routine_steps WHERE user_id = ? AND routine_id IN (${placeholders}) ORDER BY ord ASC`
      ).bind(user.id, ...ids).all();
      stepsRows = stepsWithUserId?.results || [];
    } catch (e) {
      // Fallback: legacy schema (no user_id column)
      const stepsLegacy = await env.DB.prepare(
        `SELECT routine_id, type, ord FROM routine_steps WHERE routine_id IN (${placeholders}) ORDER BY ord ASC`
      ).bind(...ids).all();
      stepsRows = stepsLegacy?.results || [];
    }

    const byId = new Map(routines.map(r => [r.id, r]));
    for (const s of stepsRows) {
      const rec = byId.get(s.routine_id);
      if (rec) rec.steps.push({ type: s.type });
    }

    // 3) Recent users (safe)
    const recentRes = await env.DB.prepare(
      "SELECT username FROM users ORDER BY created_at DESC LIMIT 12"
    ).all();

    return json({
      user,
      routines: [...byId.values()],
      recent: (recentRes?.results || []).map(r => r.username)
    });

  } catch (err) {
    // Never crash the page: surface as JSON 500 (so the client can show auth screen)
    return json({ error: "Internal error", detail: String(err?.message || err) }, { status: 500 });
  }
};
