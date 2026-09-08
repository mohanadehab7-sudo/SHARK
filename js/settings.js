/**
 * SHARK ADMIN DASHBOARD — BOT & PLATFORM SETTINGS
 * Controls global bot operational modes, trial window, announcements, and database housekeeping.
 */

window.SHARK = window.SHARK || {};

async function loadSettings() {
    try {
        const { data, error } = await window.sb.from('app_settings').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;

        if (data) {
            window.SHARK.state.settingsData = data;
            const botModeEl = document.getElementById('botMode');
            const globalMsgEl = document.getElementById('globalMessage');
            const trialHoursEl = document.getElementById('trialHours');
            const trialItem = document.getElementById('trialHoursItem');

            if (botModeEl) botModeEl.value = data.bot_mode || 'subscription';
            if (globalMsgEl) globalMsgEl.value = data.global_message || '';
            if (trialHoursEl) trialHoursEl.value = data.trial_hours || 24;
            if (trialItem) trialItem.style.display = data.bot_mode === 'trial' ? 'block' : 'none';
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

    // Danger Zone: Delete Unused Codes
    document.getElementById('deleteUnusedCodesBtn')?.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف جميع الأكواد غير المستخدمة نهائياً؟')) return;
        showLoading(true);
        try {
            const { error } = await window.sb.from('licenses').delete().is('device_id', null);
            if (error) throw error;
            showToast('تم حذف الأكواد غير المستخدمة بنجاح', 'success');
            await window.SHARK.codes?.loadCodesData();
            await window.SHARK.dashboard?.loadDashboardData();
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    });

    // Danger Zone: Clean Emulators
    document.getElementById('cleanEmulatorsBtn')?.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من تنظيف وحذف جميع أجهزة المحاكاة واختبارات جوجل من قاعدة البيانات؟ لن يتم لمس أي جهاز مرتبط بكود تفعيل.')) return;
        showLoading(true);
        try {
            const { data: devices, error: devError } = await window.sb.from('devices').select('*');
            if (devError) throw devError;

            const { data: licenses, error: licError } = await window.sb.from('licenses').select('device_id');
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
                showToast('لم يتم العثور على أجهزة محاكاة لحذفها', 'info');
                showLoading(false);
                return;
            }

            const idsToDelete = emulatorsToDelete.map(e => e.device_id);

            await window.sb.from('licenses').delete().in('device_id', idsToDelete);
            const { error: deleteError } = await window.sb.from('devices').delete().in('device_id', idsToDelete);
            if (deleteError) throw deleteError;

            showToast(`تم تنظيف ${emulatorsToDelete.length} جهاز محاكاة بنجاح`, 'success');
            if (window.SHARK.loadAllData) {
                await window.SHARK.loadAllData();
            }
        } catch (err) {
            console.error("Emulator cleanup error:", err);
            showToast('حدث خطأ أثناء تنظيف أجهزة المحاكاة', 'error');
        } finally {
            showLoading(false);
        }
    });

    // Danger Zone: Reset All Stats
    document.getElementById('resetAllUsersBtn')?.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من إعادة تعيين إحصائيات التشغيل والمغلفات لجميع المستخدمين؟')) return;
        showLoading(true);
        try {
            const { error } = await window.sb.from('devices').update({ total_runs: 0, total_minutes: 0 }).neq('device_id', '');
            if (error) throw error;
            showToast('تم تصفير جميع الإحصائيات بنجاح', 'success');
            await window.SHARK.users?.loadUsersData();
        } catch (err) {
            showToast('خطأ: ' + err.message, 'error');
        } finally {
            showLoading(false);
        }
    });
}

window.loadSettings = loadSettings;
window.SHARK.settings = {
    loadSettings,
    initSettings
};
