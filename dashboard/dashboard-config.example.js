// Kallpa Dashboard Configuration
// Copy this file to dashboard-config.js and fill in your Supabase credentials.
// DO NOT commit dashboard-config.js to version control.
//
// IMPORTANT: For Google Sign-In to work, add your dashboard URL to Supabase:
//   Authentication → URL Configuration → Redirect URLs:
//   - http://localhost:8080/dashboard/  (local dev)
//   - https://kallpa.co/dashboard/      (production)

window.DASHBOARD_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY_HERE',
};
