// ==========================================
// 🦈 SHARK ADMIN AUTHENTICATION (V7.1)
// ==========================================

const SUPABASE_URL = 'https://heeessxpeaelsjpvdrgh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ryGLvO2-61uPaP56deCd7A_92IXeM8e';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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

// Check if already logged in
async function checkSession() {
    // Save to localStorage if defined globally in config.js
    if (window.SUPABASE_SERVICE_ROLE_KEY) {
        safeSetItem('SUPABASE_SERVICE_ROLE_KEY', window.SUPABASE_SERVICE_ROLE_KEY);
    }
    // Prefill service role key if saved
    const savedKey = safeGetItem('SUPABASE_SERVICE_ROLE_KEY');
    if (savedKey) {
        inputServiceRole.value = savedKey;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session && savedKey) {
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
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // Save service role key to localStorage
        safeSetItem('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey);

        // Success! Redirect to dashboard
        window.location.href = 'index.html';
        
    } catch (err) {
        loader.classList.add('hidden');
        errorMsg.innerText = 'فشل تسجيل الدخول. تأكد من الإيميل والباسورد!';
        errorMsg.classList.remove('hidden');
        console.error(err);
    }
});

// Init
document.addEventListener('DOMContentLoaded', checkSession);
