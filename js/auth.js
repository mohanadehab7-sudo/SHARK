/**
 * 🦈 SHARK ADMIN DASHBOARD — AUTHENTICATION & ACCESS CONTROL
 * Manages Supabase Admin Session, login flow, logout, and protected UI state.
 */

window.SHARK = window.SHARK || {};

function initAuth() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value.trim();
            const password = document.getElementById('loginPassword').value;

            showLoading(true);
            if (loginError) loginError.style.display = 'none';

            try {
                const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
                if (error) throw error;

                window.SHARK.state.currentUser = data.user;
                showMainApp();
                showToast('✅ تم تسجيل الدخول بنجاح', 'success');
            } catch (err) {
                console.error("Login failed:", err);
                if (loginError) {
                    loginError.textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة، أو لا تملك صلاحيات كمدير.';
                    loginError.style.display = 'block';
                }
                showToast('❌ تعذر تسجيل الدخول', 'error');
            } finally {
                showLoading(false);
            }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            showLoading(true);
            try {
                await window.sb.auth.signOut();
                window.SHARK.state.currentUser = null;
                window.location.reload();
            } catch (err) {
                console.error("Sign out error:", err);
                window.location.reload();
            }
        });
    }

    // Auto-restore session on page load
    window.addEventListener('load', async () => {
        try {
            const { data: { session }, error } = await window.sb.auth.getSession();
            if (session && session.user) {
                window.SHARK.state.currentUser = session.user;
                showMainApp();
            }
        } catch (err) {
            console.warn("No active session restored:", err);
        }
    });
}

function showMainApp() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    const welcomeUser = document.getElementById('welcomeUser');

    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'flex';

    const currentUser = window.SHARK.state.currentUser;
    const name = currentUser?.email?.split('@')[0] || 'المدير';
    if (welcomeUser) welcomeUser.textContent = `مرحباً، ${name}`;

    // Load entire dashboard data
    if (window.SHARK.loadAllData) {
        window.SHARK.loadAllData();
    }
}

window.SHARK.auth = {
    initAuth,
    showMainApp
};
