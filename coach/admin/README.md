# Coach Admin (web)

Companion UI for [`docs/coach-admin-module-spec.md`](../../../docs/coach-admin-module-spec.md).

| Page | Purpose |
|------|---------|
| `index.html` | Guided Coach Admin: **1 Clients → 2 Schedule → 3 Program** (day/exercise builder, no JSON) |
| `doc.html?token=` | Professional print / Save PDF |
| `accept.html?token=` | Landing for coach→athlete roster invite |

Requires root `config.js` / `KALLPA_CONFIG` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

**Deploy:** sync to `kallpa.co/coach/admin/`.

**App:** Profile → Coach Admin. Program editing opens this web UI (`?client=`).
