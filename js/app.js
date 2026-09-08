/**
 * SHARK ADMIN DASHBOARD — MAIN APPLICATION BOOTSTRAP
 * Coordinates module initialization, lifecycle hooks, and global event bindings.
 */

window.SHARK = window.SHARK || {};

async function loadAllData() {
    showLoading(true);
    try {
        await window.SHARK.settings?.loadSettings();
        await window.SHARK.dashboard?.loadDashboardData();
        await window.SHARK.codes?.loadCodesData();
        await window.SHARK.users?.loadUsersData();
    } catch (err) {
        console.error("Pipeline load failed:", err);
        showToast('حدث خطأ أثناء مزامنة البيانات', 'error');
    } finally {
        showLoading(false);
    }
}

// Global Refresh Button
document.getElementById('refreshAllBtn')?.addEventListener('click', async () => {
    await loadAllData();
    showToast('تم تحديث جميع البيانات بنجاح', 'success');
});

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize UI presentation layer
    window.SHARK.ui?.initTabs();
    window.SHARK.ui?.initAccessibility();

    // 2. Initialize Modals & Forms
    window.SHARK.renew?.initRenewModal();
    window.SHARK.codes?.initCodeGenerator();
    window.SHARK.settings?.initSettings();

    // 3. Initialize Authentication
    window.SHARK.auth?.initAuth();
});

// Expose globals
window.loadAllData = loadAllData;
window.SHARK.loadAllData = loadAllData;
