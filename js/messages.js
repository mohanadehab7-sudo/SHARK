/**
 * SHARK ADMIN DASHBOARD — IN-APP MESSAGING
 * Allows sending instant push/in-app notices to individual devices or all filtered users.
 */

window.SHARK = window.SHARK || {};

let pendingMsgDeviceId = null;

function openMsgModal(deviceId) {
    pendingMsgDeviceId = deviceId;
    window.SHARK.state.pendingMsgDeviceId = deviceId;
    const input = document.getElementById('msgText');
    if (input) {
        input.value = 'مرحباً بك! إشعار من إدارة SHARK: يرجى العلم بوجود تحديث متاح للبوت.';
    }
    const modal = document.getElementById('msgModal');
    if (modal) modal.style.display = 'flex';
}

function closeMsgModal() {
    const modal = document.getElementById('msgModal');
    if (modal) modal.style.display = 'none';
    pendingMsgDeviceId = null;
    window.SHARK.state.pendingMsgDeviceId = null;
}

async function confirmSendMessage() {
    const msgInput = document.getElementById('msgText');
    const msg = msgInput?.value.trim();
    if (!msg || !pendingMsgDeviceId) {
        showToast('يرجى كتابة نص الرسالة أولاً', 'warning');
        return;
    }

    showLoading(true);
    try {
        if (pendingMsgDeviceId === '__BULK__' || pendingMsgDeviceId === '__GLOBAL__') {
            const rows = document.querySelectorAll('#usersTableBody tr');
            let ids = [...rows].map(row => {
                const btn = row.querySelector('[onclick*="openUserProfile"]');
                return btn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            }).filter(Boolean);

            if (ids.length === 0 && window.SHARK.state.usersData?.length) {
                ids = window.SHARK.state.usersData.map(u => u.device_id).filter(Boolean);
            }

            if (ids.length === 0) {
                showToast('لا يوجد مستخدمون محددون لإرسال الرسالة لهم', 'warning');
                showLoading(false);
                return;
            }

            for (const id of ids) {
                await window.sb.from('devices').update({ message: msg }).eq('device_id', id);
            }
            showToast(`تم إرسال الرسالة إلى ${ids.length} جهاز بنجاح`, 'success');
        } else {
            const { error } = await window.sb.from('devices').update({ message: msg }).eq('device_id', pendingMsgDeviceId);
            if (error) throw error;
            showToast('تم إرسال الرسالة للجهاز بنجاح', 'success');
        }
    } catch (err) {
        console.error("Message send failed:", err);
        showToast('خطأ في إرسال الرسالة: ' + (err.message || err), 'error');
    } finally {
        showLoading(false);
        closeMsgModal();
    }
}

// Event Listeners
document.getElementById('msgModal')?.addEventListener('click', e => {
    if (e.target.id === 'msgModal') closeMsgModal();
});

// Global expose
window.openMsgModal = openMsgModal;
window.closeMsgModal = closeMsgModal;
window.confirmSendMessage = confirmSendMessage;

window.SHARK.messages = {
    openMsgModal,
    closeMsgModal,
    confirmSendMessage
};
