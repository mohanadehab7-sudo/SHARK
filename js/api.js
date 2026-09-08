/**
 * SHARK ADMIN DASHBOARD — API & CLIENT INITIALIZATION
 * Handles Supabase client initialization, secure Edge Function calls,
 * and data escaping helpers.
 */

// Global State Namespace
window.SHARK = window.SHARK || {};
window.SHARK.state = {
    settingsData: null,
    currentUser: null,
    usersData: [],
    codesData: [],
    pendingMsgDeviceId: null,
    renewState: { deviceId: null, days: 30, isLifetime: false, currentSubEnd: null, customExpiryDate: null, customHours: null }
};

// Supabase Client Initialization
const SUPABASE_URL = window.SHARK_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = window.SHARK_PUBLISHABLE_KEY;

if (!window.supabase) {
    console.error("Supabase JS SDK not loaded! Check index.html script tags.");
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
    },
});

window.sb = sb;

/**
 * Escape HTML to prevent XSS attacks.
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Attach to namespace
window.SHARK.api = {
    sb,
    escapeHtml
};
