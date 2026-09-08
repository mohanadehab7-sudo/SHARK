/**
 * SHARK ADMIN DASHBOARD — BOT & PLATFORM SETTINGS
 * Controls global bot operational modes, trial window, announcements, and database housekeeping.
 */

window.SHARK = window.SHARK || {};

function setGlobalMsgTemplate(type) {
    const textarea = document.getElementById('globalMessage');
    if (!textarea) return;

    if (type === 'ترحيب' || type === 'update') {
        textarea.value = 'مرحباً بكم في SHARK! تم تحديث البوت بنجاح ليعمل بأعلى سرعة واستقرار.';
    } else if (type === 'تجديد' || type === 'renew') {
        textarea.value = 'تنبيه للمشتركين: يرجى تجديد الاشتراك لضمان استمرار عمل بوت SHARK دون توقف.';
    } else if (type === 'صيانة' || type === 'maintenance') {
        textarea.value = 'تنبيه: يجري الآن تحديث وصيانة سريعة لخوادم SHARK، سيعاود البوت العمل تلقائياً.';
    }
    textarea.focus();
    showToast('تم وضع نص الرسالة (يمكنك تعديله بحرية)', 'info');
}
window.setGlobalMsgTemplate = setGlobalMsgTemplate;

async function loadSettings() {
    try {
        const { data, error } = await window.sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;

        const botModeEl = document.getElementById('botMode');
        const globalMsgEl = document.getElementById('globalMessage');
        const trialHoursEl = document.getElementById('trialHours');
        const trialItem = document.getElementById('trialHoursItem');

        if (data) {
            window.SHARK.state.settingsData = data;
            if (botModeEl) botModeEl.value = data.bot_mode || 'subscription';
            if (globalMsgEl) globalMsgEl.value = data.global_message || 'مرحباً بكم في SHARK! التطبيق يعمل بكفاءة واستقرار.';
            if (trialHoursEl) trialHoursEl.value = data.trial_hours || 24;
            if (trialItem) trialItem.style.display = data.bot_mode === 'trial' ? 'block' : 'none';
        } else {
            if (globalMsgEl && !globalMsgEl.value) {
                globalMsgEl.value = 'مرحباً بكم في SHARK! التطبيق يعمل بكفاءة واستقرار.';
            }
        }
    } catch (err) {
        console.error("Settings load error:", err);
    }
}

function initSettings() {
    // Toggle trial hours input visibility on mode change
    document.getElementById('botMode')?.addEventListener('change', () => {
        const botMode = document.getElementById('botMode').value;
        const trialItem = document.getElementById('trialHoursItem');
        if (trialItem) trialItem.style.display = botMode === 'trial' ? 'block' : 'none';
    });

    // Save settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
        const bot_mode = document.getElementById('botMode')?.value || 'subscription';
        const is_shutdown = bot_mode === 'shutdown';
        const global_message = document.getElementById('globalMessage')?.value || '';

        let trial_hours = parseInt(document.getElementById('trialHours')?.value, 10);
        if (!Number.isFinite(trial_hours) || trial_hours < 1) trial_hours = 24;
        if (trial_hours > 168) trial_hours = 168;

        showLoading(true);
        try {
            const { error } = await window.sb.from('app_settings').upsert({
                id: 1,
                is_shutdown,
                bot_mode,
                global_message,
                trial_hours
            });

            if (error) throw error;

            showToast('تم حفظ الإعدادات بنجاح', 'success');
            await window.SHARK.dashboard?.loadDashboardData();
        } catch (err) {
            console.error("Save settings error:", err);
            showToast('فشل حفظ الإعدادات: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    });

}

window.loadSettings = loadSettings;
window.SHARK.settings = {
    loadSettings,
    initSettings,
    setGlobalMsgTemplate
};

