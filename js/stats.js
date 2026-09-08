/**
 * 🦈 SHARK ADMIN DASHBOARD — TELEMETRY & SYSTEM STATS
 * Aggregates bot runtime activity, total envelopes collected, and active telemetry logs.
 */

window.SHARK = window.SHARK || {};

async function loadStatsData() {
    const tbody = document.getElementById('statsTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-cell"><i class="fas fa-circle-notch fa-spin"></i> جاري تحميل الإحصائيات...</td></tr>';
    }

    try {
        const { data, error } = await window.sb.from('devices')
            .select('*')
            .order('total_runs', { ascending: false });

        if (error) throw error;

        if (!tbody) return;

        if (!data || !data.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-cell"><i class="fas fa-inbox"></i> لا توجد بيانات مسجلة</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(d => {
            const statusBadge = d.status === 'active' 
                ? '<span class="badge badge-active">نشط</span>' 
                : '<span class="badge badge-banned">محظور</span>';
            const safeName = escapeHtml(d.device_name || d.device_id);
            const safeId = escapeHtml(d.device_id);

            return `<tr>
                <td style="font-size:13px;font-weight:700;color:var(--neon);" title="${safeId}">
                    📱 ${safeName}
                </td>
                <td>${formatRelative(d.last_seen)}</td>
                <td><b style="color:#f0abfc;">${d.total_runs || 0}</b></td>
                <td><b style="color:#a5b4fc;">${d.total_minutes || 0} د</b></td>
                <td>${statusBadge}</td>
            </tr>`;
        }).join('');
    } catch (err) {
        console.error("Telemetry stats load error:", err);
        showToast('خطأ في تحميل إحصائيات النظام', 'error');
    }
}

window.loadStatsData = loadStatsData;
window.SHARK.stats = {
    loadStatsData
};
