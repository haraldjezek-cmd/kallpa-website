# Coach invite web builder (Phase 2)

Static page for coaches who open an athlete invite link.

## Local preview

1. Copy `config.example.js` → `config.js` and set `SUPABASE_ANON_KEY` (publishable/anon — never service role).
2. Enable flag for testing:
   ```sql
   UPDATE feature_flags SET enabled = true WHERE key = 'coach_invite';
   ```
3. Create an invite (see Phase 1 smoke: `coach-invite-create` with athlete JWT).
4. Open:
   ```
   web/coach/invite/index.html?token=<TOKEN>
   ```
   (or serve the `web/` folder and use `/coach/invite/<token>`).

5. Deploy edges if not already: `coach-invite-submit`, `coach-invite-exercises` (plus create/validate from Phase 1).

6. When done testing: `UPDATE feature_flags SET enabled = false WHERE key = 'coach_invite';`

## Production

Host under `https://kallpa.co/coach/invite/` (copy `web/coach/` into **kallpa-website**, then push `main`).

**Invite URL shape (static GitHub Pages):**  
`https://kallpa.co/coach/invite/?token=<TOKEN>`  
(not `/coach/invite/<TOKEN>` — that path 404s on Pages)

Sync example:

```powershell
New-Item -ItemType Directory -Force -Path C:\kallpa-website\coach\invite | Out-Null
Copy-Item -Recurse -Force C:\repWise\web\coach\invite\* C:\kallpa-website\coach\invite\
cd C:\kallpa-website
git add coach/invite
git commit -m "Add coach invite web builder"
git push origin main
```

Then redeploy/wait for Pages; open `https://kallpa.co/coach/invite/?token=...`
