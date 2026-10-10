/**
 * SHARK ADMIN DASHBOARD — AUTHENTICATION & ACCESS CONTROL
 * Manages Supabase Admin Session, login flow, logout, and protected UI state.
 */

window.SHARK = window.SHARK || {};

function initAuth() {
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    const loginForm = document.getElementById('loginForm');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    // Password visibility toggle
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const loginPassword = document.getElementById('loginPassword');
    const togglePasswordIcon = document.getElementById('togglePasswordIcon');

    if (togglePasswordBtn && loginPassword && togglePasswordIcon) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = loginPassword.type === 'password';
            loginPassword.type = isPassword ? 'text' : 'password';
            togglePasswordIcon.className = isPassword ? 'ri-eye-off-line' : 'ri-eye-line';
            togglePasswordBtn.setAttribute('aria-label', isPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('loginEmail');
            let email = emailInput ? emailInput.value.trim() : '';
            if (email && !email.includes('@')) {
                email = email + '@gmail.com';
            }
            const password = document.getElementById('loginPassword')?.value || '';

            showLoading(true);
            if (loginError) loginError.style.display = 'none';

            try {
                const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
                if (error) throw error;

                // Security Shield: Block partner node accounts from main admin panel
                const userEmail = (data.user?.email || '').toLowerCase();
                if (userEmail.includes('@shark-server.com') || userEmail.includes('node1')) {
                    await window.sb.auth.signOut();
                    throw new Error('⛔ هذا الحساب مخصص لخادم فرعي ولا يملك صلاحيات للوصول إلى لوحة التحكم الرئيسية.');
                }

                window.SHARK.state.currentUser = data.user;
                showMainApp();
                showToast('تم تسجيل الدخول بنجاح', 'success');
            } catch (err) {
                if (loginError) {
                    loginError.textContent = err.message || 'اسم المستخدم أو كلمة المرور غير صحيحة، أو لا تملك صلاحيات كمدير.';
                    loginError.style.display = 'block';
                }
                showToast(err.message || 'تعذر تسجيل الدخول، تحقق من البيانات المدخلة', 'error');
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
                const userEmail = (session.user?.email || '').toLowerCase();
                if (userEmail.includes('@shark-server.com') || userEmail.includes('node1')) {
                    await window.sb.auth.signOut();
                    return;
                }
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

    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'flex';

    // Load entire dashboard data
    if (window.SHARK.loadAllData) {
        window.SHARK.loadAllData();
    }
}

window.SHARK.auth = {
    initAuth,
    showMainApp
};
