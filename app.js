// ==========================================
// 🦈 SHARK ADMIN DASHBOARD LOGIC (V7.0)
// ==========================================

const SUPABASE_URL = 'https://heeessxpeaelsjpvdrgh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = localStorage.getItem('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_SERVICE_ROLE_KEY) {
    window.location.href = 'login.html';
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        detectSessionInUrl: false,
        persistSession: true,
    },
    global: {
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
    }
});

// DOM Elements
const tableBody = document.getElementById('tableBody');
const btnGenerateKey = document.getElementById('btnGenerateKey');
const inputDays = document.getElementById('inputDays');
const checkFreeTrial = document.getElementById('checkFreeTrial');
const generatedKeyDisplay = document.getElementById('generatedKeyDisplay');
const btnRefresh = document.getElementById('btnRefresh');
const btnLogout = document.getElementById('btnLogout');

const statActive = document.getElementById('statActiveLicenses');
const statBanned = document.getElementById('statBanned');
const statTotalRuns = document.getElementById('statTotalRuns');

// Auth Check Guard
async function enforceAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Logout
btnLogout?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('SUPABASE_SERVICE_ROLE_KEY');
    window.location.href = 'login.html';
});

// Load Data
async function loadDashboardData() {
    if (!(await enforceAuth())) return;

    try {
        // Fetch Licenses
        const { data: licenses, error: licErr } = await supabase
            .from('licenses')
            .select(`
                *,
                devices (
                    status,
                    total_runs,
                    last_seen
                )
            `)
            .order('created_at', { ascending: false });

        if (licErr) throw licErr;

        renderTable(licenses);
        calculateStats(licenses);
    } catch (err) {
        console.error("Error loading data:", err);
        alert("حدث خطأ في جلب البيانات! تأكد من إعدادات Supabase.");
    }
}

function renderTable(licenses) {
    tableBody.innerHTML = '';
    
    licenses.forEach(lic => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-[#1e293b]/30 transition-colors';
        
        // Formatter
        const deviceDisplay = lic.device_id ? `<span class="text-xs font-mono text-[#00f3ff] bg-[#00f3ff]/10 px-2 py-1 rounded">${lic.device_id.substring(0,8)}...</span>` : '<span class="text-xs text-gray-500">غير مرتبط بجهاز</span>';
        
        let statusBadge = '';
        if (lic.status === 'active') statusBadge = '<span class="px-2 py-1 text-xs rounded-full badge-active">نشط</span>';
        else if (lic.status === 'suspended') statusBadge = '<span class="px-2 py-1 text-xs rounded-full badge-banned">موقوف</span>';
        else statusBadge = '<span class="px-2 py-1 text-xs rounded-full badge-expired">منتهي</span>';

        const deviceStatus = lic.devices?.status === 'banned' ? '<span class="px-2 py-1 text-xs rounded-full badge-banned ml-2">جهاز محظور</span>' : '';

        const expireDate = new Date(lic.expires_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        const runs = lic.devices?.total_runs || 0;

        tr.innerHTML = `
            <td class="px-4 py-3 font-mono text-gray-300">
                <div class="mb-1">${lic.license_key}</div>
                ${deviceDisplay}
            </td>
            <td class="px-4 py-3">${statusBadge} ${deviceStatus}</td>
            <td class="px-4 py-3 text-gray-400 text-xs">${expireDate}</td>
            <td class="px-4 py-3 text-[#00f3ff] font-bold">${runs}</td>
            <td class="px-4 py-3 text-center">
                <div class="flex justify-center gap-2">
                    <button onclick="toggleSuspend('${lic.id}', '${lic.status}')" class="text-xs bg-[#1e293b] hover:bg-gray-700 text-white px-3 py-1 rounded transition">
                        ${lic.status === 'active' ? 'إيقاف مؤقت' : 'تفعيل'}
                    </button>
                    ${lic.device_id ? `<button onclick="banDevice('${lic.device_id}')" class="text-xs bg-red-900/50 hover:bg-red-900 text-red-300 border border-red-800 px-3 py-1 rounded transition">حظر الجهاز</button>` : ''}
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function calculateStats(licenses) {
    let active = 0;
    let banned = 0;
    let runs = 0;

    licenses.forEach(lic => {
        if (lic.status === 'active') active++;
        if (lic.devices?.status === 'banned') banned++;
        if (lic.devices?.total_runs) runs += parseInt(lic.devices.total_runs);
    });

    statActive.innerText = active;
    statBanned.innerText = banned;
    statTotalRuns.innerText = runs;
}

// Generate License
btnGenerateKey.addEventListener('click', async () => {
    const days = parseInt(inputDays.value) || 30;
    const isFree = checkFreeTrial.checked;
    
    // Generate Random Key (12-digit numeric)
    const newKey = rndNum(12);
    
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + days);

    try {
        const { data, error } = await supabase
            .from('licenses')
            .insert([
                { 
                    license_key: newKey, 
                    expires_at: expireDate.toISOString(),
                    is_free_trial: isFree,
                    status: 'active'
                }
            ]);
            
        if (error) throw error;
        
        generatedKeyDisplay.innerText = newKey;
        generatedKeyDisplay.classList.remove('hidden');
        
        loadDashboardData();
    } catch (err) {
        alert("فشل توليد الكود!");
        console.error(err);
    }
});

// Actions
window.toggleSuspend = async (licenseId, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
        await supabase.from('licenses').update({ status: newStatus }).eq('id', licenseId);
        loadDashboardData();
    } catch(err) { alert("فشل التحديث"); }
};

window.banDevice = async (deviceId) => {
    if(!confirm("هل أنت متأكد من حظر هذا الجهاز تماماً؟")) return;
    try {
        await supabase.from('devices').update({ status: 'banned' }).eq('device_id', deviceId);
        loadDashboardData();
    } catch(err) { alert("فشل الحظر"); }
};

btnRefresh.addEventListener('click', loadDashboardData);

// Init
document.addEventListener('DOMContentLoaded', loadDashboardData);

function rndNum(length = 12) {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
}
