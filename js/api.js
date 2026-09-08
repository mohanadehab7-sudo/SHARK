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
    renewState: { deviceId: null, days: 30, isLifetime: false, currentSubEnd: null, customExpiryDate: null, customHours: null },
    generatorState: { type: 'preset', days: 30, expiryDate: null, customHours: null, isTrial: false }
};

// Safe Local Storage Handlers
function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn("localStorage access denied:", e);
        return null;
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn("localStorage access denied:", e);
    }
}

function safeRemoveItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn("localStorage access denied:", e);
    }
}

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
 * Calls privileged Edge Functions on Supabase with the current session token.
 */
async function adminCall(action, args = {}) {
    const { data, error } = await sb.functions.invoke('admin', {
        body: { action, ...args },
    });
    if (error) throw error;
    if (data && data.ok === false) throw new Error(data.message || 'admin action failed');
    return data;
}

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
    adminCall,
    safeGetItem,
    safeSetItem,
    safeRemoveItem,
    escapeHtml
};
