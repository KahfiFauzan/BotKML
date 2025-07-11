require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// === 1. KONFIGURASI ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GEOAPIFY_API_KEY = process.env.GEOAPIFY_API_KEY;

const ASSET_MARKERS = {
    tb: { color: '#ff4d4d', name: '🔴 Tiang Baru', kmlIcon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' },
    te: { color: '#0080ff', name: '🔵 Tiang Eksisting', kmlIcon: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
    odc: { color: '#ff4d4d', name: '🔺 ODC', kmlIcon: 'http://maps.google.com/mapfiles/kml/shapes/triangle.png' },
    odp: { color: '#34A853', name: '🟢 ODP', kmlIcon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' },
    hh_pit: { color: '#808080', name: '🔲 Handhole PIT', kmlIcon: 'http://maps.google.com/mapfiles/kml/shapes/diamond.png', defaultName: 'HH-PIT-P-ODP' },
    hh_new: { color: '#808080', name: '🔳 Handhole NEW', kmlIcon: 'http://maps.google.com/mapfiles/kml/shapes/square.png', defaultName: 'HH-PIT-60NEW' },
    trench: { color: '#FFFF00', name: '🟨 Kabel Galian', kmlIcon: 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png' }
};

const LINE_COLORS = {
    aerial: '#0080FF',      // Biru untuk kabel udara
    trench_yellow: '#FFFF00', // Kuning untuk kabel galian kuning
    trench_red: '#FF0000'       // Merah untuk kabel galian merah
};

if (!TELEGRAM_TOKEN || !GEOAPIFY_API_KEY) {
    console.error('❌ TELEGRAM_TOKEN atau GEOAPIFY_API_KEY belum diatur di .env');
    process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const ALLOWED_NIKS = (process.env.ALLOWED_NIKS || '123456,987654,456789').split(',');
const verifiedUsers = new Set();
const userSessions = {};

// === 2. FUNGSI UTILITAS ===
function logActivity(msg, action) {
    const user = msg.from;
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    console.log(`[ACTIVITY] ${timestamp} - User: ${user.first_name || ''} (@${user.username || 'N/A'}) - ID: ${user.id} - Action: ${action}`);
}

function isAuthenticated(userId) {
    return verifiedUsers.has(userId);
}

function getHaversineDistance(p1, p2) {
    const R = 6371e3;
    const toRad = deg => deg * Math.PI / 180;
    const lat1 = toRad(p1.latitude), lat2 = toRad(p2.latitude);
    const dLat = toRad(p2.latitude - p1.latitude);
    const dLon = toRad(p2.longitude - p1.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function isValidAssetType(assetType) {
    return Object.keys(ASSET_MARKERS).includes(assetType);
}

// === 3. KEYBOARD & MENU ===
const assetSelectionKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🔴 Tiang Baru', callback_data: 'asset_tb' }, { text: '🔵 Tiang Eksisting', callback_data: 'asset_te' }],
            [{ text: '🟢 ODP', callback_data: 'asset_odp' }, { text: '🔺 ODC', callback_data: 'asset_odc' }],
            [{ text: '🔲 Handhole PIT', callback_data: 'asset_hh_pit' }, { text: '🔳 Handhole NEW', callback_data: 'asset_hh_new' }],
            [{ text: '🟨 Kabel Galian', callback_data: 'asset_trench' }],
            [{ text: '❌ Hapus Titik Terakhir', callback_data: 'asset_remove' }],
            [{ text: '✅ Selesai & Lanjut', callback_data: 'asset_done' }]
        ]
    }
};

const lineTypeKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: '🔵 Kabel Udara', callback_data: 'line_aerial' }],
            [{ text: '🟨 Kabel Galian Kuning', callback_data: 'line_trench_yellow' }],
            [{ text: '🟥 Kabel Galian Merah', callback_data: 'line_trench_red' }]
        ]
    }
};

// === 4. PEMBUATAN LAPORAN ===
async function processAndSendResults(chatId, userId) {
    logActivity({ from: { id: userId } }, 'Processing map and KML');
    const session = userSessions[userId];
    if (!session?.points?.length) {
        return bot.sendMessage(chatId, '⚠️ Tidak ada titik yang dapat dipetakan.');
    }

    await bot.sendMessage(chatId, '⏳ Sedang memproses peta dan file KML, mohon tunggu...');

    try {
        const mapUrl = `https://maps.geoapify.com/v1/staticmap?apiKey=${GEOAPIFY_API_KEY}`;
        const markers = [];
        session.points.forEach((point, pointIndex) => {
            const pointLabel = String.fromCharCode(65 + pointIndex);
            markers.push({
                type: 'circle',
                color: '#3498db',
                size: 'large',
                text: pointLabel,
                textColor: '#ffffff',
                lat: point.latitude,
                lon: point.longitude
            });
        });

        const geometries = [];
        if (session.points.length > 1) {
            for (let i = 0; i < session.points.length - 1; i++) {
                const start = session.points[i], end = session.points[i + 1];
                const lineColor = LINE_COLORS[start.lineType] || '#000000';
                geometries.push({
                    type: 'polyline',
                    linecolor: lineColor,
                    linewidth: 4,
                    value: [{ lat: start.latitude, lon: start.longitude }, { lat: end.latitude, lon: end.longitude }]
                });
            }
        }

        const postBody = { style: 'osm-bright', width: 1200, height: 900, markers, geometries };
        const imageResponse = await axios.post(mapUrl, postBody, { headers: { 'Content-Type': 'application/json' }, responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');

        const { imageCaption, detailMessage } = generateMapDetails(session);

        await bot.sendDocument(chatId, imageBuffer, {
            caption: imageCaption,
            parse_mode: 'Markdown'
        }, {
            filename: `peta_${session.projectName || 'proyek'}.png`,
            contentType: 'image/png'
        });

        if (detailMessage.length > 4096) {
            await bot.sendMessage(chatId, "Laporan detail terlalu panjang untuk ditampilkan.");
        } else {
            await bot.sendMessage(chatId, detailMessage, { parse_mode: 'Markdown' });
        }

        const kmlContent = generateKmlContent(session);
        const kmlFileName = `Peta_${session.projectName || 'Proyek'}.kml`;
        const kmlFilePath = path.join(__dirname, kmlFileName);
        fs.writeFileSync(kmlFilePath, kmlContent);
        await bot.sendDocument(chatId, kmlFilePath, {
            caption: `File KML untuk proyek ${session.projectName}`,
            contentType: 'application/vnd.google-earth.kml+xml'
        });
        fs.unlinkSync(kmlFilePath);

    } catch (error) {
        console.error('[ERROR] Gagal memproses hasil:', error.message, error.stack);
        bot.sendMessage(chatId, `❌ Maaf, terjadi kesalahan saat membuat laporan. Detail error: ${error.message}`);
    } finally {
        delete userSessions[userId];
    }
}

function generateMapDetails(session) {
    const { points, projectName, taskName } = session;
    let totalDistance = 0, distanceDetails = '', pointDetails = '';

    points.forEach((point, index) => {
        const pointLabel = String.fromCharCode(65 + index);
        const assets = point.types.map(type => {
            const marker = ASSET_MARKERS[type];
            const name = point.customNames?.[type] || marker.defaultName || type.toUpperCase();
            return `${marker.name}: ${name}`;
        }).join(', ');
        const lineTypeName = point.lineType ? (point.lineType === 'aerial' ? 'Udara' : `Galian ${point.lineType.split('_')[1]}`) : '';
        pointDetails += `\n• *Titik ${pointLabel}* ${lineTypeName ? `(Kabel: ${lineTypeName})` : ''}\n  Koordinat: ${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}\n  Aset: ${assets || 'Tidak ada'}`;
    });

    if (points.length > 1) {
        for (let i = 0; i < points.length - 1; i++) {
            const distance = getHaversineDistance(points[i], points[i + 1]);
            totalDistance += distance;
            distanceDetails += `\n• Jarak ${String.fromCharCode(65 + i)} ke ${String.fromCharCode(65 + i + 1)}: *${distance.toFixed(0).toLocaleString('id-ID')} meter*`;
        }
    }

    const totalDistanceText = totalDistance > 0 ? `\n\n*📏 Total Jarak*: ${totalDistance.toFixed(0).toLocaleString('id-ID')} meter` : '';
    const projectHeader = `*Nama Proyek:* ${projectName || 'Tdk Ditentukan'}\n*Pekerjaan:* ${taskName || 'Tdk Ditentukan'}`;
    const imageCaption = `*🗺️ Laporan Pemetaan*\n\n${projectHeader}\n\n*Catatan:* Detail lengkap ada di pesan teks berikutnya dan file KML.`;
    const detailMessage = `*📋 Rincian Titik & Jarak Laporan*\n${pointDetails}\n${distanceDetails}${totalDistanceText}`;

    return { imageCaption, detailMessage };
}

function generateKmlContent(session) {
    const { points, projectName, taskName } = session;
    let placemarksByFolder = {};

    const kmlStyles = Object.keys(ASSET_MARKERS).map(key => `
    <Style id="style_${key}">
        <IconStyle><scale>1.2</scale><Icon><href>${ASSET_MARKERS[key].kmlIcon}</href></Icon></IconStyle>
    </Style>`).join('');

    points.forEach(point => {
        point.types.forEach(type => {
            if (!placemarksByFolder[type]) placemarksByFolder[type] = '';
            const marker = ASSET_MARKERS[type];
            const placemarkName = point.customNames?.[type] || marker.defaultName || type.toUpperCase();
            placemarksByFolder[type] += `<Placemark><name>${placemarkName}</name><description>Koordinat: ${point.latitude}, ${point.longitude}</description><styleUrl>#style_${type}</styleUrl><Point><coordinates>${point.longitude},${point.latitude},0</coordinates></Point></Placemark>`;
        });
    });

    const assetFolders = Object.keys(placemarksByFolder).map(type => {
        let folderName = (ASSET_MARKERS[type]?.name || 'Aset').replace(/<[^>]*>/g, '').trim();
        // PERUBAHAN DI SINI: Mengubah nama folder KML khusus untuk 'trench'
        if (type === 'trench') {
            folderName = 'Galian';
        }
        return `<Folder><name>${folderName}</name>${placemarksByFolder[type]}</Folder>`;
    }).join('');

    let kmlLineStrings = '';
    if (points.length > 1) {
        for (let i = 0; i < points.length - 1; i++) {
            const start = session.points[i], end = session.points[i + 1];
            const distance = getHaversineDistance(start, end);
            const lineColor = LINE_COLORS[start.lineType] || '#000000';
            const hex = lineColor.replace('#', '');
            const kmlColor = `ff${hex.substring(4, 6)}${hex.substring(2, 4)}${hex.substring(0, 2)}`;
            const lineName = `Garis dari Titik ${String.fromCharCode(65 + i)} ke ${String.fromCharCode(65 + i + 1)}`;
            kmlLineStrings += `<Placemark><name>${lineName}</name><description>Panjang: ${distance.toFixed(0)} meter</description><Style><LineStyle><color>${kmlColor}</color><width>4</width></LineStyle></Style><LineString><tessellate>1</tessellate><coordinates>${start.longitude},${start.latitude},0 ${end.longitude},${end.latitude},0</coordinates></LineString></Placemark>`;
        }
    }

    return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${projectName||'Peta Proyek'}</name><description>${taskName||''}</description>${kmlStyles}<Folder><name>Infrastruktur</name><Folder><name>Titik Aset</name>${assetFolders}</Folder><Folder><name>Rute Kabel</name>${kmlLineStrings}</Folder></Folder></Document></kml>`;
}


// === 5. HANDLER INTERAKSI PENGGUNA ===
bot.on('callback_query', async (cb) => {
    const { message, data, from } = cb;
    logActivity(cb, `Callback: ${data}`);
    const session = userSessions[from.id];
    if (!session) return bot.answerCallbackQuery(cb.id, { text: 'Sesi tidak ditemukan. Mulai dengan /new.', show_alert: true }).catch(() => {});

    try {
        if (data.startsWith('asset_')) await handleAssetSelection(cb, session);
        else if (data.startsWith('line_')) await handleLineTypeSelection(cb, session);
    } catch (error) {
        console.error('[ERROR] Gagal menangani callback:', error.message);
        bot.sendMessage(message.chat.id, '❌ Maaf, terjadi kesalahan. Silakan coba lagi.');
    }
});

async function handleAssetSelection(cb, session) {
    const { message, data } = cb;
    const chatId = message.chat.id;
    const assetType = data.substring('asset_'.length);

    if (assetType === 'done') {
        if (!session.pendingPoint || session.pendingPoint.types.length === 0) return bot.answerCallbackQuery(cb.id, { text: '❌ Pilih minimal satu aset!', show_alert: true });
        session.state = 'awaiting_line_type';
        await bot.editMessageText('✅ Aset dipilih. Sekarang, pilih jenis kabel dari titik ini:', { chat_id: chatId, message_id: message.message_id, ...lineTypeKeyboard });
        return bot.answerCallbackQuery(cb.id);
    }
    
    if (assetType === 'remove') {
        if (session.points.length > 0) {
            session.points.pop();
            await bot.answerCallbackQuery(cb.id, { text: `✅ Titik terakhir dihapus.` });
            await bot.editMessageText(`Titik terakhir dihapus. Kirim lokasi berikutnya, atau ketik /done.`, { chat_id: chatId, message_id: message.message_id });
        } else {
            await bot.answerCallbackQuery(cb.id, { text: '⚠️ Tidak ada titik untuk dihapus.', show_alert: true });
        }
        return;
    }

    if (isValidAssetType(assetType)) {
        if (!session.pendingPoint.types.includes(assetType)) {
            session.pendingPoint.types.push(assetType);
            await bot.answerCallbackQuery(cb.id, { text: `✅ ${ASSET_MARKERS[assetType].name} ditambahkan.` });
            if (['odc', 'odp', 'tb', 'te'].includes(assetType)) {
                session.state = 'awaiting_asset_name';
                session.pendingAssetType = assetType;
                await bot.editMessageReplyMarkup(null, { chat_id: chatId, message_id: message.message_id });
                await bot.sendMessage(chatId, `Silakan masukkan nama/ID untuk ${ASSET_MARKERS[assetType].name}:`);
            }
        } else {
            await bot.answerCallbackQuery(cb.id, { text: `⚠️ Aset sudah dipilih.`, show_alert: false });
        }
    }
}

async function handleLineTypeSelection(cb, session) {
    const { message, data } = cb;
    const chatId = message.chat.id;
    const lineType = data.substring('line_'.length);

    session.pendingPoint.lineType = lineType;
    session.points.push({ ...session.pendingPoint });
    
    delete session.pendingPoint;
    delete session.pendingAssetType;
    session.state = 'awaiting_location';

    const lineName = lineType === 'aerial' ? 'Udara' : `Galian ${lineType.split('_')[1]}`;
    await bot.editMessageText(`✅ Titik ${String.fromCharCode(64 + session.points.length)} dengan kabel *${lineName}* ditambahkan.\n\nKirim lokasi berikutnya, atau ketik /done.`, {
        chat_id: chatId, message_id: message.message_id, parse_mode: 'Markdown'
    });
    await bot.answerCallbackQuery(cb.id);
}

// === 6. HANDLER PERINTAH & PESAN ===
const panduanOperasi = `*Panduan Operasi Bot:*\n
1️⃣ */new* - Mulai sesi pemetaan baru.
2️⃣ *Kirim Lokasi* - Lampirkan lokasi.
3️⃣ *Pilih Aset* di titik itu, lalu klik 'Selesai & Lanjut'.
4️⃣ *Pilih Jenis Kabel* yang terhubung dari titik itu.
5️⃣ Ulangi langkah 2-4 untuk semua titik.
6️⃣ */done* - Selesaikan & hasilkan peta dan KML.
\nGunakan */cancel* untuk membatalkan.`;

bot.onText(/\/register (.+)/, (msg, match) => {
    logActivity(msg, 'Register command');
    const nik = match[1].trim();
    if (ALLOWED_NIKS.includes(nik)) {
        verifiedUsers.add(msg.from.id);
        bot.sendMessage(msg.chat.id, `✅ Selamat datang, *${msg.from.first_name}*! Pendaftaran berhasil.\n\n${panduanOperasi}`, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(msg.chat.id, '❌ NIK Anda tidak dikenali.');
    }
});

bot.onText(/\/start|\/help/, (msg) => {
    logActivity(msg, 'Start/Help command');
    const userId = msg.from.id;
    if (isAuthenticated(userId)) {
        bot.sendMessage(msg.chat.id, `Halo *${msg.from.first_name}*, selamat datang kembali!\n\n${panduanOperasi}`, { parse_mode: 'Markdown' });
    } else {
        const registrationGuide = `👋 Selamat datang di Bot Pemetaan!\n\n*🔐 Pendaftaran Diperlukan*\n` +
                                  `Untuk menggunakan bot, daftarkan NIK Anda:\n` +
                                  `Gunakan format: \`/register NIK_ANDA\``;
        bot.sendMessage(msg.chat.id, registrationGuide, { parse_mode: 'Markdown' });
    }
});

bot.onText(/\/new/, (msg) => {
    logActivity(msg, 'New session command');
    const userId = msg.from.id;
    if (!isAuthenticated(userId)) return bot.sendMessage(msg.chat.id, '🚫 Anda belum terdaftar. Gunakan `/register NIK_ANDA`', { parse_mode: 'Markdown' });
    if (userSessions[userId]) return bot.sendMessage(msg.chat.id, '⚠️ Sesi lama masih berjalan. Selesaikan dengan `/done` atau batalkan dengan `/cancel`.', { parse_mode: 'Markdown' });
    
    userSessions[userId] = { points: [], state: 'awaiting_project_name' };
    bot.sendMessage(msg.chat.id, '🆕 Sesi baru dimulai.\n\nSilakan masukkan *Nama Proyek*:', { parse_mode: 'Markdown' });
});

bot.onText(/\/done/, (msg) => {
    logActivity(msg, 'Done command');
    if (!isAuthenticated(msg.from.id)) return;
    const session = userSessions[msg.from.id];
    if (!session || !session.points.length) return bot.sendMessage(msg.chat.id, '❌ Tidak ada titik untuk dipetakan.');
    processAndSendResults(msg.chat.id, msg.from.id);
});

bot.onText(/\/cancel/, (msg) => {
    logActivity(msg, 'Cancel command');
    if (!isAuthenticated(msg.from.id)) return;
    delete userSessions[msg.from.id];
    bot.sendMessage(msg.chat.id, '❌ Sesi pemetaan telah dibatalkan.');
});

// PERUBAHAN DI SINI: Penambahan log activity untuk lokasi
bot.on('location', (msg) => {
    logActivity(msg, 'Location received');
    const { from, chat, location } = msg;
    if (!isAuthenticated(from.id)) return;
    const session = userSessions[from.id];
    
    if (!session) return bot.sendMessage(chat.id, '⚠️ Sesi tidak ditemukan. Mulai dengan /new.');
    if (session.state !== 'awaiting_location') {
        return bot.sendMessage(chat.id, '⚠️ Belum bisa mengirim lokasi baru. Selesaikan *Aset* & *Jenis Kabel* untuk titik sebelumnya.', { parse_mode: 'Markdown' });
    }

    session.pendingPoint = { latitude: location.latitude, longitude: location.longitude, types: [], customNames: {} };
    session.state = 'awaiting_asset_type';
    bot.sendMessage(chat.id, `📍 Lokasi *Titik ${String.fromCharCode(65 + session.points.length)}* diterima. Pilih semua aset di titik ini:`, { ...assetSelectionKeyboard, parse_mode: 'Markdown' });
});

bot.on('message', (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    logActivity(msg, 'Text message received');
    const { from, chat, text } = msg;
    
    if (!isAuthenticated(from.id) && !userSessions[from.id]) {
         return bot.sendMessage(chat.id, '🚫 Anda belum terdaftar. Gunakan `/register NIK_ANDA`', { parse_mode: 'Markdown' });
    }
    
    const session = userSessions[from.id];
    if (!session) return bot.sendMessage(chat.id, 'Maaf, saya tidak mengerti. Mulai sesi baru dengan /new.');

    if (session.state === 'awaiting_project_name') {
        session.projectName = text;
        session.state = 'awaiting_task_name';
        return bot.sendMessage(chat.id, `✅ Nama proyek diatur. Masukkan *Nama Pekerjaan*:`, { parse_mode: 'Markdown' });
    }
    
    if (session.state === 'awaiting_task_name') {
        session.taskName = text;
        session.state = 'awaiting_location';
        return bot.sendMessage(chat.id, `✅ Siap! Kirim lokasi pertama Anda.`);
    }

    if (session.state === 'awaiting_asset_name') {
        const assetType = session.pendingAssetType;
        if (text.trim()) {
            session.pendingPoint.customNames = session.pendingPoint.customNames || {};
            session.pendingPoint.customNames[assetType] = text.trim();
        }
        session.state = 'awaiting_asset_type';
        delete session.pendingAssetType;
        return bot.sendMessage(chat.id, `✅ Nama aset diatur. Pilih aset lain atau klik "Selesai & Lanjut".`, assetSelectionKeyboard);
    }
});

// === 7. PENANGANAN ERROR & STARTUP ===
bot.on('polling_error', (err) => console.error('[ERROR] Polling error:', err.message));

console.log('🤖 Bot Pemetaan siap beroperasi...');