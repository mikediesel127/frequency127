import { json, clearCookie } from "./_utils.js";

export const onRequestPost = async (c) => {
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookie("f127") } });
};
