# Coach Admin (web)

Companion UI for [`docs/coach-admin-module-spec.md`](../../../docs/coach-admin-module-spec.md).

| Page | Purpose |
|------|---------|
| `index.html` | Guided Coach Admin: **1 Client → 2 Program → 3 Schedule**; Program = client strip + **horizontal day board** (app-style); skeleton days from profile `days_per_week`; catalog autocomplete; hard schedule gate |
| `doc.html?token=` | Professional print / Save PDF |
| `accept.html?token=` | Landing for coach→athlete roster invite |

Requires root `config.js` / `KALLPA_CONFIG` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

**Deploy:** sync to `kallpa.co/coach/admin/` (and `C:\kallpa-website\coach\admin\`).

**App:** Profile → Coach Admin. Program editing opens this web UI (`?client=`).

**Edges:** `coach-admin-lookup-client`, `coach-admin-accept-invite`, `coach-admin-push-program`, `coach-admin-doc`.
