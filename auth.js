// ==========================================================================
// 🦈 SHARK ADMIN AUTH (V8 — service_role removed)
// --------------------------------------------------------------------------
// NOTE: index.html has its OWN inline login and is the primary dashboard. This
// standalone login page is kept only for compatibility. It now uses a REAL
// Supabase Auth session with the PUBLIC publishable key — no service_role.
// (Recommended: delete login.html/auth.js/app.js and use index.html only.)
// ==========================================================================
const sbClient = window.supabase.createClient(
    window.SHARK_SUPABASE_URL,
    window.SHARK_PUBLISHABLE_KEY,
    { auth: { detectSessionInUrl: false, persistSession: true, autoRefreshToken: true } }
);

const loginForm = document.getElementById('loginForm');
const inputEmail = document.getElementById('inputEmail');
const inputPassword = document.getElementById('inputPassword');
const errorMsg = document.getElementById('errorMsg');
const loader = document.getElementById('loader');

async function checkSession() {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) window.location.href = 'index.html';
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.classList.add('hidden');
    loader.classList.remove('hidden');
    try {
        const { error } = await sbClient.auth.signInWithPassword({
            email: inputEmail.value.trim(),
            password: inputPassword.value,
        });
        if (error) throw error;
        window.location.href = 'index.html';
    } catch (err) {
        loader.classList.add('hidden');
        errorMsg.innerText = 'فشل تسجيل الدخول. تأكد من الإيميل والباسورد!';
        errorMsg.classList.remove('hidden');
    }
});

document.addEventListener('DOMContentLoaded', checkSession);
