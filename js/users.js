/**
 * SHARK ADMIN DASHBOARD — USERS & DEVICES & CUSTOMER GROUPS
 * Handles device listings, search, customer grouping, multi-select bulk actions,
 * and unified subscriber profiles.
 */

window.SHARK = window.SHARK || {};

let currentModalDeviceId = null;
window.selectedUsers = new Set();
window.userViewMode = 'all'; // 'all' (table/cards) or 'grouped' (customer accordion)

// ── DATA INGESTION ──────────────────────────────────────────────────────────

async function loadUsersData() {
    try {
        const { data, error } = await window.sb
            .from('devices')
            .select('*')
            .neq('reseller', 'partner1')
            .order('created_at', { ascending: false });
        if (error) throw error;
        window.SHARK.state.usersData = data || [];
        updateExistingGroupsDatalist();
        applyUserFilter();
    } catch (err) {
        console.error("Error loading users:", err);
        showToast('خطأ في تحميل المستخدمين', 'error');
    }
}

function updateExistingGroupsDatalist() {
    const usersData = window.SHARK.state.usersData || [];
    const groupsSet = new Set();
    usersData.forEach(u => {
        if (u.customer_name && u.customer_name.trim()) {
            groupsSet.add(u.customer_name.trim());
        }
    });

    const datalist = document.getElementById('existingGroupsList');
    if (datalist) {
        datalist.innerHTML = Array.from(groupsSet)
            .sort()
            .map(name => `<option value="${escapeHtml(name)}"></option>`)
            .join('');
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

// ── FILTERING & VIEW DISPATCH ──────────────────────────────────────────────

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
            (u.device_id || '').toLowerCase().includes(search) ||
            (u.customer_name || '').toLowerCase().includes(search)
        );
    }

    switch (filter) {
        case 'most_active':
            filtered = filtered.filter(u => isUserSubActive(u));
            break;
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

    window.currentFilteredUsers = filtered;

    if (window.userViewMode === 'grouped') {
        displayGroupedUsers(filtered);
    } else {
        displayUsers(filtered);
    }

    updateBulkActionBar();
}

function toggleUserViewMode() {
    window.userViewMode = (window.userViewMode === 'grouped') ? 'all' : 'grouped';
    
    const icon = document.getElementById('viewModeIcon');
    const label = document.getElementById('viewModeLabel');
    const tableContainer = document.getElementById('usersTableViewContainer');
    const cardsContainer = document.getElementById('usersCardsContainer');
    const groupedContainer = document.getElementById('usersGroupedContainer');

    if (window.userViewMode === 'grouped') {
        if (icon) icon.className = 'ri-list-check-2';
        if (label) label.textContent = 'القائمة العادية';
        if (tableContainer) tableContainer.style.display = 'none';
        if (cardsContainer) cardsContainer.style.display = 'none';
        if (groupedContainer) groupedContainer.style.display = 'block';
    } else {
        if (icon) icon.className = 'ri-group-line';
        if (label) label.textContent = 'المجموعات';
        if (tableContainer) tableContainer.style.display = '';
        if (cardsContainer) cardsContainer.style.display = '';
        if (groupedContainer) groupedContainer.style.display = 'none';
    }

    applyUserFilter();
}

// ── MULTI-SELECT & BULK ACTIONS ───────────────────────────────────────────

function toggleUserSelect(deviceId, isChecked) {
    if (isChecked) {
        window.selectedUsers.add(deviceId);
    } else {
        window.selectedUsers.delete(deviceId);
    }
    updateBulkActionBar();
}

function toggleSelectAllUsers(isChecked) {
    const list = window.currentFilteredUsers || [];
    list.forEach(u => {
        if (isChecked) {
            window.selectedUsers.add(u.device_id);
        } else {
            window.selectedUsers.delete(u.device_id);
        }
    });

    // Sync all rendered checkboxes
    document.querySelectorAll('.user-row-cb').forEach(cb => {
        cb.checked = isChecked;
    });

    updateBulkActionBar();
}

function clearSelectedUsers() {
    window.selectedUsers.clear();
    document.querySelectorAll('.user-row-cb').forEach(cb => {
        cb.checked = false;
    });
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb) selectAllCb.checked = false;
    updateBulkActionBar();
}

function updateBulkActionBar() {
    const count = window.selectedUsers.size;
    const bar = document.getElementById('bulkActionBar');
    const countEl = document.getElementById('bulkSelectedCount');
    const selectAllCb = document.getElementById('selectAllCheckbox');

    if (count > 0) {
        if (bar) bar.style.display = 'flex';
        if (countEl) countEl.textContent = count;
    } else {
        if (bar) bar.style.display = 'none';
    }

    if (selectAllCb) {
        const total = (window.currentFilteredUsers || []).length;
        selectAllCb.checked = total > 0 && count >= total;
        selectAllCb.indeterminate = count > 0 && count < total;
    }
}

// ── BULK GROUP ASSIGNMENT MODAL ────────────────────────────────────────────

function openBulkGroupModal() {
    if (window.selectedUsers.size === 0) {
        showToast('يرجى تحديد هاتف واحد على الأقل أولاً', 'info');
        return;
    }
    const count = window.selectedUsers.size;
    const subtitle = document.getElementById('bulkGroupSubtitle');
    if (subtitle) {
        subtitle.innerHTML = `تم تحديد <b style="color:var(--color-primary);">${count}</b> هواتف. اختر اسم المشترك لربطها به أو اكتب اسماً جديداً:`;
    }

    // Render quick suggestion chips
    renderQuickGroupChips();

    const input = document.getElementById('bulkGroupNameInput');
    if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 80);
    }

    const modal = document.getElementById('bulkGroupModal');
    if (modal) modal.style.display = 'flex';
}

function openBulkGroupModalForSingle(deviceId) {
    window.selectedUsers.clear();
    window.selectedUsers.add(deviceId);
    updateBulkActionBar();
    openBulkGroupModal();
}

function closeBulkGroupModal() {
    const modal = document.getElementById('bulkGroupModal');
    if (modal) modal.style.display = 'none';
}

function renderQuickGroupChips() {
    const container = document.getElementById('quickGroupChipsContainer');
    if (!container) return;

    const usersData = window.SHARK.state.usersData || [];
    const groupCounts = {};
    usersData.forEach(u => {
        if (u.customer_name && u.customer_name.trim()) {
            const name = u.customer_name.trim();
            groupCounts[name] = (groupCounts[name] || 0) + 1;
        }
    });

    const entries = Object.entries(groupCounts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
        container.innerHTML = '<span style="font-size:11px;color:var(--color-text-muted);">لا توجد مجموعات سابقة بعد</span>';
        return;
    }

    container.innerHTML = entries.map(([name, count]) => `
        <span class="customer-tag" style="cursor:pointer;" onclick="selectGroupChip('${escapeHtml(name)}')" title="اختر هذه المجموعة">
            <i class="ri-user-star-line"></i> ${escapeHtml(name)} <small style="opacity:0.8;">(${count})</small>
        </span>
    `).join('') + `
        <span class="customer-tag customer-tag-unassigned" style="cursor:pointer;" onclick="selectGroupChip('')" title="إزالة من المجموعة">
            <i class="ri-close-circle-line"></i> إلغاء التعيين (بدون مجموعة)
        </span>
    `;
}

function selectGroupChip(name) {
    const input = document.getElementById('bulkGroupNameInput');
    if (input) input.value = name;
}

async function confirmBulkGroupAssign() {
    const targetIds = Array.from(window.selectedUsers);
    if (!targetIds.length) {
        showToast('لا توجد هواتف محددة', 'error');
        return;
    }

    const inputVal = document.getElementById('bulkGroupNameInput')?.value.trim();
    const groupName = inputVal ? inputVal : null;

    showLoading(true);
    try {
        const { error } = await window.sb
            .from('devices')
            .update({ customer_name: groupName })
            .in('device_id', targetIds);
        if (error) throw error;

        // Also sync customer_name to licenses for linked devices
        await window.sb
            .from('licenses')
            .update({ customer_name: groupName })
            .in('device_id', targetIds);

        const groupMsg = groupName ? `للمجموعة "${groupName}"` : 'بدون مجموعة';
        showToast(`تم تعيين ${targetIds.length} هواتف ${groupMsg} بنجاح!`, 'success');

        closeBulkGroupModal();
        clearSelectedUsers();
        await loadUsersData();
    } catch (err) {
        console.error("Bulk group assign failure:", err);
        showToast('خطأ في تعيين المجموعة: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ── DISPLAY STANDARD (TABLE & CARDS) ──────────────────────────────────────

function getRemainingBadge(lic, u, mode, now) {
    if (lic) {
        if (!lic.expires_at || lic.duration_days >= 36500) {
            return '<span style="color:var(--color-primary);font-weight:700;">دائم</span>';
        }
        const diff = new Date(lic.expires_at) - now;
        if (diff < 0) {
            return '<span style="color:var(--color-status-danger);font-weight:700;">منتهي</span>';
        }
        const days = Math.floor(diff / 86400000);
        if (days === 0) {
            return '<span style="color:var(--color-status-warning);font-weight:700;">اليوم</span>';
        }
        return `<span>${days} يوم</span>`;
    }
    if (mode === 'free') return '<span style="color:var(--color-primary);font-weight:700;">دائم</span>';
    if (mode === 'trial') {
        const created = u.created_at ? new Date(u.created_at) : new Date();
        const trialEnd = new Date(created.getTime() + 24 * 3600000);
        const diff = trialEnd - now;
        if (diff < 0) return '<span style="color:var(--color-status-danger);font-weight:700;">منتهي</span>';
        return `<span>تجربة (أقل من يوم)</span>`;
    }
    if (mode === 'shutdown') return '<span style="color:var(--color-status-danger);font-weight:700;">موقوف</span>';
    return '<span style="color:var(--color-status-danger);font-weight:700;">منتهي</span>';
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    const cardsContainer = document.getElementById('usersCardsContainer');
    if (!tbody && !cardsContainer) return;

    if (!users.length) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading-cell"><i class="ri-inbox-line"></i> لا يوجد مشتركين</td></tr>';
        if (cardsContainer) cardsContainer.innerHTML = '<div style="text-align:center; padding:36px; color:var(--color-text-muted);"><i class="ri-inbox-line" style="font-size:24px;margin-bottom:8px;display:block;"></i><p>لا يوجد مشتركين</p></div>';
        return;
    }

    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;
    const mode = settingsData?.bot_mode || 'subscription';
    const now = new Date();

    const rowsHtml = [];
    const cardsHtml = [];

    users.forEach((u, i) => {
        const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
        const isOnline = u.last_seen && (now - new Date(u.last_seen)) < 300000;
        const onlineDot = isOnline 
            ? '<span class="online-dot" title="متصل الآن"></span>' 
            : '<span class="offline-dot" title="غير متصل"></span>';
        
        const remainingText = getRemainingBadge(lic, u, mode, now);

        const safeName = escapeHtml(u.device_name || '');
        const safeId = escapeHtml(u.device_id || '');
        const deviceDisplay = safeName || `هاتف (${safeId.substring(0, 8)})`;
        const isChecked = window.selectedUsers.has(u.device_id);

        // Customer Tag
        let customerBadge = '';
        if (u.customer_name && u.customer_name.trim()) {
            const safeCustomer = escapeHtml(u.customer_name.trim());
            customerBadge = `<span class="customer-tag" onclick="quickFilterByCustomer('${safeCustomer}')" title="تصفية هواتف المشترك: ${safeCustomer}"><i class="ri-user-star-line"></i> ${safeCustomer}</span>`;
        } else {
            customerBadge = `<span class="customer-tag customer-tag-unassigned" onclick="openBulkGroupModalForSingle('${safeId}')" title="تعيين هذا الهاتف لمجموعة"><i class="ri-add-line"></i> بدون مجموعة</span>`;
        }

        // Desktop Table Row
        rowsHtml.push(`<tr>
            <td class="device-check-col">
                <input type="checkbox" class="device-checkbox user-row-cb" data-id="${safeId}" ${isChecked ? 'checked' : ''} onchange="toggleUserSelect('${safeId}', this.checked)">
            </td>
            <td style="text-align:center;color:var(--color-text-muted);font-size:11.5px;">${i + 1}</td>
            <td style="font-weight:700;color:var(--color-text-primary);">
                <div style="display:inline-flex;align-items:center;gap:6px;">
                    ${onlineDot}
                    <i class="ri-smartphone-line" style="color:var(--color-primary);"></i>
                    <span>${deviceDisplay}</span>
                </div>
            </td>
            <td>${customerBadge}</td>
            <td>${remainingText}</td>
            <td style="text-align:center;">
                <button class="btn-secondary" style="padding:4px 10px; font-size:12px;" onclick="openUserProfile('${safeId}')" title="إجراءات">
                    <i class="ri-settings-4-line"></i> إجراءات
                </button>
            </td>
        </tr>`);

        // Mobile Card
        cardsHtml.push(`
            <div class="user-mobile-card" style="display:flex; align-items:center; gap:10px;">
                <input type="checkbox" class="device-checkbox user-row-cb" data-id="${safeId}" ${isChecked ? 'checked' : ''} onchange="toggleUserSelect('${safeId}', this.checked)" style="margin-inline-start:4px;">
                <div class="user-card-info" style="flex:1; min-width:0;">
                    <div class="user-card-title">
                        ${onlineDot}
                        <i class="ri-smartphone-line" style="color:var(--color-primary);"></i>
                        <span class="device-name">${deviceDisplay}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:4px; flex-wrap:wrap;">
                        ${customerBadge}
                        <div class="user-card-remaining" style="font-size:11px;">
                            <span class="meta-label">المتبقي:</span> ${remainingText}
                        </div>
                    </div>
                </div>
                <button class="btn-secondary user-actions-btn" onclick="openUserProfile('${safeId}')">
                    <i class="ri-settings-4-line"></i>
                </button>
            </div>
        `);
    });

    if (tbody) tbody.innerHTML = rowsHtml.join('');
    if (cardsContainer) cardsContainer.innerHTML = cardsHtml.join('');
}

// ── DISPLAY GROUPED ACCORDION VIEW ─────────────────────────────────────────

function displayGroupedUsers(users) {
    const container = document.getElementById('usersGroupedContainer');
    if (!container) return;

    if (!users.length) {
        container.innerHTML = '<div style="text-align:center; padding:36px; color:var(--color-text-muted);"><i class="ri-inbox-line" style="font-size:24px;margin-bottom:8px;display:block;"></i><p>لا يوجد مشتركين</p></div>';
        return;
    }

    const codesData = window.SHARK.state.codesData || [];
    const settingsData = window.SHARK.state.settingsData;
    const mode = settingsData?.bot_mode || 'subscription';
    const now = new Date();

    // Group devices by customer_name
    const groupsMap = new Map();
    users.forEach(u => {
        const key = (u.customer_name && u.customer_name.trim()) ? u.customer_name.trim() : 'بدون مجموعة';
        if (!groupsMap.has(key)) {
            groupsMap.set(key, []);
        }
        groupsMap.get(key).push(u);
    });

    // Sort groups: named groups with most devices first, 'بدون مجموعة' at the end
    const sortedGroupKeys = Array.from(groupsMap.keys()).sort((a, b) => {
        if (a === 'بدون مجموعة') return 1;
        if (b === 'بدون مجموعة') return -1;
        return groupsMap.get(b).length - groupsMap.get(a).length;
    });

    const groupsHtml = sortedGroupKeys.map((groupName, gIdx) => {
        const devList = groupsMap.get(groupName);
        const totalCount = devList.length;
        const onlineCount = devList.filter(u => u.last_seen && (now - new Date(u.last_seen)) < 300000).length;
        const isUnassigned = (groupName === 'بدون مجموعة');
        const groupDeviceIdsJson = JSON.stringify(devList.map(d => d.device_id)).replace(/"/g, '&quot;');
        const safeGroupName = escapeHtml(groupName);

        // Find min remaining days across the group
        let minDays = Infinity;
        let hasLifetime = false;
        let hasExpired = false;

        devList.forEach(u => {
            const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
            if (lic) {
                if (!lic.expires_at || lic.duration_days >= 36500) {
                    hasLifetime = true;
                } else {
                    const diff = new Date(lic.expires_at) - now;
                    if (diff < 0) hasExpired = true;
                    else {
                        const d = Math.floor(diff / 86400000);
                        if (d < minDays) minDays = d;
                    }
                }
            } else if (mode === 'free') {
                hasLifetime = true;
            } else {
                hasExpired = true;
            }
        });

        let groupExpiryBadge = '';
        if (hasExpired) {
            groupExpiryBadge = '<span style="color:var(--color-status-danger);font-weight:700;"><i class="ri-alert-line"></i> به هواتف منتهية</span>';
        } else if (minDays < Infinity) {
            groupExpiryBadge = `<span style="color:#60A5FA;">أقرب انتهاء: <b>${minDays} يوم</b></span>`;
        } else if (hasLifetime) {
            groupExpiryBadge = '<span style="color:var(--color-primary);font-weight:700;"><i class="ri-infinity-line"></i> دائم</span>';
        }

        // Inner devices list
        const devRows = devList.map(u => {
            const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
            const isOnline = u.last_seen && (now - new Date(u.last_seen)) < 300000;
            const onlineDot = isOnline 
                ? '<span class="online-dot" title="متصل الآن"></span>' 
                : '<span class="offline-dot" title="غير متصل"></span>';
            const remainingText = getRemainingBadge(lic, u, mode, now);
            const safeName = escapeHtml(u.device_name || '');
            const safeId = escapeHtml(u.device_id || '');
            const deviceDisplay = safeName || `هاتف (${safeId.substring(0, 8)})`;
            const isChecked = window.selectedUsers.has(u.device_id);

            return `
                <div class="group-device-row">
                    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                        <input type="checkbox" class="device-checkbox user-row-cb" data-id="${safeId}" ${isChecked ? 'checked' : ''} onchange="toggleUserSelect('${safeId}', this.checked)">
                        ${onlineDot}
                        <i class="ri-smartphone-line" style="color:var(--color-primary);"></i>
                        <span style="font-weight:600; color:var(--color-text-primary);">${deviceDisplay}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <div>${remainingText}</div>
                        <button class="btn-secondary" style="padding:4px 8px; font-size:11.5px;" onclick="openUserProfile('${safeId}')" title="إجراءات">
                            <i class="ri-settings-4-line"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="group-card" id="groupCard_${gIdx}">
                <div class="group-header" onclick="toggleGroupAccordion(${gIdx})">
                    <div class="group-title-side">
                        <div class="group-icon-avatar" style="${isUnassigned ? 'background:rgba(255,255,255,0.06);color:var(--color-text-muted);' : ''}">
                            <i class="${isUnassigned ? 'ri-folder-unknow-line' : 'ri-user-star-line'}"></i>
                        </div>
                        <div>
                            <h3 class="group-name-text">
                                ${safeGroupName}
                                <span class="badge" style="background:rgba(59,130,246,0.12); color:#60A5FA; font-size:11px; font-weight:700;">${totalCount} هواتف</span>
                                ${onlineCount > 0 ? `<span class="badge badge-active" style="font-size:10.5px;">${onlineCount} متصل</span>` : ''}
                            </h3>
                            <div class="group-stats-sub">
                                ${groupExpiryBadge}
                            </div>
                        </div>
                    </div>
                    <div class="group-actions-side" onclick="event.stopPropagation()">
                        ${!isUnassigned ? `
                            <button class="btn-primary" style="padding:5px 12px; font-size:11.5px; display:inline-flex; align-items:center; gap:5px;" onclick="openRenewModal(${groupDeviceIdsJson}, '${safeGroupName}')" title="تجديد كل هواتف هذا المشترك بنقرة واحدة">
                                <i class="ri-flashlight-line"></i> <span>تجديد المجموعة</span>
                            </button>
                        ` : ''}
                        <button class="btn-secondary" style="padding:5px 10px; font-size:11.5px;" onclick="selectEntireGroup(${groupDeviceIdsJson})" title="تحديد جميع هواتف المجموعة">
                            <i class="ri-checkbox-multiple-line"></i>
                        </button>
                        <i class="ri-arrow-down-s-line group-accordion-icon" id="groupIcon_${gIdx}" style="font-size:18px; color:var(--color-text-muted); transition:transform 0.2s ease;"></i>
                    </div>
                </div>
                <div class="group-body" id="groupBody_${gIdx}">
                    ${devRows}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = groupsHtml;
}

function toggleGroupAccordion(gIdx) {
    const body = document.getElementById(`groupBody_${gIdx}`);
    const icon = document.getElementById(`groupIcon_${gIdx}`);
    if (!body) return;

    if (body.classList.contains('collapsed')) {
        body.classList.remove('collapsed');
        if (icon) icon.style.transform = 'rotate(0deg)';
    } else {
        body.classList.add('collapsed');
        if (icon) icon.style.transform = 'rotate(-90deg)';
    }
}

function selectEntireGroup(deviceIds) {
    if (!Array.isArray(deviceIds)) return;
    deviceIds.forEach(id => window.selectedUsers.add(id));
    document.querySelectorAll('.user-row-cb').forEach(cb => {
        if (window.selectedUsers.has(cb.dataset.id)) cb.checked = true;
    });
    updateBulkActionBar();
    showToast(`تم تحديد ${deviceIds.length} هواتف من المجموعة`, 'info');
}

function quickFilterByCustomer(customerName) {
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.value = customerName;
        applyUserFilter();
        showToast(`تمت تصفية هواتف: ${customerName}`, 'info');
    }
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
        onlineBadge.style.background = isOnline ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)';
        onlineBadge.style.color = isOnline ? 'var(--color-primary)' : 'var(--color-text-muted)';
    }

    const statusBadge = document.getElementById('modalStatusBadge');
    if (statusBadge) {
        const isBanned = user?.status === 'banned';
        statusBadge.textContent = isBanned ? 'محظور' : 'نشط';
        statusBadge.className = isBanned ? 'badge badge-banned' : 'badge badge-active';
    }

    // Customer / Group Input
    const customerInput = document.getElementById('modalCustomerInput');
    if (customerInput) {
        customerInput.value = user?.customer_name || '';
    }

    // Subscription & Expiry
    const subEndEl = document.getElementById('modalSubEnd');
    const remainingEl = document.getElementById('modalRemaining');
    const licenseKeyEl = document.getElementById('modalLicenseKey');

    if (lic) {
        const isLifetime = !lic.expires_at || lic.duration_days >= 36500 || (lic.expires_at && lic.expires_at.startsWith('2099-01-01'));
        if (isLifetime) {
            if (subEndEl) {
                subEndEl.textContent = 'مدى الحياة';
                subEndEl.style.color = 'var(--color-primary)';
            }
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
            blockBtn.querySelector('i').className = 'ri-check-line';
        } else {
            blockBtn.className = 'action-card-btn danger-soft';
            blockLabel.textContent = 'حظر الجهاز';
            blockBtn.querySelector('i').className = 'ri-forbid-line';
        }
    }

    // Reset Delete Confirm
    hideDeleteConfirm();

    const modal = document.getElementById('unifiedUserModal');
    if (modal) modal.style.display = 'flex';
}

async function saveUserCustomerFromModal() {
    if (!currentModalDeviceId) return;
    const input = document.getElementById('modalCustomerInput');
    const name = input ? input.value.trim() : '';
    const newCustomer = name ? name : null;

    showLoading(true);
    try {
        const { error } = await window.sb
            .from('devices')
            .update({ customer_name: newCustomer })
            .eq('device_id', currentModalDeviceId);
        if (error) throw error;

        await window.sb
            .from('licenses')
            .update({ customer_name: newCustomer })
            .eq('device_id', currentModalDeviceId);

        showToast(newCustomer ? `تم ربط الهاتف بالمشترك "${newCustomer}"` : 'تمت إزالة الهاتف من أي مجموعة', 'success');
        await loadUsersData();
    } catch (err) {
        console.error("Save customer error:", err);
        showToast('خطأ في حفظ المشترك: ' + err.message, 'error');
    } finally {
        showLoading(false);
    }
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
    const deviceId = currentModalDeviceId;

    showConfirmDialog('فك كود التفعيل', `هل أنت متأكد من إلغاء كود التفعيل المربوط بجهاز "${name}"؟ سيصبح الكود متاحاً مجدداً.`, async () => {
        if (window.revokeDeviceLicense) {
            await window.revokeDeviceLicense(deviceId);
        }
        closeUserProfile();
    });
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
    showLoading(true);
    try {
        const banMsg = "تم حظر جهازك من استخدام البوت. يرجى مراجعة الإدارة.";
        const { error } = await window.sb.from('devices').update({ status: 'banned', message: banMsg }).eq('device_id', deviceId);
        if (error) throw error;
        showToast('تم حظر الجهاز بنجاح', 'success');
        await loadUsersData();
        window.SHARK.dashboard?.loadDashboardData();
    } catch (err) {
        console.error("Block user error:", err);
        showToast('فشل حظر الجهاز: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

async function unblockUser(deviceId) {
    showLoading(true);
    try {
        const { error } = await window.sb.from('devices').update({ status: 'active' }).eq('device_id', deviceId);
        if (error) throw error;
        showToast('تم رفع الحظر عن الجهاز بنجاح', 'success');
        await loadUsersData();
        window.SHARK.dashboard?.loadDashboardData();
    } catch (err) {
        console.error("Unblock user error:", err);
        showToast('فشل رفع الحظر: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteUser(deviceId) {
    showLoading(true);
    try {
        await window.sb.from('licenses').update({ device_id: null, expires_at: null, status: 'active' }).eq('device_id', deviceId);
        const { error } = await window.sb.from('devices').delete().eq('device_id', deviceId);
        if (error) throw error;
        showToast('تم حذف الجهاز نهائياً بنجاح', 'success');
        await loadUsersData();
        window.SHARK.dashboard?.loadDashboardData();
    } catch (err) {
        console.error("Delete user error:", err);
        showToast('فشل حذف الجهاز: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
    }
}

// ── EVENT LISTENERS ────────────────────────────────────────────────────────

document.getElementById('userFilter')?.addEventListener('change', applyUserFilter);
document.getElementById('userSearch')?.addEventListener('input', applyUserFilter);

document.getElementById('unifiedUserModal')?.addEventListener('click', e => {
    if (e.target.id === 'unifiedUserModal') closeUserProfile();
});

document.getElementById('bulkGroupModal')?.addEventListener('click', e => {
    if (e.target.id === 'bulkGroupModal') closeBulkGroupModal();
});

// ── EXPOSURE FOR GLOBAL ACCESS ─────────────────────────────────────────────

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
window.toggleBlockFromModal = toggleBlockFromModal;
window.revokeFromModal = revokeFromModal;
window.showDeleteConfirm = showDeleteConfirm;
window.hideDeleteConfirm = hideDeleteConfirm;
window.deleteUserFromModal = deleteUserFromModal;
window.blockUser = blockUser;
window.unblockUser = unblockUser;
window.deleteUser = deleteUser;

window.toggleUserSelect = toggleUserSelect;
window.toggleSelectAllUsers = toggleSelectAllUsers;
window.clearSelectedUsers = clearSelectedUsers;
window.toggleUserViewMode = toggleUserViewMode;
window.openBulkGroupModal = openBulkGroupModal;
window.openBulkGroupModalForSingle = openBulkGroupModalForSingle;
window.closeBulkGroupModal = closeBulkGroupModal;
window.confirmBulkGroupAssign = confirmBulkGroupAssign;
window.selectGroupChip = selectGroupChip;
window.selectEntireGroup = selectEntireGroup;
window.quickFilterByCustomer = quickFilterByCustomer;
window.saveUserCustomerFromModal = saveUserCustomerFromModal;
window.toggleGroupAccordion = toggleGroupAccordion;

window.SHARK.users = {
    loadUsersData,
    applyUserFilter,
    displayUsers,
    displayGroupedUsers,
    blockUser,
    unblockUser,
    deleteUser,
    openUserProfile,
    closeUserProfile,
    toggleUserViewMode
};
