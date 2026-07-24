// Copy to config.js for local preview (config.js is gitignored).
// Production: GitHub Actions writes config.js from repository secrets — see web/README.md
window.KALLPA_CONFIG = {
  SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  // Set false when closed beta is full to hide the beta CTA (notify still works).
  // Key name kept for live config.js compat.
  ALPHA_SIGNUPS_OPEN: true,
};
