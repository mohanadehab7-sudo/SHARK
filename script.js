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

// ── STATE ──────────────────────────────────────────
let currentUser = null;
let usersData   = [];
let codesData   = [];
let pendingMsgDeviceId = null;
let renewState  = { deviceId:null, days:180, isLifetime:false, currentSubEnd:null };
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
    loadDashboardData();
    loadUsersData();
    loadCodesData();
    loadSettings();
    initCodeGenerator();
    initRenewModal();
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
document.getElementById('refreshAllBtn')?.addEventListener('click', () => {
    loadDashboardData();
    loadUsersData();
    loadCodesData();
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
document.getElementById('refreshUsersBtn').addEventListener('click', loadUsersData);
document.getElementById('msgAllFilteredBtn').addEventListener('click', () => openMsgModal('__BULK__'));

function applyUserFilter() {
    const filter = document.getElementById('userFilter').value;
    const search = document.getElementById('userSearch').value.toLowerCase().trim();
    const now = new Date();
    const DAY = 86400000, WEEK = 604800000;

    let filtered = usersData;
    if (search) {
        filtered = filtered.filter(u =>
            (u.device_id||'').toLowerCase().includes(search)
        );
    }
    switch(filter) {
        case 'new_today':  filtered = usersData.filter(u => u.created_at && (now - new Date(u.created_at)) < DAY); break;
        case 'new_week':   filtered = usersData.filter(u => u.created_at && (now - new Date(u.created_at)) < WEEK); break;
        case 'active':     filtered = usersData.filter(u => u.status === 'active'); break;
        case 'blocked':    filtered = usersData.filter(u => u.status === 'banned'); break;
        case 'expiring':   filtered = usersData.filter(u => {
            const lic = codesData.find(c => c.device_id === u.device_id);
            if (!lic?.expires_at) return false;
            const diff = new Date(lic.expires_at) - now;
            return diff > 0 && diff < 3 * DAY;
        }); break;
        case 'lifetime':   filtered = usersData.filter(u => {
            const lic = codesData.find(c => c.device_id === u.device_id);
            return !lic?.expires_at;
        }); break;
    }
    document.getElementById('filteredCount').textContent = `(${filtered.length})`;
    displayUsers(filtered);
}

function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-cell"><i class="fas fa-inbox"></i> لا يوجد مستخدمون</td></tr>';
        return;
    }
    tbody.innerHTML = users.map((u, i) => {
        const lic = codesData.find(c => c.device_id === u.device_id);
        const isOnline = u.last_seen && (new Date() - new Date(u.last_seen)) < 300000;
        const onlineDot = isOnline ? '<span class="online-dot" title="متصل الآن"></span>' : '<span class="offline-dot" title="غير متصل"></span>';
        const statusBadge = u.status === 'active' ? '<span class="badge badge-active">نشط</span>' : '<span class="badge badge-banned">محظور</span>';
        const subEnd = lic ? (lic.expires_at ? formatSubEnd(lic.expires_at) : '<span class="badge badge-lifetime">♾️ مدى الحياة</span>') : '<span class="badge badge-expired">بدون ترخيص</span>';
        return `<tr>
            <td style="text-align:center;">${onlineDot}</td>
            <td style="font-size:11px;font-family:'JetBrains Mono',monospace;color:var(--neon);max-width:150px;overflow:hidden;text-overflow:ellipsis;" title="${u.device_id}">${u.device_id?.substring(0,12)}...</td>
            <td style="font-size:10px;font-family:'JetBrains Mono',monospace;color:var(--muted);">${u.device_id?.substring(0,8)}...</td>
            <td>${formatRelative(u.last_seen)}</td>
            <td>${subEnd}</td>
            <td><span class="badge" style="background:rgba(157,23,77,0.1);color:#f0abfc;border:1px solid rgba(157,23,77,0.3);">${u.total_runs || 0}</span></td>
            <td><span class="badge" style="background:rgba(67,56,202,0.1);color:#a5b4fc;border:1px solid rgba(67,56,202,0.3);">${formatMins(u.total_minutes || 0)}</span></td>
            <td>${statusBadge}</td>
            <td style="white-space:nowrap;">
                <button class="table-btn renew" onclick="openRenewModal('${u.device_id}')" title="تجديد اشتراك"><i class="fas fa-calendar-plus"></i></button>
                <button class="table-btn info"  onclick="openMsgModal('${u.device_id}')"  title="إرسال رسالة"><i class="fas fa-comment-dots"></i></button>
                ${u.status === 'active'
                    ? `<button class="table-btn block"   onclick="blockUser('${u.device_id}')"   title="حظر"><i class="fas fa-ban"></i></button>`
                    : `<button class="table-btn unblock" onclick="unblockUser('${u.device_id}')" title="رفع الحظر"><i class="fas fa-check"></i></button>`
                }
                <button class="table-btn delete" onclick="deleteUser('${u.device_id}')" title="حذف نهائي"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

// ══════════════════════════════════════════════════
// STATS
// ══════════════════════════════════════════════════
async function loadStatsData() {
    try {
        const { data } = await sb.from('devices').select('*').order('total_runs', { ascending:false });
        const tbody = document.getElementById('statsTableBody');
        if (!data?.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading-cell">لا توجد بيانات</td></tr>'; return; }
        tbody.innerHTML = data.map(d => {
            const statusBadge = d.status === 'active' ? '<span class="badge badge-active">نشط</span>' : '<span class="badge badge-banned">محظور</span>';
            return `<tr>
                <td style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--neon);">${d.device_id}</td>
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
    if (!confirm('هل أنت متأكد من حظر هذا المستخدم؟')) return;
    await sb.from('devices').update({ status:'banned' }).eq('device_id', deviceId);
    showToast('✅ تم الحظر', 'success');
    loadUsersData(); loadDashboardData();
};
window.unblockUser = async (deviceId) => {
    await sb.from('devices').update({ status:'active' }).eq('device_id', deviceId);
    showToast('✅ تم رفع الحظر', 'success');
    loadUsersData(); loadDashboardData();
};
window.deleteUser = async (deviceId) => {
    if (!confirm('حذف نهائي؟ لا يمكن التراجع!')) return;
    await sb.from('devices').delete().eq('device_id', deviceId);
    showToast('تم الحذف', 'success');
    loadUsersData(); loadDashboardData();
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
            const rows = document.querySelectorAll('#usersTableBody .table-btn.block, #usersTableBody .table-btn.unblock');
            const ids = [...document.querySelectorAll('#usersTableBody tr')].map(row => {
                const btn = row.querySelector('[onclick^="blockUser"],[onclick^="unblockUser"]');
                return btn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            }).filter(Boolean);
            for (const id of ids) await sb.from('devices').update({ message:msg }).eq('device_id', id);
            showToast(`✅ تم الإرسال لـ ${ids.length} مستخدم`, 'success');
        } else {
            await sb.from('devices').update({ message:msg }).eq('device_id', pendingMsgDeviceId);
            showToast('✅ تم إرسال الرسالة', 'success');
        }
    } catch { showToast('خطأ في الإرسال', 'error'); }
    showLoading(false);
    closeMsgModal();
};

// ══════════════════════════════════════════════════
// RENEW MODAL
// ══════════════════════════════════════════════════
window.openRenewModal = (deviceId) => {
    const lic = codesData.find(c => c.device_id === deviceId);
    renewState = { deviceId, days:180, isLifetime:false, currentSubEnd: lic?.expires_at || null };
    const nameEl = document.getElementById('renewUserName');
    nameEl.textContent = lic?.expires_at
        ? `الاشتراك الحالي ينتهي في: ${formatDate(lic.expires_at)}`
        : 'لا يوجد اشتراك نشط';
    document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.renew-preset-btn[data-days="180"]')?.classList.add('active');
    updateRenewInfo();
    document.getElementById('renewModal').style.display = 'flex';
};
window.closeRenewModal = () => { document.getElementById('renewModal').style.display = 'none'; };
document.getElementById('renewModal').addEventListener('click', e => { if (e.target.id === 'renewModal') closeRenewModal(); });

function initRenewModal() {
    document.querySelectorAll('.renew-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const d = parseInt(btn.dataset.days);
            renewState.isLifetime = d === 0;
            renewState.days = d;
            updateRenewInfo();
        });
    });
    document.getElementById('renewCustomValue')?.addEventListener('input', onRenewCustomChange);
    document.getElementById('renewCustomUnit')?.addEventListener('change', onRenewCustomChange);
}
function onRenewCustomChange() {
    const val  = parseInt(document.getElementById('renewCustomValue').value);
    if (!val || val < 1) return;
    document.querySelectorAll('.renew-preset-btn').forEach(b => b.classList.remove('active'));
    const unit = document.getElementById('renewCustomUnit').value;
    renewState.days = unit === 'years' ? val*365 : unit === 'months' ? val*30 : val;
    renewState.isLifetime = false;
    updateRenewInfo();
}
function updateRenewInfo() {
    const el = document.getElementById('renewInfoText');
    if (renewState.isLifetime) { el.textContent = '♾️ سيكون اشتراكه مدى الحياة — لن ينتهي أبداً'; return; }
    const now = new Date();
    const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now ? new Date(renewState.currentSubEnd) : now;
    const end = new Date(base.getTime() + renewState.days * 86400000);
    el.textContent = `• سينتهي في: ${end.toLocaleDateString('ar-EG', {year:'numeric',month:'long',day:'numeric'})}`;
}
window.confirmRenew = async () => {
    if (!renewState.deviceId) return;
    showLoading(true);
    try {
        const now = new Date();
        const base = renewState.currentSubEnd && new Date(renewState.currentSubEnd) > now ? new Date(renewState.currentSubEnd) : now;
        const newEnd = renewState.isLifetime ? null : new Date(base.getTime() + renewState.days*86400000).toISOString();
        // Update the license linked to this device
        await sb.from('licenses').update({ expires_at: newEnd, status:'active' }).eq('device_id', renewState.deviceId);
        showToast(`✅ تم تجديد الاشتراك`, 'success');
        closeRenewModal();
        loadCodesData(); loadUsersData(); loadDashboardData();
    } catch(err) { showToast('خطأ في التجديد', 'error'); }
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
    else if (filter === 'lifetime') filtered = codesData.filter(c => !c.expires_at);
    document.getElementById('codesCount').textContent = `(${filtered.length})`;
    displayCodes(filtered);
}

function displayCodes(codes) {
    const tbody = document.getElementById('codesTableBody');
    if (!codes.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">لا توجد أكواد</td></tr>'; return; }
    tbody.innerHTML = codes.map((c, i) => {
        const isUsed = !!c.device_id;
        const isLifetime = !c.expires_at;
        const statusBadge = isUsed ? '<span class="badge badge-active">مستخدم</span>' : '<span class="badge badge-expired">متاح</span>';
        const subBadge    = c.status === 'suspended' ? '<span class="badge badge-banned">موقوف</span>' : statusBadge;
        const duration = isLifetime ? '♾️ مدى الحياة' : (c.expires_at ? `حتى ${formatDate(c.expires_at)}` : '-');
        return `<tr>
            <td style="color:var(--muted);">${i+1}</td>
            <td style="font-family:'JetBrains Mono',monospace;color:var(--neon);font-size:13px;">${c.license_key}</td>
            <td style="font-size:12px;color:var(--muted);">${duration}</td>
            <td>${subBadge}</td>
            <td style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);">${c.device_id ? c.device_id.substring(0,12)+'...' : '-'}</td>
            <td style="font-size:12px;color:var(--muted);">${formatDate(c.created_at)}</td>
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
            generatorState.days = parseInt(btn.dataset.days);
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
            generatorState.days = Math.ceil((new Date(expiry.value) - new Date()) / 86400000);
            document.getElementById('datePreview').textContent = `بعد ${generatorState.days} يوم`;
            updateSummary();
        });
    }
    document.getElementById('generateCodesMainBtn').addEventListener('click', generateCodes);
    document.getElementById('codeCount')?.addEventListener('input', updateSummary);
    updateSummary();
}
function updateCustom() {
    const val = parseInt(document.getElementById('customValue')?.value) || 1;
    const unit = document.getElementById('customUnit')?.value;
    generatorState.days = unit === 'years' ? val*365 : unit === 'months' ? val*30 : val;
    const label = unit === 'days' ? 'يوم' : unit === 'months' ? 'شهر' : 'سنة';
    document.getElementById('customPreview').textContent = `= ${generatorState.days} يوم (${val} ${label})`;
    updateSummary();
}
function updateSummary() {
    const count = parseInt(document.getElementById('codeCount')?.value) || 1;
    const type = generatorState.type;
    let dur = type === 'lifetime' ? '♾️ مدى الحياة'
            : type === 'date' && generatorState.expiryDate ? `حتى ${new Date(generatorState.expiryDate).toLocaleDateString('ar-EG')}`
            : `${generatorState.days || 30} يوم`;
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
            const expiresAt = generatorState.type === 'lifetime' ? null
                : generatorState.type === 'date' && generatorState.expiryDate ? new Date(generatorState.expiryDate).toISOString()
                : new Date(Date.now() + (generatorState.days||30)*86400000).toISOString();
            rows.push({ license_key:key, expires_at:expiresAt, status:'active' });
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
            document.getElementById('botMode').value = data.bot_mode || 'subscription';
            document.getElementById('globalMessage').value = data.global_message || '';
        }
    } catch {}
}
document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    const bot_mode = document.getElementById('botMode').value;
    const is_shutdown = bot_mode === 'shutdown';
    const global_message = document.getElementById('globalMessage').value;
    await sb.from('app_settings').upsert({ id:1, is_shutdown, bot_mode, global_message });
    showToast('✅ تم حفظ الإعدادات', 'success');
    loadDashboardData();
});
document.getElementById('deleteUnusedCodesBtn')?.addEventListener('click', async () => {
    if (!confirm('حذف جميع الأكواد غير المستخدمة؟')) return;
    await sb.from('licenses').delete().is('device_id', null);
    showToast('✅ تم حذف الأكواد غير المستخدمة', 'success');
    loadCodesData();
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
