const EMAIL = 'Phonghuyentran.moithue@gmail.com';
const PASSWORD = 'Huyentran';

const API = {
    async login(email, password) {
        const r = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: email, password })
        });
        return r.json();
    },
    async checkLogin() {
        const r = await fetch('/api/check-login');
        return r.json();
    },
    async fetchListing(url) {
        const r = await fetch('/api/fetch-listing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        return r.json();
    },
    proxyImageUrl(url) {
        return '/api/proxy-image?url=' + encodeURIComponent(url);
    },
    blackImageUrl(name) {
        return '/api/black-image?name=' + encodeURIComponent(name);
    }
};

const els = {
    loadingSection: document.getElementById('loading-section'),
    loadingStatus: document.getElementById('loading-status'),
    mainSection: document.getElementById('main-section'),
    roomUrl: document.getElementById('room-url'),
    fetchBtn: document.getElementById('fetch-btn'),
    loading: document.getElementById('loading'),
    fetchStatus: document.getElementById('fetch-status'),
    roomInfo: document.getElementById('room-info'),
    roomName: document.getElementById('room-name'),
    roomLinkDisplay: document.getElementById('room-link-display'),
    sheetUrl: document.getElementById('sheet-url'),
    pushSheetBtn: document.getElementById('push-sheet-btn'),
    roomShortName: document.getElementById('room-short-name'),
    roomPrice: document.getElementById('room-price'),
    copyLinkBtn: document.getElementById('copy-link-btn'),
    copyNameBtn: document.getElementById('copy-name-btn'),
    copyShortBtn: document.getElementById('copy-short-btn'),
    downloadBtn: document.getElementById('download-btn'),
    copyPostBtn: document.getElementById('copy-post-btn'),
    copyServicesBtn: document.getElementById('copy-services-btn'),
    servicesBox: document.getElementById('services-box'),
    servicesText: document.getElementById('services-text'),
    downloadProgress: document.getElementById('download-progress'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
};

let currentData = null;
let isDownloading = false;

function setStatus(el, msg, type) {
    el.textContent = msg;
    el.className = 'status' + (type ? ' ' + type : '');
}

async function autoLogin() {
    els.loadingStatus.textContent = 'Đang đăng nhập...';
    let ok = false;
    try {
        const check = await API.checkLogin();
        ok = check.loggedIn;
    } catch {}
    if (!ok) {
        try {
            const r = await API.login(EMAIL, PASSWORD);
            ok = r.success;
        } catch {}
    }
    if (ok) {
        els.loadingSection.style.display = 'none';
        els.mainSection.style.display = 'block';
    } else {
        els.loadingStatus.textContent = 'Đăng nhập thất bại, thử lại...';
        setTimeout(autoLogin, 3000);
    }
}

async function fetchListing() {
    const url = els.roomUrl.value.trim();
    if (!url) {
        setStatus(els.fetchStatus, 'Vui lòng nhập link phòng', 'error');
        return;
    }
    els.roomUrl.value = '';
    els.fetchBtn.disabled = true;
    els.loading.style.display = 'block';
    els.roomInfo.style.display = 'none';
    els.downloadProgress.style.display = 'none';
    setStatus(els.fetchStatus, '', '');

    const result = await API.fetchListing(url);
    els.loading.style.display = 'none';
    els.fetchBtn.disabled = false;

    if (result.success) {
        currentData = result;
        currentData.url = url;
        els.roomName.textContent = result.name;
        els.roomShortName.textContent = result.shortName;
        els.roomPrice.textContent = result.price;
        els.roomLinkDisplay.textContent = url;
        if (result.services) {
            els.servicesText.textContent = result.services;
            els.servicesBox.style.display = 'block';
        } else {
            els.servicesBox.style.display = 'none';
        }
        els.roomInfo.style.display = 'block';
        setStatus(els.fetchStatus, 'Đã tải thông tin phòng: ' + result.imageCount + ' ảnh', 'success');
    } else {
        if (result.needLogin) {
            els.loadingSection.style.display = 'flex';
            els.mainSection.style.display = 'none';
            autoLogin();
        } else {
            setStatus(els.fetchStatus, result.message, 'error');
        }
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function downloadImages() {
    if (!currentData || !currentData.images.length) {
        setStatus(els.fetchStatus, 'Không có ảnh để tải', 'error');
        return;
    }
    if (isDownloading) return;
    isDownloading = true;
    els.downloadBtn.disabled = true;
    els.downloadProgress.style.display = 'block';
    els.progressFill.style.width = '0%';

    const images = currentData.images;
    const shortName = currentData.shortName;
    const now = new Date();
    const ts = now.getFullYear()
        + String(now.getMonth() + 1).padStart(2, '0')
        + String(now.getDate()).padStart(2, '0')
        + '_'
        + String(now.getHours()).padStart(2, '0')
        + String(now.getMinutes()).padStart(2, '0')
        + String(now.getSeconds()).padStart(2, '0');
    const baseName = `${shortName}_${ts}`;
    const total = images.length + 1;

    for (let i = 0; i < images.length; i++) {
        const pct = Math.round(((i) / total) * 100);
        els.progressFill.style.width = pct + '%';
        els.progressText.textContent = `Đang tải ảnh ${i + 1}/${total - 1}...`;

        try {
            const resp = await fetch(API.proxyImageUrl(images[i]));
            const blob = await resp.blob();
            const ext = images[i].split('.').pop().split('?')[0] || 'jpg';
            const idx = String(i + 1).padStart(2, '0');
            downloadBlob(blob, `${baseName}_${idx}.${ext}`);
            await sleep(800);
        } catch (e) {
            console.error('Download error:', e);
        }
    }

    const pct = Math.round(((images.length) / total) * 100);
    els.progressFill.style.width = pct + '%';
    els.progressText.textContent = 'Đang tải ảnh phân cách...';

    try {
        const resp = await fetch(API.blackImageUrl(shortName));
        const blob = await resp.blob();
        downloadBlob(blob, `${baseName}_separator.bmp`);
        await sleep(500);
    } catch (e) {
        console.error('Separator error:', e);
    }

    els.progressFill.style.width = '100%';
    els.progressText.textContent = 'Hoàn tất!';
    isDownloading = false;
    els.downloadBtn.disabled = false;

    setTimeout(() => {
        els.downloadProgress.style.display = 'none';
    }, 2000);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
}

function copyLink() {
    if (currentData) copyToClipboard(currentData.url);
}

function copyRoomName() {
    if (currentData) copyToClipboard(currentData.name);
}

function copyShortName() {
    if (currentData) copyToClipboard(currentData.shortName);
}

function copyPost() {
    if (!currentData) return;
    const text = `${currentData.shortName} đang trống phòng full đồ như hình\n\nLiên hệ zalo: 0393516441`;
    copyToClipboard(text);
    setStatus(els.fetchStatus, 'Đã sao chép bài viết!', 'success');
}

function copyServices() {
    if (!currentData || !currentData.services) return;
    copyToClipboard('Dịch vụ & chi phí\n' + currentData.services);
    setStatus(els.fetchStatus, 'Đã sao chép dịch vụ!', 'success');
}

async function pushToSheet() {
    const sheetWebhook = els.sheetUrl.value.trim();
    if (!sheetWebhook) {
        setStatus(els.fetchStatus, 'Chưa nhập URL Google Sheet', 'error');
        return;
    }
    if (!currentData) {
        setStatus(els.fetchStatus, 'Chưa có dữ liệu phòng', 'error');
        return;
    }
    els.pushSheetBtn.disabled = true;
    els.pushSheetBtn.textContent = 'Đang đẩy...';
    try {
        await fetch(sheetWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                shortName: currentData.shortName,
                price: currentData.price,
                link: currentData.url
            })
        });
        setStatus(els.fetchStatus, 'Đã đẩy lên Google Sheet!', 'success');
    } catch (e) {
        setStatus(els.fetchStatus, 'Lỗi đẩy lên sheet: ' + e.message, 'error');
    }
    els.pushSheetBtn.disabled = false;
    els.pushSheetBtn.textContent = 'Đẩy lên Sheet';
}

function restoreSheetUrl() {
    const saved = localStorage.getItem('sheetUrl');
    if (saved) els.sheetUrl.value = saved;
}
els.sheetUrl.addEventListener('change', () => localStorage.setItem('sheetUrl', els.sheetUrl.value));

els.fetchBtn.addEventListener('click', fetchListing);
els.roomUrl.addEventListener('keydown', e => { if (e.key === 'Enter') fetchListing(); });
els.copyLinkBtn.addEventListener('click', copyLink);
els.copyNameBtn.addEventListener('click', copyRoomName);
els.copyShortBtn.addEventListener('click', copyShortName);
els.downloadBtn.addEventListener('click', downloadImages);
els.copyPostBtn.addEventListener('click', copyPost);
els.copyServicesBtn.addEventListener('click', copyServices);
els.pushSheetBtn.addEventListener('click', pushToSheet);

restoreSheetUrl();
autoLogin();
