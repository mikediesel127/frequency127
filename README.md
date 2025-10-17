# frequency127 — v3

Minimal routines app for Cloudflare Pages + Functions + D1.

- Accounts: username + 4‑digit passcode.
- Routines composed of steps: Box Breathing, Affirmations, White‑Light.
- Smooth SVG box‑breathing (4s each side) with center counter.
- XP: +10 per routine per day (first completion).

## Deploy

1. Create a **D1 database** in Cloudflare and bind it to the Pages project as `DB`.
2. In the D1 Console, run the SQL in `schema.sql`.
3. Add a Pages variable/secret **`JWT_SECRET`** (random string).
4. Ensure **Functions directory** is `functions` (Pages Settings → Builds).

No build step. Root serves `index.html`, assets in `/assets`.
