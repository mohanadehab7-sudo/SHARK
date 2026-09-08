/**
 * 🦈 SHARK ADMIN DASHBOARD — USERS & DEVICES
 * Handles device listings, sorting, search, status filtering, actions drawer, and details modal.
 */

window.SHARK = window.SHARK || {};

let actionsDeviceId = null;
let detailsCurrentDeviceId = null;

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
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading-cell"><i class="fas fa-inbox"></i> لا يوجد مستخدمون</td></tr>';
        return;
    }

    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;

    tbody.innerHTML = users.map((u, i) => {
        const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
        const isOnline = u.last_seen && (new Date() - new Date(u.last_seen)) < 300000;
        const onlineDot = isOnline 
            ? '<span class="online-dot" title="متصل الآن"></span>' 
            : '<span class="offline-dot" title="غير متصل"></span>';
        const statusBadge = u.status === 'active' 
            ? '<span class="badge badge-active">نشط</span>' 
            : '<span class="badge badge-banned">محظور</span>';

        let subEnd = '<span class="badge badge-expired">بدون ترخيص</span>';
        let remainingCell = '<span style="color:var(--muted);font-size:11px;">—</span>';

        const mode = settingsData?.bot_mode || 'subscription';

        if (lic) {
            if (!lic.expires_at) {
                subEnd = '<span class="badge badge-lifetime">♾️ مدى الحياة</span>';
                remainingCell = '<span class="badge badge-lifetime" style="font-size:10px;">♾️</span>';
            } else {
                subEnd = formatSubEnd(lic.expires_at);
                remainingCell = formatRemainingDays(lic.expires_at);
            }
        } else if (mode === 'free') {
            subEnd = '—';
            remainingCell = '—';
        } else if (mode === 'trial') {
            const created = u.created_at ? new Date(u.created_at) : new Date();
            const trialEnd = new Date(created.getTime() + 24 * 3600000);
            const msLeft = trialEnd - new Date();
            const hoursLeft = msLeft / 3600000;
            if (hoursLeft > 0) {
                subEnd = `<span class="badge badge-active" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.4);"><i class="fas fa-clock" style="margin-left:4px;"></i>تجربة نشطة (${hoursLeft.toFixed(1)}س)</span>`;
                remainingCell = `<span style="color:#60a5fa;font-weight:700;font-size:11px;">${hoursLeft.toFixed(1)}س</span>`;
            } else {
                subEnd = '<span class="badge badge-expired"><i class="fas fa-hourglass-end" style="margin-left:4px;"></i>انتهت التجربة</span>';
                remainingCell = '<span style="color:var(--danger);font-size:11px;">منتهي</span>';
            }
        } else if (mode === 'shutdown') {
            subEnd = '<span class="badge badge-banned"><i class="fas fa-power-off" style="margin-left:4px;"></i>موقوف</span>';
            remainingCell = '<span style="color:var(--muted);font-size:11px;">—</span>';
        }

        const safeName = escapeHtml(u.device_name || 'غير معروف');
        const safeId = escapeHtml(u.device_id);
        const safeIdShort = safeId.substring(0, 12);
        const deviceDisplay = safeName !== 'غير معروف' ? safeName : `هاتف (${safeId.substring(0, 8)})`;

        return `<tr>
            <td style="text-align:center;">${onlineDot}</td>
            <td style="font-size:12px;font-weight:700;color:var(--neon);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="اسم الجهاز: ${safeName}">
                📱 ${deviceDisplay}
            </td>
            <td style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--muted);cursor:pointer;" onclick="navigator.clipboard.writeText('${safeId}'); showToast('تم نسخ المعرّف بنجاح', 'success');" title="اضغط لنسخ المعرّف الكامل: ${safeId}">
                ${safeIdShort}... <i class="far fa-copy" style="font-size:9px;margin-left:2px;"></i>
            </td>
            <td>${formatRelative(u.last_seen)}</td>
            <td>${subEnd}</td>
            <td style="text-align:center;">${remainingCell}</td>
            <td><span class="badge" style="background:rgba(157,23,77,0.1);color:#f0abfc;border:1px solid rgba(157,23,77,0.3);">${u.total_runs || 0}</span></td>
            <td><span class="badge" style="background:rgba(67,56,202,0.1);color:#a5b4fc;border:1px solid rgba(67,56,202,0.3);">${formatMins(u.total_minutes || 0)}</span></td>
            <td>${statusBadge}</td>
            <td style="white-space:nowrap;">
                <button class="table-btn" style="color:var(--neon);background:rgba(0,243,255,0.1);border:1px solid rgba(0,243,255,0.2);width:36px;" onclick="openActionsCard('${safeId}')" title="الإجراءات"><i class="fas fa-ellipsis-v"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ── USER ACTIONS ──────────────────────────────────────────────────────────

async function blockUser(deviceId) {
    const banMsg = "🚫 تم حظر جهازك من استخدام البوت! يرجى التواصل مع الإدارة للمزيد من التفاصيل.";
    await window.sb.from('devices').update({ status: 'banned', message: banMsg }).eq('device_id', deviceId);
    showToast('✅ تم حظر الجهاز بنجاح', 'success');
    await loadUsersData();
    window.SHARK.dashboard?.loadDashboardData();
}

async function unblockUser(deviceId) {
    await window.sb.from('devices').update({ status: 'active' }).eq('device_id', deviceId);
    showToast('✅ تم رفع الحظر عن الجهاز', 'success');
    await loadUsersData();
    window.SHARK.dashboard?.loadDashboardData();
}

async function deleteUser(deviceId) {
    if (!confirm('هل أنت متأكد من حذف المستخدم نهائياً؟ لا يمكن التراجع!')) return;
    await window.sb.from('devices').delete().eq('device_id', deviceId);
    showToast('✅ تم حذف الجهاز نهائياً', 'success');
    await loadUsersData();
    window.SHARK.dashboard?.loadDashboardData();
}

// ── ACTIONS CARD DRAWER ───────────────────────────────────────────────────

function openActionsCard(deviceId) {
    actionsDeviceId = deviceId;
    window.actionsDeviceId = deviceId;

    const usersData = window.SHARK.state.usersData || [];
    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;

    const user = usersData.find(u => u.device_id === deviceId);
    const lic  = codesData.find(c => c.device_id === deviceId);
    const mode = settingsData?.bot_mode || 'subscription';

    const phoneName = user?.device_name || `هاتف (${deviceId?.substring(0, 8)})`;
    const phoneNameEl = document.getElementById('actionsPhoneName');
    if (phoneNameEl) phoneNameEl.textContent = '📱 ' + phoneName;

    const statusEl = document.getElementById('actionsStatusBadge');
    if (statusEl) {
        if (user?.status === 'banned') {
            statusEl.textContent = 'محظور';
            statusEl.className = 'badge badge-banned';
        } else {
            statusEl.textContent = 'نشط';
            statusEl.className = 'badge badge-active';
        }
    }

    const blockBtn   = document.getElementById('actionsBlockBtn');
    const blockLabel = document.getElementById('actionsBlockLabel');
    if (blockBtn && blockLabel) {
        if (user?.status === 'banned') {
            blockBtn.className = 'action-card-btn success';
            blockLabel.textContent = 'رفع الحظر';
            blockBtn.querySelector('i').className = 'fas fa-check';
        } else {
            blockBtn.className = 'action-card-btn danger-soft';
            blockLabel.textContent = 'حظر';
            blockBtn.querySelector('i').className = 'fas fa-ban';
        }
    }

    const subEndEl    = document.getElementById('actionsSubEnd');
    const remainingEl = document.getElementById('actionsRemaining');

    if (subEndEl && remainingEl) {
        if (lic?.expires_at) {
            subEndEl.textContent  = formatDate(lic.expires_at);
            remainingEl.innerHTML = formatRemainingDays(lic.expires_at);
        } else if (lic && !lic.expires_at) {
            subEndEl.innerHTML  = '<span class="badge badge-lifetime" style="font-size:10px;">♾️ مدى الحياة</span>';
            remainingEl.innerHTML = '<span style="color:#60a5fa;">♾️</span>';
        } else if (mode === 'trial') {
            const created  = user?.created_at ? new Date(user.created_at) : new Date();
            const trialEnd = new Date(created.getTime() + 24 * 3600000);
            const hoursLeft = (trialEnd - new Date()) / 3600000;
            subEndEl.textContent  = formatDate(trialEnd.toISOString()) + ' (تجربة)';
            remainingEl.innerHTML = hoursLeft > 0
                ? `<span style="color:#60a5fa;font-weight:700;">${hoursLeft.toFixed(1)}س</span>`
                : '<span style="color:var(--danger);">منتهي</span>';
        } else if (mode === 'free') {
            subEndEl.innerHTML  = '<span style="color:#34d399;">🎁 مجاني</span>';
            remainingEl.innerHTML = '<span style="color:#34d399;">♾️</span>';
        } else {
            subEndEl.innerHTML  = '<span style="color:var(--muted);">بدون ترخيص</span>';
            remainingEl.innerHTML = '—';
        }
    }

    const deleteConfirm = document.getElementById('actionsDeleteConfirm');
    const deleteBtn     = document.getElementById('actionsDeleteBtn');
    if (deleteConfirm) deleteConfirm.style.display = 'none';
    if (deleteBtn)     deleteBtn.style.display     = 'flex';

    const modal = document.getElementById('actionsModal');
    if (modal) modal.style.display = 'flex';
}

function closeActionsCard() {
    const modal = document.getElementById('actionsModal');
    if (modal) modal.style.display = 'none';
    actionsDeviceId = null;
    window.actionsDeviceId = null;
}

async function actionsToggleBlock() {
    if (!actionsDeviceId) return;
    const usersData = window.SHARK.state.usersData || [];
    const user = usersData.find(u => u.device_id === actionsDeviceId);
    if (user?.status === 'banned') {
        await unblockUser(actionsDeviceId);
    } else {
        await blockUser(actionsDeviceId);
    }
    closeActionsCard();
}

// ── USER DETAILS MODAL ────────────────────────────────────────────────────

function openUserDetailsModal(deviceId) {
    detailsCurrentDeviceId = deviceId;
    const usersData = window.SHARK.state.usersData || [];
    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;

    const user = usersData.find(u => u.device_id === deviceId);
    const lic  = codesData.find(c => c.device_id === deviceId);
    const mode = settingsData?.bot_mode || 'subscription';

    const phoneName = user?.device_name || `هاتف (${deviceId?.substring(0, 8)})`;
    const nameEl = document.getElementById('detailsPhoneName');
    if (nameEl) nameEl.textContent = '📱 ' + phoneName;

    const statusEl = document.getElementById('detailsStatusBadge');
    if (statusEl) {
        if (user?.status === 'banned') {
            statusEl.textContent = 'محظور';
            statusEl.className = 'badge badge-banned';
        } else {
            statusEl.textContent = 'نشط';
            statusEl.className = 'badge badge-active';
        }
    }

    const endDateEl      = document.getElementById('detailsEndDate');
    const remainingEl    = document.getElementById('detailsRemaining');
    const startDateEl    = document.getElementById('detailsStartDate');
    const codeEl         = document.getElementById('detailsCode');

    if (lic) {
        if (startDateEl) startDateEl.textContent = formatDate(lic.created_at || user?.created_at);
        if (endDateEl && remainingEl) {
            if (!lic.expires_at) {
                endDateEl.textContent = '♾️ مدى الحياة';
                endDateEl.style.color = '#60a5fa';
                remainingEl.innerHTML = '<span class="badge badge-lifetime">♾️ لا ينتهي</span>';
            } else {
                const diff = new Date(lic.expires_at) - new Date();
                endDateEl.textContent = formatDate(lic.expires_at);
                endDateEl.style.color = diff < 0 ? 'var(--danger)' : diff < 86400000 * 3 ? 'var(--warning)' : 'var(--text)';
                remainingEl.innerHTML = formatRemainingDays(lic.expires_at);
            }
        }
        if (codeEl) {
            codeEl.textContent = lic.license_key;
            codeEl.style.cursor = 'pointer';
            codeEl.title = 'اضغط لنسخ الكود';
        }
    } else if (mode === 'trial') {
        const created = user?.created_at ? new Date(user.created_at) : new Date();
        const trialEnd = new Date(created.getTime() + 24 * 3600000);
        const diff = trialEnd - new Date();

        if (startDateEl) startDateEl.textContent = formatDate(created.toISOString());
        if (endDateEl) {
            endDateEl.textContent = formatDate(trialEnd.toISOString()) + ' (تجربة)';
            endDateEl.style.color = diff < 0 ? 'var(--danger)' : diff < 3600000 * 3 ? 'var(--warning)' : '#60a5fa';
        }
        if (remainingEl) remainingEl.innerHTML = formatRemainingDays(trialEnd.toISOString());
        if (codeEl) {
            codeEl.textContent = '— تجربة مجانية —';
            codeEl.style.cursor = 'default';
        }
    } else if (mode === 'free') {
        if (startDateEl) startDateEl.textContent = user?.created_at ? formatDate(user.created_at) : '—';
        if (endDateEl) {
            endDateEl.textContent = '🎁 مجاني بالكامل';
            endDateEl.style.color = '#34d399';
        }
        if (remainingEl) remainingEl.innerHTML = '<span class="badge badge-active" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.4);">لا ينتهي</span>';
        if (codeEl) {
            codeEl.textContent = '— وضع مجاني —';
            codeEl.style.cursor = 'default';
        }
    } else {
        if (startDateEl) startDateEl.textContent = user?.created_at ? formatDate(user.created_at) : '—';
        if (endDateEl) {
            endDateEl.textContent = 'بدون ترخيص';
            endDateEl.style.color = 'var(--muted)';
        }
        if (remainingEl) remainingEl.innerHTML = '<span class="badge badge-expired">لا يوجد</span>';
        if (codeEl) {
            codeEl.textContent = '—';
            codeEl.style.cursor = 'default';
        }
    }

    const devIdEl = document.getElementById('detailsDeviceId');
    if (devIdEl) devIdEl.textContent = deviceId || '—';

    const modal = document.getElementById('userDetailsModal');
    if (modal) modal.style.display = 'flex';
}

function closeUserDetailsModal() {
    const modal = document.getElementById('userDetailsModal');
    if (modal) modal.style.display = 'none';
    detailsCurrentDeviceId = null;
}

function copyDetailsCode() {
    const code = document.getElementById('detailsCode')?.textContent;
    if (code && code !== '—' && !code.includes('مجاني')) {
        navigator.clipboard.writeText(code);
        showToast('✅ تم نسخ الكود بنجاح', 'success');
    }
}

function renewFromDetails() {
    if (!detailsCurrentDeviceId) return;
    const id = detailsCurrentDeviceId;
    closeUserDetailsModal();
    if (window.openRenewModal) window.openRenewModal(id);
}

async function revokeFromDetails() {
    if (!detailsCurrentDeviceId) return;
    const usersData = window.SHARK.state.usersData || [];
    const user = usersData.find(u => u.device_id === detailsCurrentDeviceId);
    const name = user?.device_name || `هاتف (${detailsCurrentDeviceId?.substring(0, 8)})`;
    if (!confirm(`هل أنت متأكد من إلغاء اشتراك "${name}"؟\nسيتم فك ارتباط الكود بجهازه.`)) return;
    if (window.revokeDeviceLicense) {
        await window.revokeDeviceLicense(detailsCurrentDeviceId);
    }
    closeUserDetailsModal();
}

// ── LISTENERS ─────────────────────────────────────────────────────────────

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

document.getElementById('actionsModal')?.addEventListener('click', e => {
    if (e.target.id === 'actionsModal') closeActionsCard();
});

document.getElementById('userDetailsModal')?.addEventListener('click', e => {
    if (e.target.id === 'userDetailsModal') closeUserDetailsModal();
});

// Expose globals
window.openActionsCard = openActionsCard;
window.closeActionsCard = closeActionsCard;
window.actionsToggleBlock = actionsToggleBlock;
window.openUserDetailsModal = openUserDetailsModal;
window.closeUserDetailsModal = closeUserDetailsModal;
window.copyDetailsCode = copyDetailsCode;
window.renewFromDetails = renewFromDetails;
window.revokeFromDetails = revokeFromDetails;
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
    openActionsCard,
    closeActionsCard,
    openUserDetailsModal,
    closeUserDetailsModal
};
