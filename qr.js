const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pino = require('pino');
const router = express.Router();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const TMP_BASE = path.join(os.tmpdir(), 'itachi-qr');
if (!fs.existsSync(TMP_BASE)) fs.mkdirSync(TMP_BASE, { recursive: true });

function removeDir(p) {
    try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

router.get('/', async (req, res) => {
    const id = makeid();
    const tempDir = path.join(TMP_BASE, id);
    fs.mkdirSync(tempDir, { recursive: true });

    let qrSent = false;
    let sessionSent = false;

    async function connect() {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            keepAliveIntervalMs: 10000,
            connectTimeoutMs: 60000,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            getMessage: async () => undefined,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !qrSent) {
                qrSent = true;
                try {
                    const buf = await QRCode.toBuffer(qr, {
                        type: 'png', width: 300, margin: 2,
                        color: { dark: '#000000', light: '#ffffff' }
                    });
                    if (!res.headersSent) {
                        res.setHeader('Content-Type', 'image/png');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.end(buf);
                    }
                } catch (e) {
                    if (!res.headersSent) res.status(500).json({ error: 'Erreur QR' });
                }
            }

            if (connection === 'open' && !sessionSent) {
                sessionSent = true;
                await delay(3000);
                try {
                    const credsPath = path.join(tempDir, 'creds.json');
                    if (!fs.existsSync(credsPath)) return;
                    const b64 = Buffer.from(fs.readFileSync(credsPath)).toString('base64');
                    const sessionId = 'itachi~' + b64;
                    const botJid = sock.user.id;
                    const sentMsg = await sock.sendMessage(botJid, { text: sessionId });
                    await sock.sendMessage(botJid, {
                        text: `╔═════════════════════╗\n║   🥷 *𝗜𝗧𝗔𝗖𝗛𝗜-𝗫𝗠𝗗-𝐕2* 🥷   ║\n╠═════════════════════╣\n║   ✅ SESSION GÉNÉRÉE       ║\n╚═════════════════════╝\n\n🎉 Ton Session ID est dans le message ci-dessus !\nCopie-le dans la variable *SESSION_ID*.\n\n> 🥷 *IBSACKO™ · CENTRAL HEX*`
                    }, { quoted: sentMsg });
                } catch (e) {
                    console.error('[qr] Erreur envoi session:', e.message);
                }
                await delay(2000);
                try { sock.ws.close(); } catch {}
                setTimeout(() => removeDir(tempDir), 5000);
            }

            if (connection === 'close' && !sessionSent) {
                const code = lastDisconnect?.error?.output?.statusCode;
                if (code !== 401 && code !== DisconnectReason.loggedOut) {
                    await delay(3000);
                    connect();
                } else {
                    removeDir(tempDir);
                }
            }
        });
    }

    setTimeout(() => {
        removeDir(tempDir);
        if (!res.headersSent && !qrSent)
            try { res.status(408).json({ error: 'Timeout.' }); } catch {}
    }, 120000);

    try { await connect(); } catch (err) {
        removeDir(tempDir);
        if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur.' });
    }
});

module.exports = router;
