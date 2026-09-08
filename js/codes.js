/**
 * SHARK ADMIN DASHBOARD — LICENSE CODES & CRYPTOGRAPHIC GENERATOR
 * Handles license key issuance, status filtering, clipboard batch export, and state management.
 */

window.SHARK = window.SHARK || {};

// Cryptographically secure pseudorandom code generator (30-char unambiguous alphabet)
function rndNum(length = 12) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += alphabet[bytes[i] % alphabet.length];
    }
    return result;
}

async function loadCodesData() {
    try {
        const { data, error } = await window.sb.from('licenses').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        window.SHARK.state.codesData = data || [];
        applyCodesFilter();
    } catch (err) {
        console.error("Error loading codes:", err);
        showToast('خطأ في تحميل الأكواد', 'error');
    }
}

function applyCodesFilter() {
    const filter = document.getElementById('codesFilter')?.value || 'all';
    const codesData = window.SHARK.state.codesData || [];
    let filtered = codesData;

    if (filter === 'available') filtered = codesData.filter(c => !c.device_id && c.status === 'active');
    else if (filter === 'used')  filtered = codesData.filter(c => c.device_id);
    else if (filter === 'trial') filtered = codesData.filter(c => {
        if (!c.expires_at) return false;
        const created = new Date(c.created_at);
        const expires = new Date(c.expires_at);
        const diffHours = (expires - created) / 3600000;
        return diffHours <= 6;
    });
    else if (filter === 'lifetime') filtered = codesData.filter(c => c.duration_days >= 36500 || (!!c.device_id && !c.expires_at));

    const countBadge = document.getElementById('codesCount');
    if (countBadge) countBadge.textContent = `(${filtered.length})`;

    displayCodes(filtered);
}

function displayCodes(codes) {
    const tbody = document.getElementById('codesTableBody');
    if (!tbody) return;

    if (!codes.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-cell"><i class="ri-key-2-line"></i> لا توجد أكواد</td></tr>';
        return;
    }

    tbody.innerHTML = codes.map((c, i) => {
        const isUsed = !!c.device_id;
        const isLifetime = c.duration_days >= 36500 || (isUsed && (!c.expires_at || c.expires_at.startsWith('2099-01-01')));
        const isTrial = c.duration_days && c.duration_days < 1;

        const statusBadge = c.status === 'suspended'
            ? '<span class="badge badge-banned">موقوف</span>'
            : isUsed
                ? '<span class="badge badge-active">مستخدم</span>'
                : '<span class="badge badge-expired">متاح</span>';

        let durationText;
        if (isTrial) {
            durationText = '<span style="background:rgba(245,158,11,0.12);color:#FBBF24;border:1px solid rgba(245,158,11,0.3);border-radius:4px;padding:2px 6px;font-size:11px;font-weight:700;">تجربة</span>';
        } else if (isLifetime) {
            durationText = '<span style="background:rgba(59,130,246,0.12);color:#60A5FA;border:1px solid rgba(59,130,246,0.3);border-radius:4px;padding:2px 6px;font-size:11px;font-weight:700;">مدى الحياة</span>';
        } else if (c.duration_days) {
            let label;
            if (c.duration_days === 7) label = 'أسبوع';
            else if (c.duration_days === 30) label = 'شهر (30 يوم)';
            else if (c.duration_days === 90) label = '3 شهور';
            else if (c.duration_days === 365) label = 'سنة';
            else label = `${Math.round(c.duration_days)} يوم`;
            durationText = `<span style="font-size:12px;color:var(--color-text-primary);font-weight:600;">${label}</span>`;
        } else {
            durationText = '<span style="color:var(--color-text-muted);">—</span>';
        }

        const safeKey = escapeHtml(c.license_key);

        return `<tr>
            <td style="text-align:center;color:var(--color-text-muted);">${i + 1}</td>
            <td style="font-family:var(--font-family-mono);color:var(--color-primary);font-size:12px;font-weight:700;">
                <div style="display:inline-flex;align-items:center;gap:4px;">
                    <span>${safeKey}</span>
                    <button onclick="navigator.clipboard.writeText('${safeKey}'); showToast('تم نسخ الكود بنجاح','success')" title="نسخ الكود" class="table-btn" style="padding:2px 6px;">
                        <i class="ri-file-copy-line"></i>
                    </button>
                </div>
            </td>
            <td>${durationText}</td>
            <td>${statusBadge}</td>
            <td style="text-align:center;">
                <div style="display:inline-flex;gap:4px;justify-content:center;">
                    ${c.status === 'active'
                        ? `<button class="table-btn" onclick="suspendCode('${safeKey}')" title="إيقاف مؤقت"><i class="ri-pause-line"></i></button>`
                        : `<button class="table-btn" onclick="activateCode('${safeKey}')" title="إعادة تفعيل"><i class="ri-play-line"></i></button>`
                    }
                    <button class="table-btn delete" onclick="deleteCode('${safeKey}')" title="حذف الكود"><i class="ri-delete-bin-line"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function suspendCode(key) {
    await window.sb.from('licenses').update({ status: 'suspended' }).eq('license_key', key);
    showToast('تم إيقاف الكود مؤقتاً', 'info');
    loadCodesData();
}

async function activateCode(key) {
    await window.sb.from('licenses').update({ status: 'active' }).eq('license_key', key);
    showToast('تم إعادة تفعيل الكود بنجاح', 'success');
    loadCodesData();
}

async function deleteCode(key) {
    if (!confirm('هل تريد حذف هذا الكود نهائياً؟')) return;
    showLoading(true);
    try {
        const { error } = await window.sb.from('licenses').delete().eq('license_key', key);
        if (error) throw error;
        showToast('تم حذف الكود بنجاح', 'success');
        await loadCodesData();
        await window.SHARK.dashboard?.loadDashboardData();
    } catch (err) {
        console.error("Delete code error:", err);
        showToast('فشل حذف الكود: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

// ── CODE GENERATOR ────────────────────────────────────────────────────────

function initCodeGenerator() {
    const generatorState = window.SHARK.state.generatorState;

    document.querySelectorAll('.dtype-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dtype-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            generatorState.type = btn.dataset.type;

            ['preset', 'custom', 'date', 'lifetime'].forEach(t => {
                const el = document.getElementById(t + 'Panel');
                if (el) el.style.display = t === btn.dataset.type ? 'block' : 'none';
            });

            if (btn.dataset.type === 'lifetime') generatorState.days = null;
            updateSummary();
        });
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            generatorState.days = parseFloat(btn.dataset.days);
            generatorState.isTrial = generatorState.days === 0.125;
            updateSummary();
        });
    });

    document.getElementById('customValue')?.addEventListener('input', updateCustom);
    document.getElementById('customUnit')?.addEventListener('change', updateCustom);

    const expiry = document.getElementById('expiryDate');
    if (expiry) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        expiry.min = tomorrow.toISOString().split('T')[0];
        expiry.addEventListener('change', () => {
            generatorState.expiryDate = expiry.value;
            const diffMs = new Date(expiry.value) - new Date();
            const diffDays = Math.ceil(diffMs / 86400000);
            generatorState.days = diffDays;
            generatorState.customHours = null;
            const previewEl = document.getElementById('datePreview');
            if (previewEl) previewEl.textContent = `بعد ${diffDays} يوم`;
            updateSummary();
        });
    }

    document.getElementById('generateCodesMainBtn')?.addEventListener('click', generateCodes);
    document.getElementById('codeCount')?.addEventListener('input', updateSummary);
    updateSummary();
}

function updateCustom() {
    const generatorState = window.SHARK.state.generatorState;
    const valInput = document.getElementById('customValue');
    let val = parseInt(valInput?.value) || 1;
    const unit = document.getElementById('customUnit')?.value;

    if (unit === 'hours' && val > 8760) { val = 8760; if (valInput) valInput.value = 8760; }
    if (unit === 'days' && val > 3650) { val = 3650; if (valInput) valInput.value = 3650; }
    if (unit === 'months' && val > 120) { val = 120; if (valInput) valInput.value = 120; }
    if (val < 1) { val = 1; if (valInput) valInput.value = 1; }

    const previewEl = document.getElementById('customPreview');

    if (unit === 'hours') {
        generatorState.days = val / 24;
        generatorState.customHours = val;
        if (previewEl) previewEl.textContent = `= ${val} ساعة`;
    } else if (unit === 'months') {
        generatorState.days = val * 30;
        generatorState.customHours = null;
        if (previewEl) previewEl.textContent = `= ${generatorState.days} يوم (${val} شهر)`;
    } else {
        generatorState.days = val;
        generatorState.customHours = null;
        if (previewEl) previewEl.textContent = `= ${val} يوم`;
    }
    updateSummary();
}

function updateSummary() {
    const generatorState = window.SHARK.state.generatorState;
    const count = parseInt(document.getElementById('codeCount')?.value) || 1;
    const type = generatorState.type;
    let dur;

    if (type === 'lifetime') {
        dur = 'مدى الحياة';
    } else if (type === 'preset' && generatorState.days === 0.125) {
        dur = '3 ساعات تجربة';
    } else if (type === 'date' && generatorState.expiryDate) {
        dur = `حتى ${new Date(generatorState.expiryDate).toLocaleDateString('ar-EG')}`;
    } else if (generatorState.customHours) {
        dur = `${generatorState.customHours} ساعة`;
    } else {
        const d = generatorState.days || 30;
        dur = d >= 30 && d % 30 === 0 ? `${d / 30} شهر` : `${d} يوم`;
    }

    const summaryEl = document.getElementById('summaryText');
    if (summaryEl) {
        summaryEl.textContent = `سيتم توليد ${count} كود ${count > 1 ? 'صالحة' : 'صالح'} لـ ${dur}`;
    }
}

function adjustCount(d) {
    const el = document.getElementById('codeCount');
    if (el) {
        el.value = Math.max(1, Math.min(100, parseInt(el.value) + d));
        updateSummary();
    }
}

function setCount(n) {
    const el = document.getElementById('codeCount');
    if (el) {
        el.value = n;
        updateSummary();
    }
}

async function generateCodes() {
    const generatorState = window.SHARK.state.generatorState;
    const count = parseInt(document.getElementById('codeCount')?.value) || 1;
    showLoading(true);

    try {
        const rows = [];
        for (let i = 0; i < count; i++) {
            const key = rndNum(12);
            let expiresAt = '2099-01-01T00:00:00.000Z';
            let durDays = generatorState.days || 30;

            if (generatorState.type === 'lifetime') {
                expiresAt = '2099-01-01T00:00:00.000Z';
                durDays = 36500;
            } else if (generatorState.type === 'date' && generatorState.expiryDate) {
                expiresAt = new Date(generatorState.expiryDate + 'T23:59:59').toISOString();
                durDays = null;
            } else if (generatorState.customHours) {
                durDays = generatorState.customHours / 24.0;
            } else {
                durDays = generatorState.days || 30;
            }

            rows.push({
                license_key: key,
                expires_at: expiresAt,
                duration_days: durDays,
                status: 'active'
            });
        }

        const { error } = await window.sb.from('licenses').insert(rows);
        if (error) throw error;

        showToast(`تم توليد ${count} كود بنجاح`, 'success');
        loadCodesData();
        window.SHARK.dashboard?.loadDashboardData();
    } catch (err) {
        showToast('خطأ في توليد الأكواد: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Event Listeners
document.getElementById('codesFilter')?.addEventListener('change', applyCodesFilter);
document.getElementById('refreshCodesBtn')?.addEventListener('click', () => {
    showLoading(true);
    loadCodesData().finally(() => showLoading(false));
});
document.getElementById('copyAvailableBtn')?.addEventListener('click', () => {
    const codesData = window.SHARK.state.codesData || [];
    const available = codesData.filter(c => !c.device_id && c.status === 'active').map(c => c.license_key).join('\n');
    if (!available) {
        showToast('لا توجد أكواد متاحة للنسخ', 'info');
        return;
    }
    navigator.clipboard.writeText(available);
    showToast(`تم نسخ ${available.split('\n').length} كود إلى الحافظة`, 'success');
});

async function quickGenerateCode(days, label) {
    showLoading(true);
    try {
        const key = rndNum(12);
        let expiresAt = '2099-01-01T00:00:00.000Z';
        let durDays = days;
        if (days >= 36500) {
            expiresAt = '2099-01-01T00:00:00.000Z';
            durDays = 36500;
        }

        const { error } = await window.sb.from('licenses').insert([{
            license_key: key,
            expires_at: expiresAt,
            duration_days: durDays,
            status: 'active'
        }]);

        if (error) throw error;

        await navigator.clipboard.writeText(key);
        showToast(`تم إنشاء كود (${label}) ونسخه للحافظة بنجاح: ${key}`, 'success');
        await loadCodesData();
        await window.SHARK.dashboard?.loadDashboardData();
    } catch (err) {
        console.error("Quick generate error:", err);
        showToast('فشل إنشاء الكود: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}
window.quickGenerateCode = quickGenerateCode;
window.quickGenerate30Days = () => quickGenerateCode(30, 'شهر');

// ── Quick Code Generation Modal Handlers ─────────────────────────────────────
function openQuickCodeModal() {
    const modal = document.getElementById('quickCodeModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('quickCustomDays');
        if (input) input.value = '';
    }
}
window.openQuickCodeModal = openQuickCodeModal;

function closeQuickCodeModal() {
    const modal = document.getElementById('quickCodeModal');
    if (modal) modal.style.display = 'none';
}
window.closeQuickCodeModal = closeQuickCodeModal;

async function quickGenerateAndClose(days, label) {
    await quickGenerateCode(days, label);
    closeQuickCodeModal();
}
window.quickGenerateAndClose = quickGenerateAndClose;

async function generateCustomDaysCode() {
    const input = document.getElementById('quickCustomDays');
    const days = parseInt(input?.value, 10);
    if (!days || days < 1) {
        showToast('يرجى كتابة عدد أيام صحيح (يوم واحد على الأقل)', 'warning');
        return;
    }
    await quickGenerateCode(days, `${days} يوم`);
    closeQuickCodeModal();
}
window.generateCustomDaysCode = generateCustomDaysCode;

// ── Robust Deletion of Unused Codes ──────────────────────────────────────────
async function deleteUnusedCodes() {
    showLoading(true);
    try {
        // Query directly from database to get fresh list of unused licenses
        const { data, error } = await window.sb.from('licenses').select('license_key, device_id');
        if (error) throw error;

        const unusedKeys = (data || [])
            .filter(c => !c.device_id || String(c.device_id).trim() === '')
            .map(c => c.license_key);

        if (!unusedKeys.length) {
            showToast('لا توجد أكواد غير مستخدمة لحذفها', 'info');
            return;
        }

        if (!confirm(`هل أنت متأكد من حذف ${unusedKeys.length} كود غير مستخدم نهائياً؟`)) {
            return;
        }

        // Delete in safe chunks of 25 keys
        for (let i = 0; i < unusedKeys.length; i += 25) {
            const chunk = unusedKeys.slice(i, i + 25);
            const { error: delErr } = await window.sb.from('licenses').delete().in('license_key', chunk);
            if (delErr) throw delErr;
        }

        showToast(`تم حذف ${unusedKeys.length} كود غير مستخدم بنجاح`, 'success');
        await loadCodesData();
        await window.SHARK.dashboard?.loadDashboardData();
    } catch (err) {
        console.error("Delete unused codes error:", err);
        showToast('فشل حذف الأكواد: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}
window.deleteUnusedCodes = deleteUnusedCodes;

// Expose globals
window.rndNum = rndNum;
window.loadCodesData = loadCodesData;
window.suspendCode = suspendCode;
window.activateCode = activateCode;
window.deleteCode = deleteCode;
window.initCodeGenerator = initCodeGenerator;
window.adjustCount = adjustCount;
window.setCount = setCount;
window.generateCodes = generateCodes;

window.SHARK.codes = {
    rndNum,
    loadCodesData,
    applyCodesFilter,
    displayCodes,
    suspendCode,
    activateCode,
    deleteCode,
    initCodeGenerator,
    generateCodes,
    openQuickCodeModal,
    closeQuickCodeModal,
    quickGenerateAndClose,
    generateCustomDaysCode,
    deleteUnusedCodes
};

