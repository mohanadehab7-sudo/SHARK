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

        // System Status Banner
        const banner = document.getElementById('systemStatusBanner');
        if (banner) {
            if (settings?.is_shutdown || settings?.bot_mode === 'shutdown') {
                banner.innerHTML = '<i class="ri-alert-line" aria-hidden="true"></i><span>حالة النظام: متوقف — البوت مغلق للصيانة أو الإيقاف التام</span>';
                banner.className = 'status-banner offline';
            } else if (settings?.bot_mode === 'free') {
                banner.innerHTML = '<i class="ri-gift-line" aria-hidden="true"></i><span>حالة النظام: البوت مجاني بالكامل لجميع المستخدمين حالياً</span>';
                banner.className = 'status-banner online';
            } else if (settings?.bot_mode === 'trial') {
                banner.innerHTML = '<i class="ri-time-line" aria-hidden="true"></i><span>حالة النظام: البوت يعمل بفترة تجريبية مجانية 24 ساعة للأجهزة الجديدة</span>';
                banner.className = 'status-banner online';
            } else {
                banner.innerHTML = '<i class="ri-checkbox-circle-line" aria-hidden="true"></i><span>حالة النظام: متصل ويعمل لجميع المستخدمين المشتركين</span>';
                banner.className = 'status-banner online';
            }
        }
    } catch (err) {
        console.error("Dashboard metrics load error:", err);
        showToast('خطأ في تحميل بيانات الرئيسية', 'error');
    }
}

// ── EXPIRY ALERT CARDS (ACTION CENTER) ─────────────────────────────────────

function loadExpiryTable() {
    const filterVal = document.getElementById('expiryFilter')?.value || '7';
    const container = document.getElementById('expiryCardsContainer');
    const tbody = document.getElementById('expiryTableBody');
    if (!container && !tbody) return;

    const now = new Date();
    const mode = window.SHARK.state.settingsData?.bot_mode || 'subscription';
    const usersData = window.SHARK.state.usersData || [];
    const codesData = window.SHARK.state.codesData || [];
    let rows = [];

    usersData.forEach(u => {
        const lic = codesData.find(c => c.device_id === u.device_id);
        let expiresAt = null;
        let sourceLabel = '';

        if (lic?.expires_at) {
            expiresAt = new Date(lic.expires_at);
            sourceLabel = 'ترخيص';
        } else if (lic && !lic.expires_at) {
            return; // Lifetime subscription
        } else if (mode === 'trial') {
            const created = u.created_at ? new Date(u.created_at) : null;
            if (!created) return;
            expiresAt = new Date(created.getTime() + 24 * 3600000);
            sourceLabel = 'تجربة 24س';
        } else if (mode === 'free') {
            return;
        } else {
            expiresAt = new Date(0);
            sourceLabel = 'بدون ترخيص';
        }

        rows.push({ user: u, lic, expiresAt, sourceLabel });
    });

    let filtered = rows;
    if (filterVal === 'expired') {
        filtered = rows.filter(r => r.expiresAt && r.expiresAt < now);
    } else if (filterVal !== 'all') {
        const days = parseInt(filterVal);
        const limit = new Date(now.getTime() + days * 86400000);
        filtered = rows.filter(r => r.expiresAt && r.expiresAt <= limit);
    } else {
        filtered = rows.filter(r => r.expiresAt);
    }

    filtered.sort((a, b) => {
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return a.expiresAt - b.expiresAt;
    });

    const countBadge = document.getElementById('expiryCount');
    if (countBadge) countBadge.textContent = `(${filtered.length})`;

    // Render modern action cards
    if (container) {
        if (!filtered.length) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 36px; background: var(--color-surface-card); border: 1px dashed var(--color-border-medium); border-radius: var(--radius-md); color: var(--color-primary);">
                    <i class="ri-checkbox-circle-line" style="font-size: 32px; display: block; margin-bottom: 8px;"></i>
                    <p style="font-weight: 600; font-size: 14px; margin: 0;">لا توجد اشتراكات تحتاج لتجديد عاجل حالياً</p>
                </div>
            `;
        } else {
            container.innerHTML = filtered.map(r => {
                const { user: u, lic, expiresAt } = r;
                const safeName = escapeHtml(u.device_name);
                const safeId = escapeHtml(u.device_id);
                const phoneName = safeName || `هاتف (${safeId.substring(0, 8)})`;
                const endDate = expiresAt ? formatDate(expiresAt.toISOString()) : '—';
                const remaining = expiresAt ? formatRemainingDays(expiresAt.toISOString()) : '—';
                const diff = expiresAt ? expiresAt - now : -1;

                const isUrgent = diff < 86400000 * 2;
                const isWarning = diff >= 86400000 * 2 && diff < 86400000 * 7;
                const cardClass = isUrgent ? 'urgent' : isWarning ? 'warning' : '';

                return `
                    <div class="expiry-card ${cardClass}">
                        <div class="expiry-card-top">
                            <span class="expiry-card-title"><i class="ri-smartphone-line"></i> ${phoneName}</span>
                            <span class="badge ${diff < 0 ? 'badge-banned' : diff < 86400000 * 3 ? 'badge-expired' : 'badge-active'}">
                                ${diff < 0 ? 'منتهي' : 'قريب الانتهاء'}
                            </span>
                        </div>
                        <div class="expiry-card-dates">
                            <div><i class="ri-calendar-line" style="margin-left:4px; opacity:0.7;"></i> الانتهاء: <b>${endDate}</b></div>
                            <div><i class="ri-time-line" style="margin-left:4px; opacity:0.7;"></i> المتبقي: ${remaining}</div>
                        </div>
                        <div class="expiry-card-actions">
                            <button class="btn-success" onclick="openRenewModal('${safeId}')" title="تجديد"><i class="ri-refresh-line"></i> تجديد</button>
                            <button class="btn-secondary" onclick="openMsgModal('${safeId}')" title="رسالة"><i class="ri-chat-3-line"></i> رسالة</button>
                            <button class="btn-secondary" onclick="openUserProfile('${safeId}')" title="عرض التفاصيل"><i class="ri-information-line"></i> عرض</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function quickBroadcastMsg() {
    if (window.openMsgModal) {
        window.openMsgModal('__GLOBAL__');
        const titleEl = document.getElementById('msgModalTitle');
        if (titleEl) titleEl.innerHTML = '<i class="fas fa-bullhorn" aria-hidden="true"></i> إرسال إشعار عام لجميع الهواتف';
    }
}
window.quickBroadcastMsg = quickBroadcastMsg;

// Event Listeners
document.getElementById('expiryFilter')?.addEventListener('change', loadExpiryTable);

window.loadExpiryTable = loadExpiryTable;
window.SHARK.dashboard = {
    loadDashboardData,
    loadExpiryTable,
    quickBroadcastMsg
};
