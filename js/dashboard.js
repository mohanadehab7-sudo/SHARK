/**
 * SHARK ADMIN DASHBOARD — DASHBOARD & OVERVIEW
 * Handles top-level KPI metrics, real-time system status banner, and quick action alert cards.
 */

window.SHARK = window.SHARK || {};

async function loadDashboardData() {
    try {
        const { data: devices, error: devErr } = await window.sb.from('devices').select('*');
        if (devErr) throw devErr;

        const { data: licenses, error: licErr } = await window.sb.from('licenses').select('status, device_id');
        if (licErr) throw licErr;

        const { data: settings, error: setErr } = await window.sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
        if (setErr) throw setErr;

        window.SHARK.state.settingsData = settings || null;

        const now = new Date();
        const total = devices?.length || 0;
        const active = devices?.filter(d => d.last_seen && (now - new Date(d.last_seen)) < 86400000).length || 0;
        const banned = devices?.filter(d => d.status === 'banned').length || 0;
        const avail = licenses?.filter(l => l.status === 'active' && !l.device_id).length || 0;

        const totalEl = document.getElementById('totalUsers');
        const activeEl = document.getElementById('activeUsers');
        const blockedEl = document.getElementById('blockedUsers');
        const codesEl = document.getElementById('availableCodes');

        if (totalEl) totalEl.textContent = total;
        if (activeEl) activeEl.textContent = active;
        if (blockedEl) blockedEl.textContent = banned;
        if (codesEl) codesEl.textContent = avail;

        // Tiny Header Status Pill
        const statusText = document.getElementById('headerStatusText');
        const statusPill = document.getElementById('headerStatusPill');
        const pulse = statusPill?.querySelector('.online-pulse');

        const isShutdown = settings?.is_shutdown || settings?.bot_mode === 'shutdown';
        if (statusText) {
            statusText.textContent = isShutdown ? 'متوقف' : 'متصل';
        }
        if (pulse) {
            if (isShutdown) {
                pulse.style.background = 'var(--color-status-danger)';
                pulse.style.boxShadow = '0 0 6px rgba(239, 68, 68, 0.6)';
            } else {
                pulse.style.background = 'var(--color-primary)';
                pulse.style.boxShadow = '0 0 6px rgba(59, 130, 246, 0.6)';
            }
        }
    } catch (err) {
        console.error("Dashboard metrics load error:", err);
        showToast('خطأ في تحميل بيانات الرئيسية', 'error');
    }
}

function filterFromStat(type) {
    if (type === 'codes') {
        const codesTabBtn = document.getElementById('tab-codes');
        if (codesTabBtn) codesTabBtn.click();
        return;
    }
    // Switch to users tab if not active
    const usersTabBtn = document.getElementById('tab-users');
    if (usersTabBtn) usersTabBtn.click();

    const userFilter = document.getElementById('userFilter');
    if (userFilter) {
        userFilter.value = type;
        if (typeof applyUserFilter === 'function') {
            applyUserFilter();
        }
    }
}
window.filterFromStat = filterFromStat;

window.SHARK.dashboard = {
    loadDashboardData,
    filterFromStat
};
