# Coach Admin (web)

Companion UI for [`docs/coach-admin-module-spec.md`](../../../docs/coach-admin-module-spec.md).

| Page | Purpose |
|------|---------|
| `index.html` | Coach sign-in, roster, schedule, save program + print link |
| `doc.html?token=` | Professional print / Save PDF for offline (or dual) delivery |
| `accept.html?token=` | Landing for coach→athlete roster invite |

Requires `config.js` / `KALLPA_CONFIG` with `SUPABASE_URL` and `SUPABASE_ANON_KEY` (same as invite builder).

**Deploy:** sync to `kallpa.co/coach/admin/` (mirror invite deploy path).

**App:** Profile → Coach Admin (coach role + flags). Edges: `coach-admin-accept-invite`, `coach-admin-push-program`, `coach-admin-doc`.
