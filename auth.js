// ==========================================
// 🦈 SHARK ADMIN AUTHENTICATION (V7.1)
// ==========================================

const SUPABASE_URL = 'https://heeessxpeaelsjpvdrgh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ryGLvO2-61uPaP56deCd7A_92IXeM8e';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginForm = document.getElementById('loginForm');
const inputEmail = document.getElementById('inputEmail');
const inputPassword = document.getElementById('inputPassword');
const errorMsg = document.getElementById('errorMsg');
const loader = document.getElementById('loader');

// Check if already logged in
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.href = 'index.html';
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    errorMsg.classList.add('hidden');
    loader.classList.remove('hidden');

    const email = inputEmail.value.trim();
    const password = inputPassword.value;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

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
