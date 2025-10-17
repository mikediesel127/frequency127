import { json, parseBody, authUser, q1, qall, uid } from "../../_utils";

export async function onRequest(context) {
  const { request, params, env } = context;
  const user = await authUser(context);
  if (!user) return json(401, { ok: false, error: "Not logged in" });

  const id = params.id;

  if (request.method === "GET") {
    // Owner or shared-with user can read
    const routine =
      await q1(env,
        `SELECT r.*
           FROM routines r
          WHERE r.id = ?
            AND (r.user_id = ? OR EXISTS (
                   SELECT 1 FROM shares s
                    WHERE s.routine_id = r.id AND s.target_user_id = ?
                ))`,
        id, user.id, user.id
      );
    return json(200, { ok: true, routine });
  }

  if (request.method === "PUT") {
    // Only owner can update
    const body = await parseBody(request);
    const name = (body.name || "").trim();
    const config = JSON.stringify(body.config || { steps: [] });

    await env.DB.prepare(
      `UPDATE routines SET name = ?, config = ? WHERE id = ? AND user_id = ?`
    ).bind(name, config, id, user.id).run();

    return json(200, { ok: true });
  }

  if (request.method === "DELETE") {
    // Only owner can delete
    await env.DB.prepare(
      `DELETE FROM routines WHERE id = ? AND user_id = ?`
    ).bind(id, user.id).run();

    return json(200, { ok: true });
  }

  return json(405, { ok: false, error: "Method not allowed" });
}