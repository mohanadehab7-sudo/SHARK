// ==========================================================================
// 🦈 SHARK ADMIN DASHBOARD — LEGACY APP.JS (V8 — DISABLED)
// ==========================================================================
// SECURITY V8: This file is INTENTIONALLY EMPTY.
//
// In V7, this file initialized a Supabase client using the service_role key
// pulled from localStorage — a critical vulnerability that gave any browser
// user full, unrestricted access to every database table, bypassing all RLS.
//
// All dashboard functionality now lives in:
//   * script.js  — UI + data loading (uses the PUBLIC publishable key only)
//   * config.js  — stores the safe public config
//   * index.html — the single entry point (has its own inline login screen)
//
// login.html still loads this file for backward compatibility, but it does
// nothing. The login flow in index.html uses sb.auth.signInWithPassword()
// with the publishable key — the session is validated server-side by RLS
// policies that check public.is_admin().
//
// DO NOT re-add any Supabase client initialization here.
// DO NOT store or read service_role keys in the browser. EVER.
// ==========================================================================
