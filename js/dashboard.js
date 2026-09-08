/**
 * 🦈 SHARK ADMIN DASHBOARD — DASHBOARD & OVERVIEW
 * Handles top-level KPI metrics, real-time system status banner, and expiry alerts table.
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
                banner.innerHTML = '<i class="fas fa-exclamation-triangle" aria-hidden="true"></i><span>حالة النظام: متوقف — البوت مغلق للصيانة أو الإيقاف التام!</span>';
                banner.className = 'status-banner offline';
            } else if (settings?.bot_mode === 'free') {
                banner.innerHTML = '<i class="fas fa-gift" aria-hidden="true"></i><span>حالة النظام: البوت مجاني بالكامل لجميع المستخدمين حالياً!</span>';
                banner.className = 'status-banner online';
            } else if (settings?.bot_mode === 'trial') {
                banner.innerHTML = '<i class="fas fa-clock" aria-hidden="true"></i><span>حالة النظام: البوت يعمل بفترة تجريبية مجانية 24 ساعة للأجهزة الجديدة.</span>';
                banner.className = 'status-banner online';
            } else {
                banner.innerHTML = '<i class="fas fa-check-circle" aria-hidden="true"></i><span>حالة النظام: متصل ويعمل لجميع المستخدمين المشتركين (وضع الأكواد).</span>';
                banner.className = 'status-banner online';
            }
        }
    } catch (err) {
        console.error("Dashboard metrics load error:", err);
        showToast('خطأ في تحميل بيانات الرئيسية', 'error');
    }
}

// ── EXPIRY TABLE ──────────────────────────────────────────────────────────

function loadExpiryTable() {
    const filterVal = document.getElementById('expiryFilter')?.value || '7';
    const tbody = document.getElementById('expiryTableBody');
    if (!tbody) return;

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
    if (filterVal !== 'all') {
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

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell"><i class="fas fa-check-circle" style="color:var(--success);"></i> لا توجد اشتراكات تنتهي في هذه الفترة</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((r, i) => {
        const { user: u, lic, expiresAt, sourceLabel } = r;
        const safeName = escapeHtml(u.device_name);
        const safeId = escapeHtml(u.device_id);
        const phoneName = safeName || `هاتف (${safeId.substring(0, 8)})`;
        const startDate = lic?.created_at ? formatDate(lic.created_at) : (u.created_at ? formatDate(u.created_at) : '—');
        const endDate   = expiresAt ? formatDate(expiresAt.toISOString()) : '—';
        const remaining = expiresAt ? formatRemainingDays(expiresAt.toISOString()) : '<span style="color:var(--muted);">—</span>';
        const diff = expiresAt ? expiresAt - now : -1;

        let rowStyle = '';
        if (diff < 0) rowStyle = 'style="background:rgba(239,68,68,0.04);"';
        else if (diff < 86400000 * 3) rowStyle = 'style="background:rgba(245,158,11,0.04);"';

        let statusBadge;
        if (diff < 0) statusBadge = '<span class="badge badge-banned">منتهي</span>';
        else if (diff < 86400000 * 3) statusBadge = '<span class="badge badge-expired">⚠️ قريب</span>';
        else statusBadge = '<span class="badge badge-active">نشط</span>';

        let typeBadge = '';
        if (sourceLabel === 'تجربة 24س') typeBadge = '<span style="font-size:9px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);border-radius:4px;padding:1px 5px;margin-right:4px;">تجربة</span>';
        else if (sourceLabel === 'بدون ترخيص') typeBadge = '<span style="font-size:9px;background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);border-radius:4px;padding:1px 5px;margin-right:4px;">بدون</span>';

        return `<tr ${rowStyle}>
            <td style="color:var(--muted);text-align:center;">${i + 1}</td>
            <td style="font-weight:700;color:var(--neon);font-size:12px;">📱 ${phoneName} ${typeBadge}</td>
            <td style="font-size:12px;color:var(--muted);">${startDate}</td>
            <td style="font-size:12px;color:var(--text);">${endDate}</td>
            <td style="text-align:center;">${remaining}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="table-btn details-btn" onclick="openUserDetailsModal('${safeId}')" title="التفاصيل" style="width:auto;padding:0 10px;gap:4px;">
                    <i class="fas fa-info-circle"></i> <span style="font-size:10px;">تفاصيل</span>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// Event Listeners
document.getElementById('expiryFilter')?.addEventListener('change', loadExpiryTable);

window.loadExpiryTable = loadExpiryTable;
window.SHARK.dashboard = {
    loadDashboardData,
    loadExpiryTable
};
