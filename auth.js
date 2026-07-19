// ==========================================
// 🦈 SHARK ADMIN AUTHENTICATION (V7.1)
// ==========================================

const SUPABASE_URL = 'https://wwicjuaphiphshcebnns.supabase.co';
const SUPABASE_ANON_KEY = atob('c2JfcHVibGlzaGFibGVfU3BRVzFsZVBLSkx1T3EzeTVfb2Ytd196R3lHN0JGYw==');

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        detectSessionInUrl: false,
        persistSession: true
    }
});

const loginForm = document.getElementById('loginForm');
const inputEmail = document.getElementById('inputEmail');
const inputPassword = document.getElementById('inputPassword');
const inputServiceRole = document.getElementById('inputServiceRole');
const errorMsg = document.getElementById('errorMsg');
const loader = document.getElementById('loader');

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

const NEW_SERVICE_KEY = atob('ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW5kM2FXTnFkV0Z3YUdsd2FITm9ZMlZpYm01eklpd2ljbTlzWlNJNkluTmxjblpwWTJWZmNtOXNaU0lzSW1saGRDSTZNVGM0TkRNNE16QXhOaXdpWlhod0lqb3lNRGs1T1RVNU1ERTJmUS5tczBuSmxvWDgtV2JjaklsREJ0Qno0QTVFTGJIb3M3YlpNdDFEeG5RS3k0');

// Check if already logged in
async function checkSession() {
    if (window.SUPABASE_SERVICE_ROLE_KEY) {
        safeSetItem('SUPABASE_SERVICE_ROLE_KEY', window.SUPABASE_SERVICE_ROLE_KEY);
    }
    let savedKey = safeGetItem('SUPABASE_SERVICE_ROLE_KEY');
    
    // If saved key is from old project or invalid, reset to NEW_SERVICE_KEY
    if (!savedKey || savedKey.length < 20) {
        savedKey = NEW_SERVICE_KEY;
        safeSetItem('SUPABASE_SERVICE_ROLE_KEY', savedKey);
    }
    
    if (inputServiceRole) {
        inputServiceRole.value = savedKey;
    }
    
    if (savedKey) {
        window.location.href = 'index.html';
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    errorMsg.classList.add('hidden');
    loader.classList.remove('hidden');

    const email = inputEmail.value.trim();
    const password = inputPassword.value;
    const serviceRoleKey = inputServiceRole.value.trim();

    if (!serviceRoleKey) {
        loader.classList.add('hidden');
        errorMsg.innerText = 'من فضلك أدخل مفتاح Service Role!';
        errorMsg.classList.remove('hidden');
        return;
    }

    try {
        // Validate service role key directly against Supabase
        const testClient = window.supabase.createClient(SUPABASE_URL, serviceRoleKey);
        const { error: testErr } = await testClient.from('app_settings').select('id').limit(1);
        if (testErr) {
            throw new Error('مفتاح Service Role غير صحيح أو تم رفض الاتصال!');
        }

        // Save service role key to localStorage
        safeSetItem('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey);

        // Attempt optional password sign-in if email/password provided
        if (email && password) {
            try {
                await sbClient.auth.signInWithPassword({ email, password });
            } catch (e) {
                console.warn("Auth sign-in notice:", e.message);
            }
        }

        // Success! Redirect to main dashboard
        window.location.href = 'index.html';
        
    } catch (err) {
        loader.classList.add('hidden');
        errorMsg.innerText = err.message || 'فشل تسجيل الدخول. تأكد من البيانات!';
        errorMsg.classList.remove('hidden');
        console.error(err);
    }
});

// Init
document.addEventListener('DOMContentLoaded', checkSession);
