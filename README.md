# Kallpa landing page (`web/`)

Static marketing site (EN + ES). **Not** the Flutter web build — deploy only this folder.

## What’s in the site

- `index.html` / `es.html` — Tailwind via CDN, two-step waitlist (notify / beta)
- Screenshots: `Homescreen.jpeg`, `LoggingSet.jpeg`, `WorkoutHistory.jpeg`, `PRs.jpeg` (+ `_ES` variants in `es.html` if used)
- Waitlist → Supabase `waitlist` table via anon REST API

## Go-live checklist

### Phase A — Database (once)

**Recommended (waitlist only, no other migrations):**

1. Supabase Dashboard → **SQL Editor** → New query
2. Paste full contents of [`web/supabase-waitlist-migration.sql`](supabase-waitlist-migration.sql) (same as `supabase/migrations/144_waitlist_landing.sql`)
3. **Run** — safe to re-run (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`)

**Alternative:** `supabase db push` applies **every** pending migration in `supabase/migrations/`, not just `144`. Use only when you want a full schema sync.

**Verify:**

```sql
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'waitlist';
SELECT policyname, cmd, roles FROM pg_policies WHERE tablename = 'waitlist';
```

Expect: columns `email`, `locale`, `signup_type`, …; policies for `anon` INSERT and `service_role` SELECT only.
3. Admin queries:
   ```sql
   SELECT signup_type, COUNT(*) FROM waitlist GROUP BY signup_type;
   SELECT * FROM waitlist WHERE signup_type = 'beta' ORDER BY created_at DESC LIMIT 50;
   ```

### Phase B — GitHub Pages deploy

1. Repo **Settings → Secrets and variables → Actions** → add:
   - `LANDING_SUPABASE_URL` — e.g. `https://xxxxx.supabase.co` (no trailing slash)
   - `LANDING_SUPABASE_ANON_KEY` — project **anon** key (public; RLS limits damage)
2. **Settings → Pages** → Source: **GitHub Actions**
3. Push to `main` with changes under `web/` (or run workflow **Deploy landing** manually).
4. Staging URL (before custom domain): `https://haraldjezek-cmd.github.io/repwise/`
5. Test waitlist: submit notify + beta; check Dashboard → Table Editor → `waitlist`.

**Local preview**

```bash
cd web
cp config.example.js config.js   # edit with real URL + anon key
python -m http.server 8080
# http://localhost:8080/index.html
```

### Phase C — `kallpa.co` (domain owned ✅)

**Repo:** `haraldjezek-cmd/repwise` · **Pages CNAME target:** `haraldjezek-cmd.github.io` · **`web/CNAME`:** `kallpa.co`

1. **GitHub** → repo **Settings → Pages**
   - Custom domain: `kallpa.co`
   - Wait for DNS check → enable **Enforce HTTPS**
   - (Optional) add `www.kallpa.co` as alternate in Pages UI if you want both
2. **Cloudflare** → DNS for `kallpa.co` (nameservers on Cloudflare per S113 plan):

   | Type | Name | Target | Proxy |
   |------|------|--------|-------|
   | CNAME | `@` | `haraldjezek-cmd.github.io` | **DNS only** (grey cloud) — simplest GitHub Pages SSL |
   | CNAME | `www` | `haraldjezek-cmd.github.io` | **DNS only** |

   Cloudflare apex CNAME flattening handles `@` → `github.io`. If DNS check fails, use GitHub’s [apex A records](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain) instead of CNAME `@`.

   **Redirect (recommended):** Cloudflare **Rules → Redirect rules** — `www.kallpa.co/*` → `https://kallpa.co/$1` (301). Site copy and `og:url` use apex (`https://kallpa.co`, `https://kallpa.co/es`).

3. **Verify:** `https://kallpa.co`, `https://kallpa.co/es.html`, waitlist submit, valid HTTPS (no cert warnings).
4. **Cloudflare Email Routing** (footer already links `hello@kallpa.co`):
   - Enable Email Routing → create address `hello@kallpa.co` → forward to your inbox
   - Add the MX + TXT records Cloudflare prompts for (if not already present)

### Phase D — Separate repo (alternative to monorepo workflow)

If you prefer `kallpa-website` as its own repo:

1. Copy **contents** of `web/` (not the `web` folder itself) to repo root.
2. Enable Pages from `main` / root.
3. Inject `config.js` at deploy time (same secrets) or commit `config.js` only in that private repo.

## CI workflow

`.github/workflows/deploy-landing.yml` deploys **`web/`** on push to `main` when `web/**` changes.

It generates `config.js` from secrets — **do not commit** real keys to git.

## Security notes

- Anon key in the browser is normal for this pattern; RLS must allow only `INSERT` on `waitlist`.
- Do not use the **service role** key on the landing page.
- Rate limiting: consider Supabase rate limits + Cloudflare bot fight if spam becomes an issue.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Waitlist disabled / “not configured” | Missing `config.js` locally, or GitHub secrets not set |
| 401 / 403 on submit | Wrong anon key or RLS policy missing |
| 409 | Email already registered (expected) |
| CORS error | Rare on Supabase REST; confirm URL matches project |
| Images 404 on Pages | Paths are relative; ensure deploy artifact is `web/` root |
| GitHub “Domain’s DNS record could not be retrieved” | CNAME `@` → `haraldjezek-cmd.github.io`, grey-cloud / DNS only; wait up to 24h |
| HTTPS cert pending on GitHub Pages | DNS must resolve first; disable Cloudflare proxy on `@` and `www` |
| `hello@kallpa.co` bounces | Cloudflare Email Routing not enabled or MX records missing |
