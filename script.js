// ════════════════════════════════════════════════════
// 🦈 SHARK BOT ADMIN DASHBOARD — SCRIPT V7.1
// ════════════════════════════════════════════════════

const SUPABASE_URL     = 'https://heeessxpeaelsjpvdrgh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ryGLvO2-61uPaP56deCd7A_92IXeM8e';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        detectSessionInUrl: false,
        persistSession: true,
    }
});

// Escape HTML to prevent Stored XSS
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ── STATE ──────────────────────────────────────────
let settingsData = null;
let currentUser = null;
let usersData   = [];
let codesData   = [];
let pendingMsgDeviceId = null;
let renewState  = { deviceId:null, days:30, isLifetime:false, currentSubEnd:null, customExpiryDate:null };
let generatorState = { type:'preset', days:30, expiryDate:null };

// ── DOM REFS ───────────────────────────────────────
const loginScreen    = document.getElementById('loginScreen');
const mainApp        = document.getElementById('mainApp');
const loginError     = document.getElementById('loginError');
const loadingSpinner = document.getElementById('loadingSpinner');

// ══════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    showLoading(true);
    loginError.style.display = 'none';
    try {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        showMainApp();
    } catch (err) {
        loginError.textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
        loginError.style.display = 'block';
    }
    showLoading(false);
});

window.addEventListener('load', async () => {
    const { data: { session } } = await sb.auth.getSession();
    if (session) { currentUser = session.user; showMainApp(); }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    mainApp.style.display = 'none';
    loginScreen.style.display = 'flex';
    currentUser = null;
});

function showMainApp() {
    loginScreen.style.display = 'none';
    mainApp.style.display = 'flex';
    const name = currentUser?.email?.split('@')[0] || 'المدير';
    document.getElementById('welcomeUser').textContent = `مرحباً، ${name}`;
    // نحمل الإعدادات أولاً عشان settingsData يكون جاهز قبل الجداول
    loadAllData();
    loadSettings();
    initCodeGenerator();
    initRenewModal();
}

async function loadAllData() {
    await loadDashboardData();   // يحمل settingsData أولاً
    await loadCodesData();       // يحمل codesData ثانياً
    await loadUsersData();       // يحمل usersData وبيعرض الجدول — codesData جاهز
    loadExpiryTable();
}

// ══════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
        if (btn.dataset.tab === 'stats') loadStatsData();
    });
});

// ══════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════
async function loadDashboardData() {
    try {
        const { data: devices } = await sb.from('devices').select('*');
        const { data: licenses } = await sb.from('licenses').select('status');
        const { data: settings } = await sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
        settingsData = settings || null;

        const now = new Date();
        const total   = devices?.length || 0;
        const active  = devices?.filter(d => (now - new Date(d.last_seen)) < 86400000).length || 0;
        const banned  = devices?.filter(d => d.status === 'banned').length || 0;
        const avail   = licenses?.filter(l => l.status === 'active' && !l.device_id).length || 0;

        document.getElementById('totalUsers').textContent   = total;
        document.getElementById('activeUsers').textContent  = active;
        document.getElementById('blockedUsers').textContent = banned;
        document.getElementById('availableCodes').textContent = avail;

        const banner = document.getElementById('systemStatusBanner');
        if (settings?.is_shutdown || settings?.bot_mode === 'shutdown') {
            banner.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>حالة النظام: متوقف — البوت مغلق للصيانة أو الإيقاف التام!</span>';
            banner.className = 'status-banner offline';
        } else if (settings?.bot_mode === 'free') {
            banner.innerHTML = '<i class="fas fa-gift"></i><span>حالة النظام: البوت مجاني بالكامل لجميع المستخدمين حالياً!</span>';
            banner.className = 'status-banner online';
        } else if (settings?.bot_mode === 'trial') {
            banner.innerHTML = '<i class="fas fa-clock"></i><span>حالة النظام: البوت يعمل بفترة تجريبية مجانية 24 ساعة للأجهزة الجديدة.</span>';
            banner.className = 'status-banner online';
        } else {
            banner.innerHTML = '<i class="fas fa-check-circle"></i><span>حالة النظام: متصل ويعمل لجميع المستخدمين المشتركين (وضع الأكواد).</span>';
            banner.className = 'status-banner online';
        }
    } catch (err) { showToast('خطأ في تحميل بيانات الرئيسية', 'error'); }
}

// Header Global Refresh
document.getElementById('refreshAllBtn')?.addEventListener('click', async () => {
    await loadAllData();
    showToast('تم تحديث البيانات', 'success');
});

// ══════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════
async function loadUsersData() {
    try {
        const { data, error } = await sb.from('devices').select('*').order('created_at', { ascending:false });
        if (error) throw error;
        usersData = data || [];
        applyUserFilter();
    } catch(err) { showToast('خطأ في تحميل المستخدمين', 'error'); }
}

document.getElementById('userFilter').addEventListener('change', applyUserFilter);
document.getElementById('userSearch').addEventListener('input', applyUserFilter);
document.getElementById('refreshUsersBtn').addEventListener('click', async () => {
    await loadCodesData();
    await loadUsersData();
    loadExpiryTable();
});
document.getElementById('msgAllFilteredBtn').addEventListener('click', () => openMsgModal('__BULK__'));

function isUserSubActive(u) {
    if (u.status === 'banned') return false;
    const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
    const mode = settingsData?.bot_mode || 'subscription';
    if (lic) {
        if (!lic.expires_at) return true; // Lifetime
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
    const filter = document.getElementById('userFilter').value;
    const search = document.getElementById('userSearch').value.toLowerCase().trim();
    const now = new Date();
    const DAY = 86400000, WEEK = 604800000;

    let filtered = [...usersData]; // Clone array to avoid mutating global usersData
    if (search) {
        filtered = filtered.filter(u =>
            (u.device_name||'').toLowerCase().includes(search) ||
            (u.device_id||'').toLowerCase().includes(search)
        );
    }
    switch(filter) {
        case 'new_today':   filtered = filtered.filter(u => u.created_at && (now - new Date(u.created_at)) < DAY); break;
        case 'new_week':    filtered = filtered.filter(u => u.created_at && (now - new Date(u.created_at)) < WEEK); break;
        case 'active_sub':  filtered = filtered.filter(u => isUserSubActive(u)); break;
        case 'expired_sub': filtered = filtered.filter(u => !isUserSubActive(u) && u.status !== 'banned'); break;
        case 'blocked':     filtered = filtered.filter(u => u.status === 'banned'); break;
        case 'expiring':    filtered = filtered.filter(u => {
            const lic = codesData.find(c => c.device_id === u.device_id);
            if (!lic?.expires_at) return false;
            const diff = new Date(lic.expires_at) - now;
            return diff > 0 && diff < 3 * DAY;
        }); break;
        case 'lifetime':    filtered = filtered.filter(u => {
            const lic = codesData.find(c => c.device_id === u.device_id);
            return lic && !lic.expires_at;
        }); break;
    }

    // Sort: Active users first, then sort by envelopes (total_runs) descending, then by runtime (total_minutes) descending
    filtered.sort((a, b) => {
        const activeA = isUserSubActive(a);
        const activeB = isUserSubActive(b);
        if (activeA !== activeB) {
            return activeA ? -1 : 1;
        }
        const runsA = a.total_runs || 0;
        const runsB = b.total_runs || 0;
        if (runsA !== runsB) {
            return runsB - runsA;
        }
        const minsA = a.total_minutes || 0;
        const minsB = b.total_minutes || 0;
        return minsB - minsA;
    });

    document.getElementById('filteredCount').textContent = `(${filtered.length})`;
    displayUsers(filtered);
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="loading-cell"><i class="fas fa-inbox"></i> لا يوجد مستخدمون</td></tr>';
        return;
    }
    tbody.innerHTML = users.map((u, i) => {
        const lic = codesData.find(c => c.device_id === u.device_id && c.status !== 'suspended');
        const isOnline = u.last_seen && (new Date() - new Date(u.last_seen)) < 300000;
        const onlineDot = isOnline ? '<span class="online-dot" title="متصل الآن"></span>' : '<span class="offline-dot" title="غير متصل"></span>';
        const statusBadge = u.status === 'active' ? '<span class="badge badge-active">نشط</span>' : '<span class="badge badge-banned">محظور</span>';
        
        let subEnd = '<span class="badge badge-expired">بدون ترخيص</span>';
        let remainingCell = '<span style="color:var(--muted);font-size:11px;">—</span>';

        const mode = settingsData?.bot_mode || 'subscription';

        if (lic) {
            // ── عنده كود مربوط بجهازه ──
            if (!lic.expires_at) {
                subEnd = '<span class="badge badge-lifetime">♾️ مدى الحياة</span>';
                remainingCell = '<span class="badge badge-lifetime" style="font-size:10px;">♾️</span>';
            } else {
                subEnd = formatSubEnd(lic.expires_at);
                remainingCell = formatRemainingDays(lic.expires_at);
            }
        } else if (mode === 'free') {
            // ── وضع مجاني — مفيش انتهاء، مش بيظهر ──
            subEnd = '—';
            remainingCell = '—';
        } else if (mode === 'trial') {
            // ── وضع تجريبي: 24 ساعة من تاريخ التسجيل ──
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
        // subscription بدون كود → يبقى "بدون ترخيص" الافتراضي
        const safeName = escapeHtml(u.device_name || 'غير معروف');
        const safeId = escapeHtml(u.device_id);
        const safeIdShort = safeId.substring(0,12);
        const deviceDisplay = safeName !== 'غير معروف' ? safeName : `هاتف (${safeId.substring(0,8)})`;

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

// ══════════════════════════════════════════════════
// EXPIRY TABLE (DASHBOARD)
// ══════════════════════════════════════════════════
function loadExpiryTable() {
    const filterVal = document.getElementById('expiryFilter')?.value || '7';
    const tbody = document.getElementById('expiryTableBody');
    if (!tbody) return;

    const now = new Date();
    const mode = settingsData?.bot_mode || 'subscription';
    let rows = [];

    // ── بناء قائمة موحدة من كل المستخدمين مع حساب تاريخ الانتهاء الفعلي ──
    usersData.forEach(u => {
        const lic = codesData.find(c => c.device_id === u.device_id);

        let expiresAt = null;
        let sourceLabel = '';

        if (lic?.expires_at) {
            // عنده ترخيص بتاريخ انتهاء
            expiresAt = new Date(lic.expires_at);
            sourceLabel = 'ترخيص';
        } else if (lic && !lic.expires_at) {
            // مدى الحياة — مش بيظهر في جدول الانتهاء
            return;
        } else if (mode === 'trial') {
            // وضع التجربة: 24 ساعة من تاريخ التسجيل
            const created = u.created_at ? new Date(u.created_at) : null;
            if (!created) return;
            expiresAt = new Date(created.getTime() + 24 * 3600000);
            sourceLabel = 'تجربة 24س';
        } else if (mode === 'free') {
            // وضع مجاني — مفيش انتهاء، مش بيظهر
            return;
        } else {
            // وضع subscription بدون ترخيص — بيظهر في "الكل" كمنتهي
            expiresAt = new Date(0); // تاريخ قديم جداً = منتهي
            sourceLabel = 'بدون ترخيص';
        }

        rows.push({ user: u, lic, expiresAt, sourceLabel });
    });

    // ── تطبيق الفلتر ──
    let filtered = rows;
    if (filterVal !== 'all') {
        const days = parseInt(filterVal);
        const limit = new Date(now.getTime() + days * 86400000);
        filtered = rows.filter(r => r.expiresAt && r.expiresAt <= limit);
    } else {
        // في وضع "الكل" نعرض اللي عندهم تاريخ انتهاء فقط
        filtered = rows.filter(r => r.expiresAt);
    }

    // ترتيب من الأقرب للانتهاء
    filtered.sort((a, b) => {
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return a.expiresAt - b.expiresAt;
    });

    document.getElementById('expiryCount').textContent = `(${filtered.length})`;

    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell"><i class="fas fa-check-circle" style="color:var(--success);"></i> لا توجد اشتراكات تنتهي في هذه الفترة</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((r, i) => {
        const { user: u, lic, expiresAt, sourceLabel } = r;
        const safeName = escapeHtml(u.device_name);
        const safeId = escapeHtml(u.device_id);
        const phoneName = safeName || `هاتف (${safeId.substring(0,8)})`;
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

        // بادج نوع الترخيص
        let typeBadge = '';
        if (sourceLabel === 'تجربة 24س') typeBadge = '<span style="font-size:9px;background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);border-radius:4px;padding:1px 5px;margin-right:4px;">تجربة</span>';
        else if (sourceLabel === 'بدون ترخيص') typeBadge = '<span style="font-size:9px;background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);border-radius:4px;padding:1px 5px;margin-right:4px;">بدون</span>';

        return `<tr ${rowStyle}>
            <td style="color:var(--muted);text-align:center;">${i+1}</td>
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

document.getElementById('expiryFilter')?.addEventListener('change', loadExpiryTable);

// ══════════════════════════════════════════════════
// USER DETAILS MODAL
// ══════════════════════════════════════════════════
let detailsCurrentDeviceId = null;

window.openUserDetailsModal = (deviceId) => {
    detailsCurrentDeviceId = deviceId;
    const user = usersData.find(u => u.device_id === deviceId);
    const lic  = codesData.find(c => c.device_id === deviceId);
    const mode = settingsData?.bot_mode || 'subscription';

    // اسم الهاتف
    const phoneName = user?.device_name || `هاتف (${deviceId?.substring(0,8)})`;
    document.getElementById('detailsPhoneName').textContent = '📱 ' + phoneName;

    // حالة المستخدم
    const statusEl = document.getElementById('detailsStatusBadge');
    if (user?.status === 'banned') {
        statusEl.textContent = 'محظور';
        statusEl.className = 'badge badge-banned';
    } else {
        statusEl.textContent = 'نشط';
        statusEl.className = 'badge badge-active';
    }

    // ── حساب تاريخ البداية والانتهاء بناءً على الوضع ──
    const endDateEl      = document.getElementById('detailsEndDate');
    const remainingEl    = document.getElementById('detailsRemaining');
    const startDateEl    = document.getElementById('detailsStartDate');
    const codeEl         = document.getElementById('detailsCode');

    if (lic) {
        // عنده ترخيص فعلي
        startDateEl.textContent = formatDate(lic.created_at || user?.created_at);

        if (!lic.expires_at) {
            // مدى الحياة
            endDateEl.textContent = '♾️ مدى الحياة';
            endDateEl.style.color = '#60a5fa';
            remainingEl.innerHTML = '<span class="badge badge-lifetime">♾️ لا ينتهي</span>';
        } else {
            const diff = new Date(lic.expires_at) - new Date();
            endDateEl.textContent = formatDate(lic.expires_at);
            endDateEl.style.color = diff < 0 ? 'var(--danger)' : diff < 86400000*3 ? 'var(--warning)' : 'var(--text)';
            remainingEl.innerHTML = formatRemainingDays(lic.expires_at);
        }

        codeEl.textContent = lic.license_key;
        codeEl.style.cursor = 'pointer';
        codeEl.title = 'اضغط لنسخ الكود';

    } else if (mode === 'trial') {
        // وضع التجربة — 24 ساعة من تاريخ التسجيل
        const created = user?.created_at ? new Date(user.created_at) : new Date();
        const trialEnd = new Date(created.getTime() + 24 * 3600000);
        const diff = trialEnd - new Date();

        startDateEl.textContent = formatDate(created.toISOString());
        endDateEl.textContent = formatDate(trialEnd.toISOString()) + ' (تجربة)';
        endDateEl.style.color = diff < 0 ? 'var(--danger)' : diff < 3600000*3 ? 'var(--warning)' : '#60a5fa';
        remainingEl.innerHTML = formatRemainingDays(trialEnd.toISOString());
        codeEl.textContent = '— تجربة مجانية —';
        codeEl.style.cursor = 'default';

    } else if (mode === 'free') {
        // وضع مجاني بالكامل
        startDateEl.textContent = user?.created_at ? formatDate(user.created_at) : '—';
        endDateEl.textContent = '🎁 مجاني بالكامل';
        endDateEl.style.color = '#34d399';
        remainingEl.innerHTML = '<span class="badge badge-active" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.4);">لا ينتهي</span>';
        codeEl.textContent = '— وضع مجاني —';
        codeEl.style.cursor = 'default';

    } else {
        // subscription بدون ترخيص
        startDateEl.textContent = user?.created_at ? formatDate(user.created_at) : '—';
        endDateEl.textContent = 'بدون ترخيص';
        endDateEl.style.color = 'var(--muted)';
        remainingEl.innerHTML = '<span class="badge badge-expired">لا يوجد</span>';
        codeEl.textContent = '—';
        codeEl.style.cursor = 'default';
    }

    // Device ID
    document.getElementById('detailsDeviceId').textContent = deviceId || '—';

    document.getElementById('userDetailsModal').style.display = 'flex';
};

window.closeUserDetailsModal = () => {
    document.getElementById('userDetailsModal').style.display = 'none';
    detailsCurrentDeviceId = null;
};

window.copyDetailsCode = () => {
    const code = document.getElementById('detailsCode').textContent;
    if (code && code !== '—') {
        navigator.clipboard.writeText(code);
        showToast('✅ تم نسخ الكود', 'success');
    }
};

window.renewFromDetails = () => {
    if (!detailsCurrentDeviceId) return;
    closeUserDetailsModal();
    openRenewModal(detailsCurrentDeviceId);
};

window.revokeFromDetails = async () => {
    if (!detailsCurrentDeviceId) return;
    const user = usersData.find(u => u.device_id === detailsCurrentDeviceId);
    const name = user?.device_name || `هاتف (${detailsCurrentDeviceId?.substring(0,8)})`;
    if (!confirm(`هل أنت متأكد من إلغاء اشتراك "${name}"؟\nسيتم حذف الكود المرتبط بجهازه.`)) return;
    await revokeDeviceLicense(detailsCurrentDeviceId);
    closeUserDetailsModal();
};

document.getElementById('userDetailsModal')?.addEventListener('click', e => {
    if (e.target.id === 'userDetailsModal') closeUserDetailsModal();
});


async function loadStatsData() {
    try {
        const { data } = await sb.from('devices').select('*').order('total_runs', { ascending:false });
        const tbody = document.getElementById('statsTableBody');
        if (!data?.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">لا توجد بيانات</td></tr>'; return; }
        tbody.innerHTML = data.map(d => {
            const statusBadge = d.status === 'active' ? '<span class="badge badge-active">نشط</span>' : '<span class="badge badge-banned">محظور</span>';
            const safeName = escapeHtml(d.device_name || d.device_id);
            const safeId = escapeHtml(d.device_id);
            return `<tr>
                <td style="font-size:13px;font-weight:700;color:var(--neon);" title="${safeId}">📱 ${safeName}</td>
                <td>${formatRelative(d.last_seen)}</td>
                <td><b style="color:#f0abfc;">${d.total_runs || 0}</b></td>
                <td><b style="color:#a5b4fc;">${d.total_minutes || 0} د</b></td>
                <td>${statusBadge}</td>
            </tr>`;
        }).join('');
    } catch(err) { showToast('خطأ في تحميل الإحصائيات', 'error'); }
}

// ══════════════════════════════════════════════════
// USERS ACTIONS
// ══════════════════════════════════════════════════
window.blockUser = async (deviceId) => {
    const banMsg = "🚫 تم حظر جهازك من استخدام البوت! يرجى التواصل مع المطور للمزيد من التفاصيل عبر الواتساب: https://wa.me/201021102607 أو هاتفياً: 01021102607";
    await sb.from('devices').update({ status:'banned', message: banMsg }).eq('device_id', deviceId);
    showToast('✅ تم الحظر', 'success');
    await loadUsersData(); loadDashboardData();
};
window.unblockUser = async (deviceId) => {
    await sb.from('devices').update({ status:'active' }).eq('device_id', deviceId);
    showToast('✅ تم رفع الحظر', 'success');
    await loadUsersData(); loadDashboardData();
};
window.deleteUser = async (deviceId) => {
    if (!confirm('حذف نهائي؟ لا يمكن التراجع!')) return;
    await sb.from('devices').delete().eq('device_id', deviceId);
    showToast('تم الحذف', 'success');
    await loadUsersData(); loadDashboardData();
};

// ══════════════════════════════════════════════════
// ACTIONS CARD
// ══════════════════════════════════════════════════
let actionsDeviceId = null;
window.actionsDeviceId = null;

window.openActionsCard = (deviceId) => {
    actionsDeviceId = deviceId;
    window.actionsDeviceId = deviceId;
    const user = usersData.find(u => u.device_id === deviceId);
    const lic  = codesData.find(c => c.device_id === deviceId);
    const mode = settingsData?.bot_mode || 'subscription';

    // اسم الهاتف
    const phoneName = user?.device_name || `هاتف (${deviceId?.substring(0,8)})`;
    document.getElementById('actionsPhoneName').textContent = '📱 ' + phoneName;

    // حالة المستخدم
    const statusEl = document.getElementById('actionsStatusBadge');
    if (user?.status === 'banned') {
        statusEl.textContent = 'محظور';
        statusEl.className = 'badge badge-banned';
    } else {
        statusEl.textContent = 'نشط';
        statusEl.className = 'badge badge-active';
    }

    // زر الحظر / رفع الحظر
    const blockBtn   = document.getElementById('actionsBlockBtn');
    const blockLabel = document.getElementById('actionsBlockLabel');
    if (user?.status === 'banned') {
        blockBtn.className   = 'action-card-btn success';
        blockLabel.textContent = 'رفع الحظر';
        blockBtn.querySelector('i').className = 'fas fa-check';
    } else {
        blockBtn.className   = 'action-card-btn danger-soft';
        blockLabel.textContent = 'حظر';
        blockBtn.querySelector('i').className = 'fas fa-ban';
    }

    // معلومات الاشتراك
    const subEndEl    = document.getElementById('actionsSubEnd');
    const remainingEl = document.getElementById('actionsRemaining');

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

    // إعادة ضبط زر الحذف
    const deleteConfirm = document.getElementById('actionsDeleteConfirm');
    const deleteBtn     = document.getElementById('actionsDeleteBtn');
    if (deleteConfirm) deleteConfirm.style.display = 'none';
    if (deleteBtn)     deleteBtn.style.display     = 'flex';

    document.getElementById('actionsModal').style.display = 'flex';
};

window.closeActionsCard = () => {
    document.getElementById('actionsModal').style.display = 'none';
    actionsDeviceId = null;
    window.actionsDeviceId = null;
};

document.getElementById('actionsModal')?.addEventListener('click', e => {
    if (e.target.id === 'actionsModal') closeActionsCard();
});

window.actionsToggleBlock = async () => {
    if (!actionsDeviceId) return;
    const user = usersData.find(u => u.device_id === actionsDeviceId);
    if (user?.status === 'banned') {
        await unblockUser(actionsDeviceId);
    } else {
        await blockUser(actionsDeviceId);
    }
    closeActionsCard();
};

window.actionsAskRevoke = () => {};
window.actionsHideRevoke = () => {};
window.actionsConfirmRevoke = async () => {
    if (!actionsDeviceId) return;
    closeActionsCard();
    await revokeDeviceLicense(actionsDeviceId);
};

// ══════════════════════════════════════════════════
// MESSAGE MODAL
// ══════════════════════════════════════════════════
window.openMsgModal = (deviceId) => {
    pendingMsgDeviceId = deviceId;
    document.getElementById('msgText').value = '';
    document.getElementById('msgModal').style.display = 'flex';
};
window.closeMsgModal = () => { document.getElementById('msgModal').style.display = 'none'; pendingMsgDeviceId = null; };
document.getElementById('msgModal').addEventListener('click', e => { if (e.target.id === 'msgModal') closeMsgModal(); });

window.confirmSendMessage = async () => {
    const msg = document.getElementById('msgText').value.trim();
    if (!msg || !pendingMsgDeviceId) return;
    showLoading(true);
    try {
        if (pendingMsgDeviceId === '__BULK__') {
            // Bulk message to all visible users
            const ids = [...document.querySelectorAll('#usersTableBody tr')].map(row => {
                const btn = row.querySelector('[onclick^="openActionsCard"]');
                return btn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            }).filter(Boolean);
            
            if (ids.length === 0) {
                showToast('⚠️ لا يوجد مستخدمين لإرسال الرسالة لهم', 'warning');
                showLoading(false);
                return;
            }
            
            for (const id of ids) {
                await sb.from('devices').update({ message: msg }).eq('device_id', id);
            }
            showToast(`✅ تم الإرسال لـ ${ids.length} مستخدم`, 'success');
        } else {
            const { error } = await sb.from('devices').update({ message: msg }).eq('device_id', pendingMsgDeviceId);
            if (error) throw error;
            showToast('✅ تم إرسال الرسالة بنجاح', 'success');
        }
    } catch (err) {
        showToast('❌ خطأ في الإرسال: ' + (err.message || err), 'error');
    }
    showLoading(false);
    closeMsgModal();
};

// ══════════════════════════════════════════════════
// SCREENSHOT MODAL
// ══════════════════════════════════════════════════
let currentScreenshotDeviceId = null;
let screenshotInterval = null;

window.openScreenshotModal = async (deviceId) => {
    currentScreenshotDeviceId = deviceId;
    document.getElementById('screenshotModal').style.display = 'flex';
    document.getElementById('screenshotImage').style.display = 'none';
    document.getElementById('screenshotLoader').style.display = 'block';
    document.getElementById('screenshotStatus').textContent = 'جاري طلب الصورة من الهاتف (سيستغرق ثواني معدودة)...';

    try {
        // Request screenshot from DB
        await sb.from('devices').update({ screenshot_requested: true, screenshot_url: '' }).eq('device_id', deviceId);
        
        // Polling every 2 seconds to check if phone uploaded it
        if (screenshotInterval) clearInterval(screenshotInterval);
        screenshotInterval = setInterval(checkScreenshotStatus, 2000);
    } catch(err) {
        showToast('خطأ في الاتصال بالخادم', 'error');
    }
};

window.closeScreenshotModal = () => {
    document.getElementById('screenshotModal').style.display = 'none';
    if (screenshotInterval) clearInterval(screenshotInterval);
    currentScreenshotDeviceId = null;
};
document.getElementById('screenshotModal').addEventListener('click', e => { if (e.target.id === 'screenshotModal') closeScreenshotModal(); });

document.getElementById('refreshScreenshotBtn')?.addEventListener('click', () => {
    if (currentScreenshotDeviceId) openScreenshotModal(currentScreenshotDeviceId);
});

async function checkScreenshotStatus() {
    if (!currentScreenshotDeviceId) return;
    try {
        const { data } = await sb.from('devices').select('screenshot_requested, screenshot_url').eq('device_id', currentScreenshotDeviceId).maybeSingle();
        if (data && data.screenshot_requested === false && data.screenshot_url) {
            // Image is ready!
            document.getElementById('screenshotLoader').style.display = 'none';
            const img = document.getElementById('screenshotImage');
            // Bypass browser cache for new screenshots
            img.src = data.screenshot_url + '?t=' + new Date().getTime();
            img.style.display = 'block';
            document.getElementById('screenshotStatus').textContent = '✅ تم استلام الصورة بنجاح من الهاتف!';
            clearInterval(screenshotInterval);
        }
    } catch (err) {
        console.error("Screenshot polling error", err);
    }
}

// ══════════════════════════════════════════════════
// GALLERY MODAL
// ══════════════════════════════════════════════════
let currentGalleryDeviceId = null;

window.openGalleryModal = async (deviceId) => {
    currentGalleryDeviceId = deviceId;
    document.getElementById('galleryModal').style.display = 'flex';
    await loadGallery();
};

window.closeGalleryModal = () => {
    document.getElementById('galleryModal').style.display = 'none';
    currentGalleryDeviceId = null;
};

document.getElementById('galleryModal').addEventListener('click', e => { if (e.target.id === 'galleryModal') closeGalleryModal(); });
document.getElementById('refreshGalleryBtn')?.addEventListener('click', loadGallery);

async function loadGallery() {
    if (!currentGalleryDeviceId) return;
    const container = document.getElementById('galleryContainer');
    const status = document.getElementById('galleryStatus');
    
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--neon);"><i class="fas fa-circle-notch fa-spin fa-3x"></i><p style="margin-top:15px;">جاري جلب الصور...</p></div>';
    status.textContent = 'جاري البحث في قاعدة البيانات...';
    
    try {
        const { data, error } = await sb.storage.from('screenshots').list('', {
            search: currentGalleryDeviceId,
            sortBy: { column: 'created_at', order: 'desc' }
        });
        
        if (error) throw error;
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--muted);"><i class="fas fa-box-open fa-3x"></i><p style="margin-top:15px;">لا توجد صور مسجلة لهذا الجهاز حتى الآن.</p></div>';
            status.textContent = 'لا توجد صور';
            return;
        }
        
        status.textContent = `تم العثور على ${data.length} صورة`;
        container.innerHTML = data.map(file => {
            const urlData = sb.storage.from('screenshots').getPublicUrl(file.name).data;
            const url = urlData ? urlData.publicUrl : '';
            const dateStr = new Date(file.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'medium' });
            
            return `
                <div style="position:relative; border: 1px solid rgba(0,243,255,0.2); border-radius:8px; overflow:hidden; background:#0a0f18; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    <a href="${url}" target="_blank">
                        <img src="${url}" style="width:100%; height:180px; object-fit:cover; display:block;" onerror="this.src=''" alt="Screenshot">
                    </a>
                    <button onclick="deleteScreenshot('${file.name}')" title="حذف الصورة" style="position:absolute; top:8px; right:8px; background:rgba(220,38,38,0.9); border:none; color:white; border-radius:6px; padding:6px 10px; cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(239,68,68,1)'" onmouseout="this.style.background='rgba(220,38,38,0.9)'">
                        <i class="fas fa-trash"></i>
                    </button>
                    <div style="position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.8); backdrop-filter: blur(4px); color:#a5b4fc; font-size:12px; font-family:'JetBrains Mono',monospace; text-align:center; padding:6px 2px; border-top: 1px solid rgba(0,243,255,0.1);">
                        ${dateStr}
                    </div>
                </div>
            `;
        }).join('');
    } catch(err) {
        status.textContent = 'حدث خطأ أثناء الاتصال بالخادم لجلب الصور.';
        container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: #ef4444;"><i class="fas fa-exclamation-triangle fa-2x"></i><p>فشل تحميل الصور</p></div>';
    }
}

window.deleteScreenshot = async (fileName) => {
    if (!confirm('هل أنت متأكد من حذف هذه الصورة نهائياً؟')) return;
    try {
        const { error } = await sb.storage.from('screenshots').remove([fileName]);
        if (error) throw error;
        showToast('✅ تم حذف الصورة بنجاح', 'success');
        loadGallery();
    } catch(err) {
        showToast('❌ خطأ في حذف الصورة', 'error');
    }
};

window.deleteAllScreenshots = async () => {
    if (!currentGalleryDeviceId) return;
    if (!confirm('⚠️ تحذير: هل أنت متأكد من حذف جميع صور هذا الجهاز نهائياً؟ لا يمكن التراجع!')) return;
    
    document.getElementById('galleryStatus').textContent = 'جاري الحذف...';
    try {
        const { data } = await sb.storage.from('screenshots').list('', { search: currentGalleryDeviceId });
        if (data && data.length > 0) {
            const filesToRemove = data.map(f => f.name);
            await sb.storage.from('screenshots').remove(filesToRemove);
            showToast(`✅ تم حذف ${filesToRemove.length} صورة بنجاح`, 'success');
            loadGallery();
        } else {
            showToast('لا توجد صور للحذف', 'info');
        }
    } catch(err) {
        showToast('❌ خطأ في الحذف الجماعي', 'error');
    }
};

// ══════════════════════════════════════════════════
// RENEW MODAL
// ══════════════════════════════════════════════════
window.openRenewModal = (deviceId) => {
    const lic  = codesData.find(c => c.device_id === deviceId);
    const user = usersData.find(u => u.device_id === deviceId);

    renewState = { deviceId, days: 30, isLifetime: false, currentSubEnd: lic?.expires_at || null, customExpiryDate: null };

    // عرض اسم الهاتف والاشتراك الحالي
    const nameEl    = document.getElementById('renewUserName');
    const safeName   = escapeHtml(user?.device_name);
    const safeId     = escapeHtml(deviceId);
    const phoneName  = safeName || `هاتف (${safeId.substring(0,8)})`;
    if (lic?.expires_at) {
        const diff     = new Date(lic.expires_at) - new Date();
        const daysLeft = Math.ceil(diff / 86400000);
        nameEl.innerHTML = `📱 <b style="color:var(--neon)">${phoneName}</b> &nbsp;|&nbsp;
            ينتهي: <b style="color:${diff < 0 ? 'var(--danger)' : 'var(--text)'}">${formatDate(lic.expires_at)}</b>
            <span style="color:var(--muted);font-size:11px;">${diff > 0 ? `(${daysLeft} يوم متبقي)` : '(منتهي)'}</span>`;
    } else if (lic && !lic.expires_at) {
        nameEl.innerHTML = `📱 <b style="color:var(--neon)">${phoneName}</b> &nbsp;|&nbsp; <span style="color:#60a5fa;">♾️ مدى الحياة حالياً</span>`;
    } else {
        nameEl.innerHTML = `📱 <b style="color:var(--neon)">${phoneName}</b> &nbsp;|&nbsp; <span style="color:var(--muted);">لا يوجد اشتراك</span>`;
    }

    // إعادة ضبط الأزرار والحقول
    document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.renew-preset-btn[data-days="30"]')?.classList.add('active');
    const cv = document.getElementById('renewCustomValue');
    const pk = document.getElementById('renewCustomDatePicker');
    if (cv) cv.value = '';
    if (pk) pk.value = '';

    updateRenewInfo();
    document.getElementById('renewModal').style.display = 'flex';
};

window.closeRenewModal = () => { document.getElementById('renewModal').style.display = 'none'; };
document.getElementById('renewModal').addEventListener('click', e => { if (e.target.id === 'renewModal') closeRenewModal(); });

function initRenewModal() {
    // أزرار المدد الجاهزة
    document.querySelectorAll('.renew-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const d = parseInt(btn.dataset.days);
            renewState.isLifetime       = (d === 0);
            renewState.days             = d;
            renewState.customExpiryDate = null;
            const cv = document.getElementById('renewCustomValue');
            const pk = document.getElementById('renewCustomDatePicker');
            if (cv) cv.value = '';
            if (pk) pk.value = '';
            updateRenewInfo();
        });
    });

    // مدة مخصصة بالأرقام
    document.getElementById('renewCustomValue')?.addEventListener('input', onRenewCustomChange);
    document.getElementById('renewCustomUnit')?.addEventListener('change',  onRenewCustomChange);

    // تاريخ انتهاء يدوي
    document.getElementById('renewCustomDatePicker')?.addEventListener('change', () => {
        const val = document.getElementById('renewCustomDatePicker').value;
        if (!val) return;
        document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
        const cv = document.getElementById('renewCustomValue');
        if (cv) cv.value = '';
        renewState.isLifetime       = false;
        renewState.days             = null;
        renewState.customExpiryDate = val;
        updateRenewInfo();
    });
}

function onRenewCustomChange() {
    const valInput = document.getElementById('renewCustomValue');
    const val = parseInt(valInput?.value);
    if (!val || val < 1) return;
    const unit = document.getElementById('renewCustomUnit').value;
    document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
    const pk = document.getElementById('renewCustomDatePicker');
    if (pk) pk.value = '';
    renewState.isLifetime       = false;
    renewState.customExpiryDate = null;
    if (unit === 'hours') {
        renewState.days      = val / 24;
        renewState.customHours = val;
    } else if (unit === 'months') {
        renewState.days      = val * 30;
        renewState.customHours = null;
    } else {
        renewState.days      = val;
        renewState.customHours = null;
    }
    updateRenewInfo();
}

function updateRenewInfo() {
    const el = document.getElementById('renewInfoText');
    if (!el) return;

    if (renewState.isLifetime) {
        el.innerHTML = '♾️ سيكون اشتراكه <b>مدى الحياة</b> — لن ينتهي أبداً';
        return;
    }
    if (renewState.customExpiryDate) {
        const d = new Date(renewState.customExpiryDate);
        el.innerHTML = `📅 سينتهي في: <b style="color:var(--neon)">${d.toLocaleDateString('ar-EG', {year:'numeric',month:'long',day:'numeric'})}</b> (تاريخ محدد يدوياً)`;
        return;
    }
    if (!renewState.days) { el.textContent = 'اختر مدة أو تاريخ'; return; }

    const now  = new Date();
    const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now
        ? new Date(renewState.currentSubEnd) : now;
    const end  = new Date(base.getTime() + renewState.days * 86400000);
    const isExtend = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now;
    el.innerHTML = `${isExtend ? '➕ تمديد — ' : '🆕 يبدأ من الآن — '}سينتهي في: <b style="color:var(--neon)">${end.toLocaleDateString('ar-EG', {year:'numeric',month:'long',day:'numeric'})}</b>`;
}

// ── DROPDOWN ACTION MENU ──────────────────────────
window.toggleActionMenu = (deviceId) => {
    const menu = document.getElementById(`menu_${deviceId}`);
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    closeAllMenus();
    if (!isOpen) menu.classList.add('open');
};

window.closeAllMenus = () => {
    document.querySelectorAll('.action-menu.open').forEach(m => m.classList.remove('open'));
};

// إغلاق عند الضغط خارج القائمة
document.addEventListener('click', e => {
    if (!e.target.closest('.action-dropdown')) closeAllMenus();
});

// تأكيد إلغاء الاشتراك inline
window.askRevoke = (deviceId) => {
    document.getElementById(`revoke_${deviceId}`).style.display = 'block';
    document.getElementById(`revokeBtn_${deviceId}`).style.display = 'none';
};
window.cancelRevoke = (deviceId) => {
    document.getElementById(`revoke_${deviceId}`).style.display = 'none';
    document.getElementById(`revokeBtn_${deviceId}`).style.display = 'flex';
};
window.confirmRevoke = async (deviceId) => {
    closeAllMenus();
    await revokeDeviceLicense(deviceId);
};

// إلغاء اشتراك جهاز — الدالة المشتركة
async function revokeDeviceLicense(deviceId) {
    showLoading(true);
    try {
        const lic = codesData.find(c => c.device_id === deviceId);
        if (!lic) {
            showToast('هذا الجهاز ليس لديه اشتراك أصلاً', 'info');
            showLoading(false);
            return;
        }
        // فك ارتباط الكود بالجهاز بالـ id مش device_id عشان بنعمله null
        const { error } = await sb.from('licenses')
            .update({ device_id: null, expires_at: null, status: 'active' })
            .eq('id', lic.id);

        if (error) throw error;

        showToast('✅ تم إلغاء الاشتراك — الكود أصبح متاحاً مجدداً', 'success');
        await Promise.all([loadCodesData(), loadUsersData(), loadDashboardData()]);
        loadExpiryTable();
    } catch(err) {
        showToast('خطأ في إلغاء الاشتراك: ' + err.message, 'error');
    }
    showLoading(false);
}

window.confirmRenew = async () => {
    if (!renewState.deviceId) return;
    if (!renewState.isLifetime && !renewState.customExpiryDate && !renewState.days) {
        showToast('اختر مدة التجديد أولاً', 'error');
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
            const now  = new Date();
            const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now
                ? new Date(renewState.currentSubEnd) : now;
            newEnd = new Date(base.getTime() + renewState.customHours * 3600000).toISOString();
        } else {
            const now  = new Date();
            const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now
                ? new Date(renewState.currentSubEnd) : now;
            newEnd = new Date(base.getTime() + renewState.days * 86400000).toISOString();
        }

        const lic = codesData.find(c => c.device_id === renewState.deviceId);
        if (lic) {
            await sb.from('licenses').update({ expires_at: newEnd, status: 'active' }).eq('device_id', renewState.deviceId);
        } else {
            const p1 = Math.random().toString(36).substring(2,6).toUpperCase();
            const p2 = Math.random().toString(36).substring(2,6).toUpperCase();
            await sb.from('licenses').insert([{
                license_key: `SHARK-DIRECT-${p1}-${p2}`,
                device_id:   renewState.deviceId,
                expires_at:  newEnd,
                status:      'active'
            }]);
        }

        showToast('✅ تم تجديد الاشتراك بنجاح', 'success');
        closeRenewModal();
        await Promise.all([loadCodesData(), loadUsersData(), loadDashboardData()]);
        loadExpiryTable();
    } catch(err) { showToast('خطأ في التجديد: ' + err.message, 'error'); }
    showLoading(false);
};

// ══════════════════════════════════════════════════
// CODES
// ══════════════════════════════════════════════════
async function loadCodesData() {
    try {
        const { data, error } = await sb.from('licenses').select('*').order('created_at', { ascending:false });
        if (error) throw error;
        codesData = data || [];
        applyCodesFilter();
    } catch(err) { showToast('خطأ في تحميل الأكواد', 'error'); }
}

function applyCodesFilter() {
    const filter = document.getElementById('codesFilter')?.value || 'all';
    let filtered = codesData;
    if (filter === 'available') filtered = codesData.filter(c => !c.device_id && c.status === 'active');
    else if (filter === 'used')  filtered = codesData.filter(c => c.device_id);
    else if (filter === 'trial') filtered = codesData.filter(c => {
        if (!c.expires_at) return false;
        const created = new Date(c.created_at);
        const expires = new Date(c.expires_at);
        const diffHours = (expires - created) / 3600000;
        return diffHours <= 6; // أقل من 6 ساعات = trial
    });
    else if (filter === 'lifetime') filtered = codesData.filter(c => !c.expires_at);
    document.getElementById('codesCount').textContent = `(${filtered.length})`;
    displayCodes(filtered);
}

function displayCodes(codes) {
    const tbody = document.getElementById('codesTableBody');
    if (!codes.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">لا توجد أكواد</td></tr>'; return; }
    tbody.innerHTML = codes.map((c, i) => {
        const isUsed     = !!c.device_id;
        const isLifetime = !c.expires_at;
        // كود trial = الفرق بين الإنشاء والانتهاء أقل من 6 ساعات
        const isTrial    = c.expires_at && ((new Date(c.expires_at) - new Date(c.created_at)) / 3600000) <= 6;
        const statusBadge = c.status === 'suspended'
            ? '<span class="badge badge-banned">موقوف</span>'
            : isUsed
                ? '<span class="badge badge-active">مستخدم</span>'
                : '<span class="badge badge-expired">متاح</span>';

        // عمود المدة — نص واضح بدون تاريخ
        let durationText;
        if (isTrial) {
            durationText = '<span style="background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.35);border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">⚡ 3 ساعات</span>';
        } else if (isLifetime) {
            durationText = '<span style="background:rgba(59,130,246,0.1);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);border-radius:6px;padding:3px 10px;font-size:12px;font-weight:700;">♾️ مدى الحياة</span>';
        } else if (c.duration_label) {
            // عنده label محفوظ — استخدمه مباشرة
            durationText = `<span style="font-size:13px;color:var(--text);font-weight:600;">${c.duration_label}</span>`;
        } else if (c.expires_at) {
            // احسب المدة من تاريخ الإنشاء وتاريخ الانتهاء
            const created  = new Date(c.created_at);
            const expires  = new Date(c.expires_at);
            const diffMs   = expires - created;
            const diffHours = diffMs / 3600000;
            const diffDays  = diffMs / 86400000;
            let label;
            if (diffHours <= 6)        label = '⚡ 3 ساعات';
            else if (diffHours <= 25)  label = '🕐 24 ساعة';
            else if (Math.round(diffDays) === 7)  label = '📅 أسبوع';
            else if (Math.round(diffDays) === 30) label = '📆 شهر';
            else if (Math.round(diffDays) === 90) label = '📆 3 شهور';
            else                       label = `📆 ${Math.round(diffDays)} يوم`;
            durationText = `<span style="font-size:13px;color:var(--text);font-weight:600;">${label}</span>`;
        } else {
            durationText = '<span style="color:var(--muted);">—</span>';
        }

        return `<tr>
            <td style="color:var(--muted);">${i+1}</td>
            <td style="font-family:'JetBrains Mono',monospace;color:var(--neon);font-size:13px;">
                ${c.license_key}
                <button onclick="navigator.clipboard.writeText('${c.license_key}');showToast('✅ تم نسخ الكود','success')" title="نسخ الكود" style="background:rgba(0,243,255,0.1);border:1px solid rgba(0,243,255,0.2);color:var(--neon);border-radius:5px;padding:2px 7px;cursor:pointer;font-size:11px;margin-right:6px;"><i class="fas fa-copy"></i></button>
            </td>
            <td>${durationText}</td>
            <td>${statusBadge}</td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);">${c.device_id ? c.device_id.substring(0,12)+'...' : '-'}</td>
            <td style="font-size:12px;color:var(--muted);">${c.expires_at ? formatDate(c.expires_at) : '♾️'}</td>
            <td>
                ${c.status === 'active'
                    ? `<button class="table-btn block" onclick="suspendCode('${c.id}')" title="إيقاف مؤقت"><i class="fas fa-pause"></i></button>`
                    : `<button class="table-btn unblock" onclick="activateCode('${c.id}')" title="إعادة تفعيل"><i class="fas fa-play"></i></button>`
                }
                <button class="table-btn delete" onclick="deleteCode('${c.id}')" title="حذف"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

document.getElementById('codesFilter')?.addEventListener('change', applyCodesFilter);
document.getElementById('refreshCodesBtn')?.addEventListener('click', loadCodesData);
document.getElementById('copyAvailableBtn')?.addEventListener('click', () => {
    const available = codesData.filter(c => !c.device_id && c.status === 'active').map(c => c.license_key).join('\n');
    navigator.clipboard.writeText(available);
    showToast(`✅ تم نسخ ${codesData.filter(c=>!c.device_id).length} كود`, 'success');
});

window.suspendCode = async (id) => {
    await sb.from('licenses').update({ status:'suspended' }).eq('id', id);
    showToast('تم إيقاف الكود مؤقتاً', 'info');
    loadCodesData();
};
window.activateCode = async (id) => {
    await sb.from('licenses').update({ status:'active' }).eq('id', id);
    showToast('✅ تم إعادة تفعيل الكود', 'success');
    loadCodesData();
};
window.deleteCode = async (id) => {
    if (!confirm('حذف الكود نهائياً؟')) return;
    await sb.from('licenses').delete().eq('id', id);
    showToast('تم حذف الكود', 'success');
    loadCodesData();
};

// ══════════════════════════════════════════════════
// CODE GENERATOR
// ══════════════════════════════════════════════════
function initCodeGenerator() {
    document.querySelectorAll('.dtype-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dtype-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            generatorState.type = btn.dataset.type;
            ['preset','custom','date','lifetime'].forEach(t => {
                const el = document.getElementById(t+'Panel');
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
            generatorState.isTrial = generatorState.days === 0.125; // 3 hours
            updateSummary();
        });
    });
    document.getElementById('customValue')?.addEventListener('input', updateCustom);
    document.getElementById('customUnit')?.addEventListener('change', updateCustom);
    const expiry = document.getElementById('expiryDate');
    if (expiry) {
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
        expiry.min = tomorrow.toISOString().split('T')[0];
        expiry.addEventListener('change', () => {
            generatorState.expiryDate = expiry.value;
            const diffMs   = new Date(expiry.value) - new Date();
            const diffDays = Math.ceil(diffMs / 86400000);
            generatorState.days = diffDays;
            generatorState.customHours = null;
            document.getElementById('datePreview').textContent = `بعد ${diffDays} يوم`;
            updateSummary();
        });
    }
    document.getElementById('generateCodesMainBtn').addEventListener('click', generateCodes);
    document.getElementById('codeCount')?.addEventListener('input', updateSummary);
    updateSummary();
}
function updateCustom() {
    const valInput = document.getElementById('customValue');
    let val = parseInt(valInput?.value) || 1;
    const unit = document.getElementById('customUnit')?.value;
    
    // Validate ranges per unit
    if (unit === 'hours'  && val > 8760) { val = 8760; if(valInput) valInput.value = 8760; } // max 1 year in hours
    if (unit === 'days'   && val > 3650) { val = 3650; if(valInput) valInput.value = 3650; } // max 10 years
    if (unit === 'months' && val > 120)  { val = 120;  if(valInput) valInput.value = 120;  } // max 10 years
    if (val < 1) { val = 1; if(valInput) valInput.value = 1; }

    // Convert to fractional days for internal use
    if (unit === 'hours') {
        generatorState.days = val / 24;
        generatorState.customHours = val;
        document.getElementById('customPreview').textContent = `= ${val} ساعة`;
    } else if (unit === 'months') {
        generatorState.days = val * 30;
        generatorState.customHours = null;
        document.getElementById('customPreview').textContent = `= ${generatorState.days} يوم (${val} شهر)`;
    } else {
        generatorState.days = val;
        generatorState.customHours = null;
        document.getElementById('customPreview').textContent = `= ${val} يوم`;
    }
    updateSummary();
}
function updateSummary() {
    const count = parseInt(document.getElementById('codeCount')?.value) || 1;
    const type = generatorState.type;
    let dur;
    if (type === 'lifetime') {
        dur = '♾️ مدى الحياة';
    } else if (type === 'preset' && generatorState.days === 0.125) {
        dur = '⚡ 3 ساعات تجربة';
    } else if (type === 'date' && generatorState.expiryDate) {
        dur = `حتى ${new Date(generatorState.expiryDate).toLocaleDateString('ar-EG')}`;
    } else if (generatorState.customHours) {
        dur = `${generatorState.customHours} ساعة`;
    } else {
        const d = generatorState.days || 30;
        dur = d >= 30 && d % 30 === 0 ? `${d/30} شهر` : `${d} يوم`;
    }
    document.getElementById('summaryText').textContent = `سيتم توليد ${count} كود ${count>1?'صالحة':'صالح'} لـ ${dur}`;
}
window.adjustCount = (d) => {
    const el = document.getElementById('codeCount');
    el.value = Math.max(1, Math.min(100, parseInt(el.value)+d));
    updateSummary();
};
window.setCount = (n) => { document.getElementById('codeCount').value = n; updateSummary(); };

async function generateCodes() {
    const count = parseInt(document.getElementById('codeCount')?.value) || 1;
    showLoading(true);
    try {
        const rows = [];
        for (let i = 0; i < count; i++) {
            const key = `SHARK-${rndStr()}-${rndStr()}`;
            let expiresAt;
            if (generatorState.type === 'lifetime') {
                expiresAt = null;
            } else if (generatorState.type === 'date' && generatorState.expiryDate) {
                expiresAt = new Date(generatorState.expiryDate + 'T23:59:59').toISOString();
            } else if (generatorState.customHours) {
                // مدة بالساعات
                expiresAt = new Date(Date.now() + generatorState.customHours * 3600000).toISOString();
            } else {
                // مدة بالأيام (أو preset)
                const ms = (generatorState.days || 30) * 86400000;
                expiresAt = new Date(Date.now() + ms).toISOString();
            }
            rows.push({ license_key: key, expires_at: expiresAt, status: 'active' });
        }
        const { error } = await sb.from('licenses').insert(rows);
        if (error) throw error;
        showToast(`✅ تم توليد ${count} كود بنجاح!`, 'success');
        loadCodesData(); loadDashboardData();
    } catch(err) { showToast('خطأ في توليد الأكواد: '+err.message, 'error'); }
    showLoading(false);
}

async function generateBulkCodes(count, days) {
    showLoading(true);
    try {
        const rows = Array.from({length:count}, () => ({
            license_key: `SHARK-${rndStr()}-${rndStr()}`,
            expires_at: new Date(Date.now() + days*86400000).toISOString(),
            status: 'active'
        }));
        await sb.from('licenses').insert(rows);
        showToast(`✅ تم توليد ${count} كود (${days} يوم)`, 'success');
        loadCodesData(); loadDashboardData();
    } catch(err) { showToast('خطأ: '+err.message, 'error'); }
    showLoading(false);
}

function rndStr() { return Math.random().toString(36).substring(2,6).toUpperCase(); }

// ══════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════
async function loadSettings() {
    try {
        const { data } = await sb.from('app_settings').select('*').eq('id',1).maybeSingle();
        if (data) {
            settingsData = data;
            document.getElementById('botMode').value = data.bot_mode || 'subscription';
            document.getElementById('globalMessage').value = data.global_message || '';
            document.getElementById('trialHours').value = data.trial_hours || 24;
            // إظهار/إخفاء حقل ساعات التجربة
            const trialItem = document.getElementById('trialHoursItem');
            if (trialItem) trialItem.style.display = data.bot_mode === 'trial' ? 'block' : 'none';
        }
    } catch {}
}

// إظهار/إخفاء حقل ساعات التجربة عند تغيير الوضع
document.getElementById('botMode')?.addEventListener('change', () => {
    const trialItem = document.getElementById('trialHoursItem');
    if (trialItem) trialItem.style.display = document.getElementById('botMode').value === 'trial' ? 'block' : 'none';
});

document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    const bot_mode = document.getElementById('botMode').value;
    const is_shutdown = bot_mode === 'shutdown';
    const global_message = document.getElementById('globalMessage').value;
    
    showLoading(true);
    try {
        // We do not upsert trial_hours because the column does not exist in the app_settings database table
        const { error } = await sb.from('app_settings').upsert({ 
            id: 1, 
            is_shutdown, 
            bot_mode, 
            global_message 
        });
        
        if (error) throw error;
        
        showToast('✅ تم حفظ الإعدادات بنجاح', 'success');
        await loadDashboardData();
    } catch (err) {
        showToast('❌ فشل حفظ الإعدادات: ' + err.message, 'error');
        console.error(err);
    }
    showLoading(false);
});
document.getElementById('deleteUnusedCodesBtn')?.addEventListener('click', async () => {
    if (!confirm('حذف جميع الأكواد غير المستخدمة؟')) return;
    await sb.from('licenses').delete().is('device_id', null);
    showToast('✅ تم حذف الأكواد غير المستخدمة', 'success');
    loadCodesData();
});
document.getElementById('cleanEmulatorsBtn')?.addEventListener('click', async () => {
    if (!confirm('هل أنت متأكد من تنظيف وحذف جميع أجهزة المحاكاة واختبارات جوجل من قاعدة البيانات؟ لن يتم لمس أي جهاز مرتبط بكود تفعيل.')) return;
    showLoading(true);
    try {
        const { data: devices, error: devError } = await sb.from('devices').select('*');
        if (devError) throw devError;

        const { data: licenses, error: licError } = await sb.from('licenses').select('device_id');
        if (licError) throw licError;

        const licensedDeviceIds = new Set(licenses.map(l => l.device_id).filter(id => id));

        const emulatorsToDelete = devices.filter(d => {
            const name = (d.device_name || '').toLowerCase();
            const id = d.device_id;
            
            const isEmulator = name.includes('nexus 5x') || 
                               name.includes('qemu') || 
                               name.includes('generic') || 
                               name.includes('unknown') || 
                               name.includes('emulator') || 
                               name.includes('virtual');

            return isEmulator && !licensedDeviceIds.has(id);
        });

        if (emulatorsToDelete.length === 0) {
            showToast('ℹ️ لم يتم العثور على أجهزة محاكاة لحذفها.', 'info');
            showLoading(false);
            return;
        }

        const idsToDelete = emulatorsToDelete.map(e => e.device_id);

        await sb.from('licenses').delete().in('device_id', idsToDelete);

        const { error: deleteError } = await sb.from('devices').delete().in('device_id', idsToDelete);
        if (deleteError) throw deleteError;

        showToast(`✅ تم تنظيف ${emulatorsToDelete.length} جهاز محاكاة بنجاح!`, 'success');
        await loadAllData();
    } catch (err) {
        console.error(err);
        showToast('❌ حدث خطأ أثناء تنظيف أجهزة المحاكاة', 'error');
    }
    showLoading(false);
});
document.getElementById('resetAllUsersBtn')?.addEventListener('click', async () => {
    if (!confirm('إعادة تعيين جميع المستخدمين؟ لا يمكن التراجع!')) return;
    await sb.from('devices').update({ total_runs:0, total_minutes:0 }).neq('device_id','');
    showToast('✅ تم إعادة تعيين الإحصائيات', 'success');
    loadUsersData();
});

// ══════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════
function showLoading(show) { loadingSpinner.style.display = show ? 'flex' : 'none'; }

function showToast(msg, type='info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icon = type==='success' ? 'fa-check-circle' : type==='error' ? 'fa-times-circle' : 'fa-info-circle';
    t.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
    document.getElementById('toastContainer').appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

function formatRelative(dateStr) {
    if (!dateStr) return '-';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 60) return '<span style="color:var(--success);font-weight:700;">الآن</span>';
    if (diff < 3600) return `منذ ${Math.floor(diff/60)} د`;
    if (diff < 86400) return `منذ ${Math.floor(diff/3600)} س`;
    return `منذ ${Math.floor(diff/86400)} يوم`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' });
}

function formatSubEnd(dateStr) {
    if (!dateStr) return '<span class="badge badge-lifetime">♾️ مدى الحياة</span>';
    const now = new Date(), d = new Date(dateStr);
    const diff = d - now;
    if (diff < 0) return '<span class="badge badge-banned">منتهي</span>';
    if (diff < 86400000) return `<span class="badge badge-expired">⚠️ ${formatDate(dateStr)}</span>`;
    return `<span style="font-size:11px;color:var(--muted);">${formatDate(dateStr)}</span>`;
}

function formatMins(mins) {
    if (mins >= 60) return `${Math.floor(mins/60)}س ${mins%60}د`;
    return `${mins}د`;
}

function formatRemainingDays(dateStr) {
    if (!dateStr) return '—';
    const now = new Date();
    const end = new Date(dateStr);
    const diff = end - now;
    if (diff < 0) {
        const days = Math.abs(Math.floor(diff / 86400000));
        return `<span style="color:var(--danger);font-weight:700;font-size:11px;">منتهي منذ ${days}ي</span>`;
    }
    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000) / 60000);
    if (days === 0 && hours === 0) return `<span style="color:var(--danger);font-weight:700;font-size:11px;">${mins}د فقط</span>`;
    if (days === 0) return `<span style="color:var(--warning);font-weight:700;font-size:11px;">${hours}س ${mins}د</span>`;
    if (days <= 3)  return `<span style="color:var(--warning);font-weight:700;font-size:11px;">${days}ي ${hours}س</span>`;
    if (days <= 7)  return `<span style="color:#fbbf24;font-size:11px;">${days} أيام</span>`;
    return `<span style="color:var(--success);font-size:11px;">${days} يوم</span>`;
}
