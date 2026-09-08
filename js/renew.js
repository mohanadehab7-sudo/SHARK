/**
 * SHARK ADMIN DASHBOARD — SUBSCRIPTION RENEWAL & LICENSING ASSIGNMENT
 * Handles single/batch subscription extensions, custom duration overrides, and license disassociation.
 */

window.SHARK = window.SHARK || {};

function openRenewModal(deviceId) {
    const codesData = window.SHARK.state.codesData || [];
    const usersData = window.SHARK.state.usersData || [];

    const lic  = codesData.find(c => c.device_id === deviceId);
    const user = usersData.find(u => u.device_id === deviceId);

    window.SHARK.state.renewState = {
        deviceId,
        days: 30,
        isLifetime: false,
        currentSubEnd: lic?.expires_at || null,
        customExpiryDate: null,
        customHours: null
    };

    const nameEl = document.getElementById('renewUserName');
    const safeName = escapeHtml(user?.device_name);
    const safeId = escapeHtml(deviceId);
    const phoneName = safeName || `هاتف (${safeId.substring(0, 8)})`;

    if (nameEl) {
        if (lic?.expires_at) {
            const diff = new Date(lic.expires_at) - new Date();
            const daysLeft = Math.ceil(diff / 86400000);
            nameEl.innerHTML = `<i class="ri-smartphone-line"></i> <b style="color:var(--color-primary)">${phoneName}</b> &nbsp;|&nbsp;
                ينتهي: <b style="color:${diff < 0 ? 'var(--color-status-danger)' : 'var(--color-text-primary)'}">${formatDate(lic.expires_at)}</b>
                <span style="color:var(--color-text-muted);font-size:11px;">${diff > 0 ? `(${daysLeft} يوم متبقي)` : '(منتهي)'}</span>`;
        } else if (lic && !lic.expires_at) {
            nameEl.innerHTML = `<i class="ri-smartphone-line"></i> <b style="color:var(--color-primary)">${phoneName}</b> &nbsp;|&nbsp; <span style="color:#60a5fa;"><i class="ri-infinity-line"></i> مدى الحياة حالياً</span>`;
        } else {
            nameEl.innerHTML = `<i class="ri-smartphone-line"></i> <b style="color:var(--color-primary)">${phoneName}</b> &nbsp;|&nbsp; <span style="color:var(--color-text-muted);">لا يوجد اشتراك</span>`;
        }
    }

    // Reset controls
    document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.renew-preset-btn[data-days="30"]')?.classList.add('active');

    const cv = document.getElementById('renewCustomValue');
    const pk = document.getElementById('renewCustomDatePicker');
    if (cv) cv.value = '';
    if (pk) pk.value = '';

    updateRenewInfo();
    const modal = document.getElementById('renewModal');
    if (modal) modal.style.display = 'flex';
}

function closeRenewModal() {
    const modal = document.getElementById('renewModal');
    if (modal) modal.style.display = 'none';
}

function initRenewModal() {
    // Preset buttons
    document.querySelectorAll('.renew-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const d = parseInt(btn.dataset.days);
            const renewState = window.SHARK.state.renewState;
            renewState.isLifetime       = (d === 0);
            renewState.days             = d;
            renewState.customExpiryDate = null;
            renewState.customHours      = null;

            const cv = document.getElementById('renewCustomValue');
            const pk = document.getElementById('renewCustomDatePicker');
            if (cv) cv.value = '';
            if (pk) pk.value = '';
            updateRenewInfo();
        });
    });

    // Custom numeric inputs
    document.getElementById('renewCustomValue')?.addEventListener('input', onRenewCustomChange);
    document.getElementById('renewCustomUnit')?.addEventListener('change', onRenewCustomChange);

    // Custom date picker
    document.getElementById('renewCustomDatePicker')?.addEventListener('change', () => {
        const val = document.getElementById('renewCustomDatePicker').value;
        if (!val) return;
        document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
        const cv = document.getElementById('renewCustomValue');
        if (cv) cv.value = '';

        const renewState = window.SHARK.state.renewState;
        renewState.isLifetime       = false;
        renewState.days             = null;
        renewState.customHours      = null;
        renewState.customExpiryDate = val;
        updateRenewInfo();
    });
}

function onRenewCustomChange() {
    const valInput = document.getElementById('renewCustomValue');
    const val = parseInt(valInput?.value);
    if (!val || val < 1) return;
    const unit = document.getElementById('renewCustomUnit')?.value || 'days';
    document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));

    const pk = document.getElementById('renewCustomDatePicker');
    if (pk) pk.value = '';

    const renewState = window.SHARK.state.renewState;
    renewState.isLifetime       = false;
    renewState.customExpiryDate = null;

    if (unit === 'hours') {
        renewState.days = val / 24;
        renewState.customHours = val;
    } else if (unit === 'months') {
        renewState.days = val * 30;
        renewState.customHours = null;
    } else {
        renewState.days = val;
        renewState.customHours = null;
    }
    updateRenewInfo();
}

function updateRenewInfo() {
    const el = document.getElementById('renewInfoText');
    if (!el) return;

    const renewState = window.SHARK.state.renewState;

    if (renewState.isLifetime) {
        el.innerHTML = '<i class="ri-infinity-line"></i> سيكون اشتراكه <b>مدى الحياة</b> — لن ينتهي أبداً';
        return;
    }
    if (renewState.customExpiryDate) {
        const d = new Date(renewState.customExpiryDate);
        el.innerHTML = `<i class="ri-calendar-line"></i> سينتهي في: <b style="color:var(--color-primary)">${d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</b> (تاريخ محدد يدوياً)`;
        return;
    }
    if (!renewState.days) {
        el.textContent = 'اختر مدة أو حدد تاريخاً';
        return;
    }

    const now = new Date();
    const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now
        ? new Date(renewState.currentSubEnd) 
        : now;
    const end = new Date(base.getTime() + renewState.days * 86400000);
    const isExtend = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now;
    el.innerHTML = `${isExtend ? 'تمديد — ' : 'يبدأ من الآن — '}سينتهي في: <b style="color:var(--color-primary)">${end.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}</b>`;
}

async function confirmRenew() {
    const renewState = window.SHARK.state.renewState;
    if (!renewState.deviceId) return;
    if (!renewState.isLifetime && !renewState.customExpiryDate && !renewState.days) {
        showToast('يرجى اختيار مدة التجديد أولاً', 'error');
        return;
    }

    showLoading(true);
    try {
        let newEnd;
        if (renewState.isLifetime) {
            newEnd = null;
        } else if (renewState.customExpiryDate) {
            newEnd = new Date(renewState.customExpiryDate + 'T23:59:59').toISOString();
        } else if (renewState.customHours) {
            const now = new Date();
            const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now
                ? new Date(renewState.currentSubEnd) 
                : now;
            newEnd = new Date(base.getTime() + renewState.customHours * 3600000).toISOString();
        } else {
            const now = new Date();
            const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now
                ? new Date(renewState.currentSubEnd) 
                : now;
            newEnd = new Date(base.getTime() + renewState.days * 86400000).toISOString();
        }

        const codesData = window.SHARK.state.codesData || [];
        const lic = codesData.find(c => c.device_id === renewState.deviceId);

        if (lic) {
            await window.sb.from('licenses')
                .update({ expires_at: newEnd, status: 'active' })
                .eq('device_id', renewState.deviceId);
        } else {
            const key = window.rndNum ? window.rndNum(12) : Math.random().toString(36).substring(2, 14).toUpperCase();
            await window.sb.from('licenses').insert([{
                license_key: key,
                device_id: renewState.deviceId,
                expires_at: newEnd,
                status: 'active',
                duration_days: renewState.isLifetime ? 36500 : (renewState.days || 30)
            }]);
        }

        showToast('تم تجديد الاشتراك بنجاح', 'success');
        closeRenewModal();
        await Promise.all([
            window.SHARK.codes?.loadCodesData(),
            window.SHARK.users?.loadUsersData(),
            window.SHARK.dashboard?.loadDashboardData()
        ]);
        window.SHARK.dashboard?.loadExpiryTable();
    } catch (err) {
        console.error("Renewal failure:", err);
        showToast('خطأ في التجديد: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function revokeDeviceLicense(deviceId) {
    showLoading(true);
    try {
        const codesData = window.SHARK.state.codesData || [];
        const lic = codesData.find(c => c.device_id === deviceId);
        if (!lic) {
            showToast('هذا الجهاز ليس لديه اشتراك مربوط أصلاً', 'info');
            showLoading(false);
            return;
        }

        const { error } = await window.sb.from('licenses')
            .update({ device_id: null, expires_at: null, status: 'active' })
            .eq('license_key', lic.license_key);

        if (error) throw error;

        showToast('تم إلغاء الارتباط، الكود متاح مجدداً', 'success');
        await Promise.all([
            window.SHARK.codes?.loadCodesData(),
            window.SHARK.users?.loadUsersData(),
            window.SHARK.dashboard?.loadDashboardData()
        ]);
        window.SHARK.dashboard?.loadExpiryTable();
    } catch (err) {
        showToast('خطأ في إلغاء الاشتراك: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Event Listeners
document.getElementById('renewModal')?.addEventListener('click', e => {
    if (e.target.id === 'renewModal') closeRenewModal();
});

// Expose globals
window.openRenewModal = openRenewModal;
window.closeRenewModal = closeRenewModal;
window.initRenewModal = initRenewModal;
window.confirmRenew = confirmRenew;
window.revokeDeviceLicense = revokeDeviceLicense;

window.SHARK.renew = {
    openRenewModal,
    closeRenewModal,
    initRenewModal,
    confirmRenew,
    revokeDeviceLicense
};
