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
        if (c.duration_days && c.duration_days <= 1) return true;
        if (!c.expires_at) return false;
        const created = new Date(c.created_at);
        const expires = new Date(c.expires_at);
        const diffHours = (expires - created) / 3600000;
        return diffHours <= 24;
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
    if (!key) return;
    showConfirmDialog('حذف الكود', `هل أنت متأكد من حذف الكود ${key} نهائياً؟`, async () => {
        showLoading(true);
        try {
            const { error } = await window.sb.from('licenses').delete().eq('license_key', key);
            if (error) throw error;
            showToast(`تم حذف الكود (${key}) بنجاح`, 'success');
            await loadCodesData();
            await window.SHARK.dashboard?.loadDashboardData();
        } catch (err) {
            console.error("Delete code error:", err);
            showToast('فشل حذف الكود: ' + (err.message || err), 'error');
        } finally {
            showLoading(false);
        }
    });
}

// ── EVENT LISTENERS ────────────────────────────────────────────────────────

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
            showToast('لا توجد أكواد غير مستخدمة لحذفها حالياً', 'info');
            return;
        }

        showConfirmDialog('حذف الأكواد غير المستخدمة', `هل أنت متأكد من حذف جميع الأكواد غير المستخدمة (${unusedKeys.length} كود) نهائياً من قاعدة البيانات؟`, async () => {
            showLoading(true);
            try {
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
        });
    } catch (err) {
        console.error("Delete unused codes error:", err);
        showToast('فشل قراءة الأكواد: ' + (err.message || err), 'error');
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

window.SHARK.codes = {
    rndNum,
    loadCodesData,
    applyCodesFilter,
    displayCodes,
    suspendCode,
    activateCode,
    deleteCode,
    quickGenerateCode,
    openQuickCodeModal,
    closeQuickCodeModal,
    quickGenerateAndClose,
    generateCustomDaysCode,
    deleteUnusedCodes
};

