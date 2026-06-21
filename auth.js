// ==========================================
// 🦈 SHARK ADMIN AUTHENTICATION (V7.1)
// ==========================================

const SUPABASE_URL = 'https://heeessxpeaelsjpvdrgh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ryGLvO2-61uPaP56deCd7A_92IXeM8e';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginForm = document.getElementById('loginForm');
const inputEmail = document.getElementById('inputEmail');
const inputPassword = document.getElementById('inputPassword');
const inputServiceRole = document.getElementById('inputServiceRole');
const errorMsg = document.getElementById('errorMsg');
const loader = document.getElementById('loader');

// Check if already logged in
async function checkSession() {
    // Prefill service role key if saved
    if (localStorage.getItem('SUPABASE_SERVICE_ROLE_KEY')) {
        inputServiceRole.value = localStorage.getItem('SUPABASE_SERVICE_ROLE_KEY');
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (session && localStorage.getItem('SUPABASE_SERVICE_ROLE_KEY')) {
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
        localStorage.setItem('SUPABASE_SERVICE_ROLE_KEY', serviceRoleKey);

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
