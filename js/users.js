/**
 * SHARK ADMIN DASHBOARD — USERS & DEVICES
 * Handles device listings, search, status filtering, and the unified user management sheet.
 */

window.SHARK = window.SHARK || {};

let currentModalDeviceId = null;

async function loadUsersData() {
    try {
        const { data, error } = await window.sb.from('devices').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        window.SHARK.state.usersData = data || [];
        applyUserFilter();
    } catch (err) {
        console.error("Error loading users:", err);
        showToast('خطأ في تحميل المستخدمين', 'error');
    }
}

function isUserSubActive(u) {
    if (u.status === 'banned') return false;
    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;
    const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
    const mode = settingsData?.bot_mode || 'subscription';

    if (lic) {
        if (!lic.expires_at || lic.duration_days >= 36500) return true;
        return new Date(lic.expires_at) > new Date();
    }
    if (mode === 'free') return true;
    if (mode === 'trial') {
        const created = u.created_at ? new Date(u.created_at) : new Date();
        const trialEnd = new Date(created.getTime() + 24 * 3600000);
        return trialEnd > new Date();
    }
    return false;
}

function applyUserFilter() {
    const filter = document.getElementById('userFilter')?.value || 'all';
    const search = document.getElementById('userSearch')?.value.toLowerCase().trim() || '';
    const now = new Date();
    const DAY = 86400000;
    const usersData = window.SHARK.state.usersData || [];
    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;

    let filtered = [...usersData];

    if (search) {
        filtered = filtered.filter(u =>
            (u.device_name || '').toLowerCase().includes(search) ||
            (u.device_id || '').toLowerCase().includes(search)
        );
    }

    switch (filter) {
        case 'expired_or_expiring':
            filtered = filtered.filter(u => {
                if (u.status === 'banned') return false;
                const active = isUserSubActive(u);
                if (!active) return true;

                const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
                if (lic?.expires_at) {
                    const diff = new Date(lic.expires_at) - now;
                    return diff > 0 && diff < 3 * DAY;
                }
                const mode = settingsData?.bot_mode || 'subscription';
                if (mode === 'trial') {
                    const created = u.created_at ? new Date(u.created_at) : new Date();
                    const trialEnd = new Date(created.getTime() + 24 * 3600000);
                    const diff = trialEnd - now;
                    return diff > 0 && diff < 3 * DAY;
                }
                return false;
            });
            break;
        case 'blocked':
            filtered = filtered.filter(u => u.status === 'banned');
            break;
    }

    // Sort priority
    filtered.sort((a, b) => {
        if (filter !== 'most_active') {
            const activeA = isUserSubActive(a);
            const activeB = isUserSubActive(b);
            if (activeA !== activeB) return activeA ? -1 : 1;
        }
        const runsA = parseInt(a.total_runs) || 0;
        const runsB = parseInt(b.total_runs) || 0;
        if (runsA !== runsB) return runsB - runsA;

        const minsA = parseInt(a.total_minutes) || 0;
        const minsB = parseInt(b.total_minutes) || 0;
        return minsB - minsA;
    });

    const countBadge = document.getElementById('filteredCount');
    if (countBadge) countBadge.textContent = `(${filtered.length})`;

    displayUsers(filtered);
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    const cardsContainer = document.getElementById('usersCardsContainer');
    if (!tbody && !cardsContainer) return;

    if (!users.length) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="loading-cell"><i class="fas fa-inbox"></i> لا يوجد مستخدمون مسجلون</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:36px; color:var(--muted);"><i class="fas fa-inbox fa-2x" style="margin-bottom:8px;"></i><p>لا يوجد مستخدمون مسجلون</p></div>';
        return;
    }

    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;
    const mode = settingsData?.bot_mode || 'subscription';

    // Process user rows & cards data
    const rowsHtml = [];
    const cardsHtml = [];

    users.forEach((u, i) => {
        const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
        const isOnline = u.last_seen && (new Date() - new Date(u.last_seen)) < 300000;
        const onlineDot = isOnline 
            ? '<span class="online-dot" title="متصل الآن"></span>' 
            : '<span class="offline-dot" title="غير متصل"></span>';
        const statusBadge = u.status === 'active' 
            ? '<span class="badge badge-active">نشط</span>' 
            : '<span class="badge badge-banned">محظور</span>';

        let subEnd = '<span class="badge badge-expired">بدون ترخيص</span>';
        let remainingCell = '<span style="color:var(--color-text-muted);font-size:11px;">—</span>';

        if (lic) {
            if (!lic.expires_at) {
                subEnd = '<span class="badge badge-lifetime">مدى الحياة</span>';
                remainingCell = '<span class="badge badge-lifetime" style="font-size:10px;">دائم</span>';
            } else {
                subEnd = formatSubEnd(lic.expires_at);
                remainingCell = formatRemainingDays(lic.expires_at);
            }
        } else if (mode === 'free') {
            subEnd = '<span style="color:#10B981;">مجاني</span>';
            remainingCell = '<span style="color:#10B981;">دائم</span>';
        } else if (mode === 'trial') {
            const created = u.created_at ? new Date(u.created_at) : new Date();
            const trialEnd = new Date(created.getTime() + 24 * 3600000);
            const msLeft = trialEnd - new Date();
            const hoursLeft = msLeft / 3600000;
            if (hoursLeft > 0) {
                subEnd = `<span class="badge badge-active" style="background:rgba(56,189,248,0.12);color:#38BDF8;border:1px solid rgba(56,189,248,0.3);"><i class="ri-time-line" style="margin-left:3px;"></i>تجربة (${hoursLeft.toFixed(1)}س)</span>`;
                remainingCell = `<span style="color:#38BDF8;font-weight:700;font-size:11px;">${hoursLeft.toFixed(1)}س</span>`;
            } else {
                subEnd = '<span class="badge badge-expired"><i class="ri-time-line" style="margin-left:3px;"></i>انتهت التجربة</span>';
                remainingCell = '<span style="color:var(--danger);font-size:11px;">منتهي</span>';
            }
        } else if (mode === 'shutdown') {
            subEnd = '<span class="badge badge-banned"><i class="ri-shut-down-line" style="margin-left:3px;"></i>موقوف</span>';
            remainingCell = '<span style="color:var(--color-text-muted);font-size:11px;">—</span>';
        }

        const safeName = escapeHtml(u.device_name || 'غير معروف');
        const safeId = escapeHtml(u.device_id);
        const safeIdShort = safeId.substring(0, 10);
        const deviceDisplay = safeName !== 'غير معروف' ? safeName : `هاتف (${safeId.substring(0, 8)})`;

        // Desktop Table Row
        rowsHtml.push(`<tr>
            <td style="text-align:center;">${onlineDot}</td>
            <td style="font-size:12px;font-weight:700;color:var(--color-text-primary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="اسم الجهاز: ${safeName}">
                <i class="ri-smartphone-line" style="color:var(--color-primary);margin-left:3px;"></i>${deviceDisplay}
            </td>
            <td style="font-size:11px;font-family:var(--font-family-mono);color:var(--color-text-muted);cursor:pointer;" onclick="navigator.clipboard.writeText('${safeId}'); showToast('تم نسخ المعرّف بنجاح', 'success');" title="اضغط لنسخ المعرّف الكامل">
                ${safeIdShort}... <i class="ri-file-copy-line" style="font-size:10px;margin-left:2px;"></i>
            </td>
            <td>${formatRelative(u.last_seen)}</td>
            <td>${subEnd}</td>
            <td style="text-align:center;">${remainingCell}</td>
            <td><span class="badge" style="background:rgba(168,85,247,0.1);color:#C084FC;border:1px solid rgba(168,85,247,0.25);">${u.total_runs || 0}</span></td>
            <td><span class="badge" style="background:rgba(56,189,248,0.1);color:#38BDF8;border:1px solid rgba(56,189,248,0.25);">${formatMins(u.total_minutes || 0)}</span></td>
            <td>${statusBadge}</td>
            <td style="white-space:nowrap;">
                <button class="table-btn details-btn" onclick="openUserProfile('${safeId}')" title="إدارة الجهاز">
                    <i class="ri-settings-4-line"></i> <span>إدارة</span>
                </button>
            </td>
        </tr>`);

        // Mobile Touch Card
        cardsHtml.push(`
            <div class="user-mobile-card" onclick="openUserProfile('${safeId}')">
                <div class="user-card-header">
                    <div class="user-card-title-group">
                        ${onlineDot}
                        <span class="user-card-title"><i class="ri-smartphone-line" style="color:var(--color-primary);"></i> ${deviceDisplay}</span>
                    </div>
                    <div style="display:flex;gap:4px;align-items:center;">
                        ${statusBadge}
                    </div>
                </div>
                <div class="user-card-meta">
                    <div class="user-meta-item">
                        <span class="meta-label">الاشتراك:</span>
                        <span>${subEnd}</span>
                    </div>
                    <div class="user-meta-item">
                        <span class="meta-label">المتبقي:</span>
                        <span>${remainingCell}</span>
                    </div>
                    <div class="user-meta-item">
                        <span class="meta-label">المغلفات:</span>
                        <span style="color:#C084FC;font-weight:700;">${u.total_runs || 0}</span>
                    </div>
                    <div class="user-meta-item">
                        <span class="meta-label">التشغيل:</span>
                        <span style="color:#38BDF8;font-weight:700;">${formatMins(u.total_minutes || 0)}</span>
                    </div>
                </div>
                <div class="user-card-footer">
                    <span class="user-card-id"><i class="ri-fingerprint-line"></i> ${safeIdShort}...</span>
                    <button class="user-card-action-btn" onclick="event.stopPropagation(); openUserProfile('${safeId}');">
                        <i class="ri-settings-4-line"></i> التحكم بالجهاز
                    </button>
                </div>
            </div>
        `);
    });

    if (tbody) tbody.innerHTML = rowsHtml.join('');
    if (cardsContainer) cardsContainer.innerHTML = cardsHtml.join('');
}

// ── UNIFIED USER PROFILE & CONTROL SHEET ───────────────────────────────────

function openUserProfile(deviceId) {
    currentModalDeviceId = deviceId;
    window.actionsDeviceId = deviceId;

    const usersData = window.SHARK.state.usersData || [];
    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;

    const user = usersData.find(u => u.device_id === deviceId);
    const lic  = codesData.find(c => c.device_id === deviceId);
    const mode = settingsData?.bot_mode || 'subscription';

    // Header Info
    const phoneName = user?.device_name || `هاتف (${deviceId?.substring(0, 8)})`;
    const phoneNameEl = document.getElementById('modalPhoneName');
    if (phoneNameEl) phoneNameEl.textContent = phoneName;

    const isOnline = user?.last_seen && (new Date() - new Date(user.last_seen)) < 300000;
    const onlineBadge = document.getElementById('modalOnlineBadge');
    if (onlineBadge) {
        onlineBadge.textContent = isOnline ? 'متصل الآن' : 'غير متصل';
        onlineBadge.className = isOnline ? 'badge badge-active' : 'badge';
        onlineBadge.style.background = isOnline ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)';
        onlineBadge.style.color = isOnline ? '#10B981' : 'var(--color-text-muted)';
    }

    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        const isBanned = user?.status === 'banned';
        statusBadge.textContent = isBanned ? 'محظور' : 'نشط';
        statusBadge.className = isBanned ? 'badge badge-banned' : 'badge badge-active';
    }

    // Subscription & Expiry
    const subEndEl = document.getElementById('modalSubEnd');
    const remainingEl = document.getElementById('modalRemaining');
    const licenseKeyEl = document.getElementById('modalLicenseKey');

    if (lic) {
        if (!lic.expires_at) {
            if (subEndEl) subEndEl.textContent = 'مدى الحياة';
            if (remainingEl) remainingEl.innerHTML = '<span class="badge badge-lifetime">لا ينتهي</span>';
        } else {
            const diff = new Date(lic.expires_at) - new Date();
            if (subEndEl) {
                subEndEl.textContent = formatDate(lic.expires_at);
                subEndEl.style.color = diff < 0 ? 'var(--danger)' : diff < 86400000 * 3 ? 'var(--warning)' : 'var(--color-text-primary)';
            }
            if (remainingEl) remainingEl.innerHTML = formatRemainingDays(lic.expires_at);
        }
        if (licenseKeyEl) {
            licenseKeyEl.textContent = lic.license_key;
            licenseKeyEl.style.cursor = 'pointer';
            licenseKeyEl.title = 'اضغط لنسخ الكود';
        }
    } else if (mode === 'trial') {
        const created = user?.created_at ? new Date(user.created_at) : new Date();
        const trialEnd = new Date(created.getTime() + 24 * 3600000);
        const diff = trialEnd - new Date();
        if (subEndEl) {
            subEndEl.textContent = formatDate(trialEnd.toISOString()) + ' (تجربة)';
            subEndEl.style.color = diff < 0 ? 'var(--danger)' : '#38BDF8';
        }
        if (remainingEl) remainingEl.innerHTML = formatRemainingDays(trialEnd.toISOString());
        if (licenseKeyEl) {
            licenseKeyEl.textContent = '— تجربة مجانية —';
            licenseKeyEl.style.cursor = 'default';
        }
    } else if (mode === 'free') {
        if (subEndEl) subEndEl.textContent = 'وضع مجاني بالكامل';
        if (remainingEl) remainingEl.innerHTML = '<span class="badge badge-active">لا ينتهي</span>';
        if (licenseKeyEl) {
            licenseKeyEl.textContent = '— وضع مجاني —';
            licenseKeyEl.style.cursor = 'default';
        }
    } else {
        if (subEndEl) subEndEl.textContent = 'بدون ترخيص';
        if (remainingEl) remainingEl.innerHTML = '<span class="badge badge-expired">لا يوجد</span>';
        if (licenseKeyEl) {
            licenseKeyEl.textContent = '—';
            licenseKeyEl.style.cursor = 'default';
        }
    }

    // Telemetry Stats
    const totalRunsEl = document.getElementById('modalTotalRuns');
    const totalMinsEl = document.getElementById('modalTotalMins');
    if (totalRunsEl) totalRunsEl.textContent = user?.total_runs || 0;
    if (totalMinsEl) totalMinsEl.textContent = formatMins(user?.total_minutes || 0);

    // Device ID
    const devIdEl = document.getElementById('modalDeviceId');
    if (devIdEl) devIdEl.textContent = deviceId || '—';

    // Block Button Text
    const blockBtn = document.getElementById('modalBlockBtn');
    const blockLabel = document.getElementById('modalBlockLabel');
    if (blockBtn && blockLabel) {
        if (user?.status === 'banned') {
            blockBtn.className = 'action-card-btn success';
            blockLabel.textContent = 'رفع الحظر';
            blockBtn.querySelector('i').className = 'fas fa-check';
        } else {
            blockBtn.className = 'action-card-btn danger-soft';
            blockLabel.textContent = 'حظر الجهاز';
            blockBtn.querySelector('i').className = 'fas fa-ban';
        }
    }

    // Reset Delete Confirm
    hideDeleteConfirm();

    const modal = document.getElementById('unifiedUserModal');
    if (modal) modal.style.display = 'flex';
}

function closeUserProfile() {
    const modal = document.getElementById('unifiedUserModal');
    if (modal) modal.style.display = 'none';
    currentModalDeviceId = null;
    window.actionsDeviceId = null;
}

function copyModalCode() {
    const code = document.getElementById('modalLicenseKey')?.textContent;
    if (code && code !== '—' && !code.includes('مجاني')) {
        navigator.clipboard.writeText(code);
        showToast('تم نسخ كود التفعيل', 'success');
    }
}

function copyModalDeviceId() {
    if (currentModalDeviceId) {
        navigator.clipboard.writeText(currentModalDeviceId);
        showToast('تم نسخ معرف الجهاز بنجاح', 'success');
    }
}

function renewFromModal() {
    if (!currentModalDeviceId) return;
    const id = currentModalDeviceId;
    closeUserProfile();
    if (window.openRenewModal) window.openRenewModal(id);
}

function messageFromModal() {
    if (!currentModalDeviceId) return;
    const id = currentModalDeviceId;
    closeUserProfile();
    if (window.openMsgModal) window.openMsgModal(id);
}

function screenshotFromModal() {
    if (!currentModalDeviceId) return;
    const id = currentModalDeviceId;
    closeUserProfile();
    if (window.openScreenshotModal) window.openScreenshotModal(id);
}

function galleryFromModal() {
    if (!currentModalDeviceId) return;
    const id = currentModalDeviceId;
    closeUserProfile();
    if (window.openGalleryModal) window.openGalleryModal(id);
}

async function toggleBlockFromModal() {
    if (!currentModalDeviceId) return;
    const user = window.SHARK.state.usersData?.find(u => u.device_id === currentModalDeviceId);
    if (user?.status === 'banned') {
        await unblockUser(currentModalDeviceId);
    } else {
        await blockUser(currentModalDeviceId);
    }
    openUserProfile(currentModalDeviceId);
}

async function revokeFromModal() {
    if (!currentModalDeviceId) return;
    const user = window.SHARK.state.usersData?.find(u => u.device_id === currentModalDeviceId);
    const name = user?.device_name || `هاتف (${currentModalDeviceId.substring(0, 8)})`;
    if (!confirm(`هل تريد إلغاء كود التفعيل المربوط بجهاز "${name}"؟ سيصبح الكود متاحاً مجدداً.`)) return;
    if (window.revokeDeviceLicense) {
        await window.revokeDeviceLicense(currentModalDeviceId);
    }
    closeUserProfile();
}

function showDeleteConfirm() {
    const confirmBox = document.getElementById('modalDeleteConfirm');
    const deleteBtn = document.getElementById('modalDeleteBtn');
    if (confirmBox) confirmBox.style.display = 'block';
    if (deleteBtn) deleteBtn.style.display = 'none';
}

function hideDeleteConfirm() {
    const confirmBox = document.getElementById('modalDeleteConfirm');
    const deleteBtn = document.getElementById('modalDeleteBtn');
    if (confirmBox) confirmBox.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'flex';
}

async function deleteUserFromModal() {
    if (!currentModalDeviceId) return;
    const id = currentModalDeviceId;
    closeUserProfile();
    await deleteUser(id);
}

// ── USER CRUD ACTIONS ─────────────────────────────────────────────────────

async function blockUser(deviceId) {
    const banMsg = "تم حظر جهازك من استخدام البوت. يرجى مراجعة الإدارة.";
    await window.sb.from('devices').update({ status: 'banned', message: banMsg }).eq('device_id', deviceId);
    showToast('تم حظر الجهاز بنجاح', 'success');
    await loadUsersData();
    window.SHARK.dashboard?.loadDashboardData();
}

async function unblockUser(deviceId) {
    await window.sb.from('devices').update({ status: 'active' }).eq('device_id', deviceId);
    showToast('تم رفع الحظر عن الجهاز بنجاح', 'success');
    await loadUsersData();
    window.SHARK.dashboard?.loadDashboardData();
}

async function deleteUser(deviceId) {
    await window.sb.from('devices').delete().eq('device_id', deviceId);
    showToast('تم حذف الجهاز نهائياً', 'success');
    await loadUsersData();
    window.SHARK.dashboard?.loadDashboardData();
}

// Event Listeners
document.getElementById('userFilter')?.addEventListener('change', applyUserFilter);
document.getElementById('userSearch')?.addEventListener('input', applyUserFilter);
document.getElementById('refreshUsersBtn')?.addEventListener('click', async () => {
    showLoading(true);
    await window.SHARK.codes?.loadCodesData();
    await loadUsersData();
    window.SHARK.dashboard?.loadExpiryTable();
    showLoading(false);
    showToast('تم تحديث قائمة المستخدمين', 'success');
});

document.getElementById('unifiedUserModal')?.addEventListener('click', e => {
    if (e.target.id === 'unifiedUserModal') closeUserProfile();
});

// Backward compatibility & global expose
window.openUserProfile = openUserProfile;
window.closeUserProfile = closeUserProfile;
window.openActionsCard = openUserProfile;
window.closeActionsCard = closeUserProfile;
window.openUserDetailsModal = openUserProfile;
window.closeUserDetailsModal = closeUserProfile;
window.copyModalCode = copyModalCode;
window.copyModalDeviceId = copyModalDeviceId;
window.renewFromModal = renewFromModal;
window.messageFromModal = messageFromModal;
window.screenshotFromModal = screenshotFromModal;
window.galleryFromModal = galleryFromModal;
window.toggleBlockFromModal = toggleBlockFromModal;
window.revokeFromModal = revokeFromModal;
window.showDeleteConfirm = showDeleteConfirm;
window.hideDeleteConfirm = hideDeleteConfirm;
window.deleteUserFromModal = deleteUserFromModal;
window.blockUser = blockUser;
window.unblockUser = unblockUser;
window.deleteUser = deleteUser;

window.SHARK.users = {
    loadUsersData,
    applyUserFilter,
    displayUsers,
    blockUser,
    unblockUser,
    deleteUser,
    openUserProfile,
    closeUserProfile
};
