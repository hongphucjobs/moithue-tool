const express = require('express');
const session = require('express-session');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const fs = require('fs');
const app = express();
const PORT = 3003;

const LOG = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(path.join(__dirname, 'server.log'), line);
};

app.use(session({
    secret: 'moithue-secret-2024',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function extractCookies(resp) {
    if (!resp.headers['set-cookie']) return [];
    return resp.headers['set-cookie'].map(c => c.split(';')[0]);
}

function mergeCookies(existing, newCookies) {
    const map = {};
    (existing || []).forEach(c => { const [k] = c.split('='); map[k] = c; });
    newCookies.forEach(c => { const [k] = c.split('='); map[k] = c; });
    return Object.values(map);
}

app.post('/api/login', async (req, res) => {
    try {
        const cookieJar = {};
        const browserHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Sec-Ch-Ua': '"Not-A.Brand";v="99", "Chromium";v="134"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        };

        const loginPageResp = await axios.get('https://moithue.com/login-and-register/?tab=login', {
            headers: { ...browserHeaders },
            timeout: 30000,
            maxRedirects: 0,
            validateStatus: s => s < 400 || s === 302
        });
        extractCookies(loginPageResp).forEach(c => { const [k] = c.split('='); cookieJar[k] = c; });

        const $ = cheerio.load(loginPageResp.data);
        const nonce = $('lst-login').attr('td-nonce');

        if (!nonce) {
            return res.json({ success: false, message: 'Không thể lấy mã xác thực từ trang đăng nhập' });
        }

        const params = new URLSearchParams();
        params.append('nonce', nonce);
        params.append('login', req.body.login);
        params.append('password', req.body.password);
        params.append('remember', 'true');
        params.append('token', '');

        const cookieStr = Object.values(cookieJar).join('; ');

        const loginResp = await axios.post(
            'https://moithue.com/wp-admin/admin-post.php?action=listivo/user/login',
            params.toString(),
            {
                headers: {
                    ...browserHeaders,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookieStr,
                    'Referer': 'https://moithue.com/login-and-register/?tab=login',
                    'Origin': 'https://moithue.com',
                },
                timeout: 30000,
                maxRedirects: 0,
                validateStatus: s => s < 400 || s === 302
            }
        );

        const loginCookies = extractCookies(loginResp);
        loginCookies.forEach(c => { const [k] = c.split('='); cookieJar[k] = c; });

        let finalData = loginResp.data;
        let finalStatus = loginResp.status;

        if (typeof finalData === 'string' && finalData) {
            try { finalData = JSON.parse(finalData); } catch {}
        }

        if (finalStatus === 302 && finalData && finalData.success) {
            const redirectUrl = finalData.redirect || finalData.url || null;
            if (redirectUrl) {
                try {
                    const followResp = await axios.get(redirectUrl, {
                        headers: {
                            ...browserHeaders,
                            'Cookie': Object.values(cookieJar).join('; '),
                        },
                        timeout: 20000,
                        maxRedirects: 3,
                    });
                    extractCookies(followResp).forEach(c => { const [k] = c.split('='); cookieJar[k] = c; });
                } catch (e) {}
            }
        }

        if (finalData && finalData.success === true) {
            req.session.cookies = Object.values(cookieJar);
            req.session.loggedIn = true;
            res.json({ success: true, message: 'Đăng nhập thành công' });
        } else {
            const msg = finalData?.message || 'Đăng nhập thất bại - sai tài khoản hoặc mật khẩu';
            res.json({ success: false, message: msg });
        }
    } catch (error) {
        const errData = error.response?.data;
        let msg = 'Lỗi kết nối: ' + error.message;
        if (errData) {
            try {
                const parsed = typeof errData === 'string' ? JSON.parse(errData) : errData;
                if (parsed.success === true) {
                    req.session.cookies = Object.values(cookieJar || {});
                    req.session.loggedIn = true;
                    return res.json({ success: true, message: 'Đăng nhập thành công' });
                }
                msg = parsed.message || msg;
            } catch {}
        }
        res.json({ success: false, message: msg });
    }
});

app.get('/api/check-login', async (req, res) => {
    try {
        if (!req.session.cookies || req.session.cookies.length === 0) {
            return res.json({ loggedIn: false });
        }

        const hasLoggedInCookie = req.session.cookies.some(c => c.startsWith('wordpress_logged_in_'));
        if (!hasLoggedInCookie) {
            return res.json({ loggedIn: false });
        }

        const resp = await axios.get('https://moithue.com/', {
            headers: {
                'Cookie': req.session.cookies.join('; '),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            timeout: 20000,
            maxRedirects: 0,
            validateStatus: s => s < 400 || s === 302
        });

        if (resp.status === 302 && (resp.headers.location || '').includes('login')) {
            return res.json({ loggedIn: false });
        }

        const body = typeof resp.data === 'string' ? resp.data : '';
        const hasAdminBar = body.includes('wpadminbar') || body.includes('wp-admin-bar');
        const hasLogoutLink = body.includes('logout') && (body.includes('_wpnonce') || body.includes('admin-post'));
        const redirectToLogin = body.includes('redirect_to=') && body.includes('login');

        res.json({ loggedIn: hasAdminBar || hasLogoutLink || (!redirectToLogin) });
    } catch (e) {
        LOG('Check-login error: ' + e.message);
        res.json({ loggedIn: false });
    }
});

app.post('/api/fetch-listing', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.json({ success: false, message: 'Thiếu link phòng' });

        const resp = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': (req.session.cookies || []).join('; '),
            },
            timeout: 30000,
            maxRedirects: 0,
            validateStatus: s => s < 400 || s === 302
        });

        if (resp.status === 302 && (resp.headers.location || '').includes('login')) {
            return res.json({ success: false, message: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại', needLogin: true });
        }

        const body = typeof resp.data === 'string' ? resp.data : '';
        const isLoginPage = body.includes('class="listivo-login-widget"') || body.includes('lst_login_and_register');
        if (isLoginPage) {
            return res.json({ success: false, message: 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại', needLogin: true });
        }

        const $ = cheerio.load(resp.data);

        const name = $('h1.listivo-listing-name').first().text().trim();
        const price = $('div.listivo-listing-price').first().text().trim();

        const descEl = $('.listivo-listing-section__text').first();
        const description = descEl.length
            ? descEl.html()
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<p[^>]*>/gi, '')
                .replace(/<\/p>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/\n{3,}/g, '\n\n')
                .trim()
            : '';

        const images = [];
        $('[data-widget_type="lst_listing_gallery_v2.default"] div[data-url]').each((i, el) => {
            const imgUrl = $(el).attr('data-url');
            if (imgUrl) images.push(imgUrl);
        });

        if (!name) {
            return res.json({ success: false, message: 'Không tìm thấy thông tin phòng. URL có thể không hợp lệ.' });
        }

        const parts = name.split(' ');
        const shortNumber = parts[0]?.split('.')[0] || '';
        const rest = parts.slice(1).join(' ');
        const shortStreet = rest.split('_')[0] || '';
        const shortName = (shortNumber + ' ' + shortStreet).trim();

        const services = extractServices(description);

        res.json({
            success: true,
            name,
            shortName,
            price: price || 'Không có giá',
            images,
            imageCount: images.length,
            description,
            services,
        });
    } catch (error) {
        res.json({ success: false, message: 'Lỗi: ' + (error.response?.status === 404 ? 'Không tìm thấy trang' : error.message) });
    }
});

app.get('/api/proxy-image', async (req, res) => {
    try {
        const imgUrl = req.query.url;
        if (!imgUrl) return res.status(400).send('Missing url');

        const resp = await axios.get(imgUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
                'Referer': 'https://moithue.com/',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            timeout: 30000,
            responseType: 'stream',
        });

        const contentType = resp.headers['content-type'] || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        resp.data.pipe(res);
    } catch {
        res.status(500).send('Image proxy error');
    }
});

function extractServices(text) {
    if (!text) return '';
    const lines = text.split('\n').map(l => l.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim()).filter(Boolean);
    const moneyPattern = /\b\d+[kKk](?!m\b|[a-zA-Z])|\d+[\.\d]*\s*[đ₫]|\bfree\b|\bmiễn phí\b/i;
    const costKeywords = /phí|giá\s|tiền\s|gửi\s*xe|trông\s*xe|parking/i;
    const exclude = /^[•\s]*(Bớt|Thêm|Xe máy|Hợp đồng|Thanh toán|Ngày lùi|Giảm)/i;
    const result = lines.filter(line => !exclude.test(line) && (moneyPattern.test(line) || costKeywords.test(line)));
    return result.join('\n');
}

app.get('/api/black-image', (req, res) => {
    const { name } = req.query;
    const safeName = (name || 'separator').replace(/[^a-zA-Z0-9_\-\p{L}]/gu, '_');

    const width = 800;
    const height = 2;

    const buf = Buffer.alloc(width * height * 3 + 54);
    let off = 0;

    buf.write('BM', off, 2); off += 2;
    buf.writeUInt32LE(buf.length, off); off += 4;
    buf.writeUInt32LE(0, off); off += 4;
    buf.writeUInt32LE(54, off); off += 4;
    buf.writeUInt32LE(40, off); off += 4;
    buf.writeInt32LE(width, off); off += 4;
    buf.writeInt32LE(-height, off); off += 4;
    buf.writeUInt16LE(1, off); off += 2;
    buf.writeUInt16LE(24, off); off += 2;
    buf.writeUInt32LE(0, off); off += 4;
    buf.writeUInt32LE(width * height * 3, off); off += 4;
    buf.writeInt32LE(2835, off); off += 4;
    buf.writeInt32LE(2835, off); off += 4;
    buf.writeUInt32LE(0, off); off += 4;
    buf.writeUInt32LE(0, off); off += 4;

    for (let i = 0; i < width * height * 3; i++) {
        buf[off + i] = 0;
    }

    const filename = encodeURIComponent(safeName) + '.bmp';
    res.setHeader('Content-Type', 'image/bmp');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    res.send(buf);
});

app.listen(PORT, () => {
    console.log('Server chạy tại http://localhost:' + PORT + ' (mở trong trình duyệt)');
});
