/**
 * SHARK ADMIN DASHBOARD — UI & PRESENTATION LAYER
 * Handles toasts, loading indicators, time formatters, tab switching, and keyboard accessibility.
 */

window.SHARK = window.SHARK || {};

function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.style.display = show ? 'flex' : 'none';
        spinner.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    
    const icon = type === 'success' ? 'ri-checkbox-circle-line' 
               : type === 'error' ? 'ri-close-circle-line' 
               : type === 'warning' ? 'ri-alert-line' 
               : 'ri-information-line';
               
    t.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${msg}</span>`;
    container.appendChild(t);
    
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transform = 'translateY(-8px)';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

function showConfirmDialog(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('confirmModalOkBtn');
    const cancelBtn = document.getElementById('confirmModalCancelBtn');

    if (!modal) {
        if (confirm(message)) onConfirm();
        return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    const cleanup = () => {
        modal.style.display = 'none';
        if (okBtn) okBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
    };

    if (okBtn) {
        okBtn.onclick = (e) => {
            e.preventDefault();
            cleanup();
            onConfirm();
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = (e) => {
            e.preventDefault();
            cleanup();
        };
    }

    modal.style.display = 'flex';
}
window.showConfirmDialog = showConfirmDialog;

// ── FORMATTERS ─────────────────────────────────────────────────────────────

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
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

// ── TAB SWITCHING ─────────────────────────────────────────────────────────

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            if (!targetTab) return;

            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            tabContents.forEach(c => {
                c.classList.remove('active');
                c.setAttribute('hidden', 'true');
            });

            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');

            const content = document.getElementById(targetTab);
            if (content) {
                content.classList.add('active');
                content.removeAttribute('hidden');
            }
        });
    });
}

// ── KEYBOARD ACCESSIBILITY ────────────────────────────────────────────────

function initAccessibility() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close any open active modals
            if (window.closeUserProfile) window.closeUserProfile();
            if (window.closeRenewModal) window.closeRenewModal();
            if (window.closeMsgModal) window.closeMsgModal();
            if (window.closeQuickCodeModal) window.closeQuickCodeModal();
            const confirmModal = document.getElementById('confirmModal');
            if (confirmModal) confirmModal.style.display = 'none';
        }
    });
}

// Global expose
window.showLoading = showLoading;
window.showToast = showToast;
window.formatDate = formatDate;
window.formatRemainingDays = formatRemainingDays;

window.SHARK.ui = {
    showLoading,
    showToast,
    showConfirmDialog,
    formatDate,
    formatRemainingDays,
    initTabs,
    initAccessibility
};
