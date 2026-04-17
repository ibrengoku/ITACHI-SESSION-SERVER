const { makeid } = require('./id');
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
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const TMP_BASE = path.join(os.tmpdir(), 'itachi-pair');
if (!fs.existsSync(TMP_BASE)) fs.mkdirSync(TMP_BASE, { recursive: true });

function removeDir(p) {
    try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

router.get('/', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    // ── Nettoyer et valider le numéro ──────────────────────
    let num = (req.query.number || '').replace(/[^0-9]/g, '');
    if (!num || num.length < 7 || num.length > 15) {
        return res.status(400).json({ error: 'Numéro invalide. Exemple: 224621963059' });
    }

    const id = makeid();
    const tempDir = path.join(TMP_BASE, id);
    fs.mkdirSync(tempDir, { recursive: true });

    let pairCodeSent = false;
    let sessionSent = false;
    let retries = 0;
    const MAX_RETRIES = 3;

    async function connect() {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);

        const sock = makeWASocket({
            version: [2, 3000, 1015901307],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(
                    state.keys,
                    pino({ level: 'fatal' }).child({ level: 'fatal' })
                )
            },
            printQRInTerminal: false,
            logger: pino({ level: 'fatal' }).child({ level: 'fatal' }),
            // ✅ FIX PRINCIPAL : browser Ubuntu Chrome — fonctionne avec wileys pour TOUS les numéros
            browser: Browsers.ubuntu('Chrome'),
            // ✅ Garder la connexion vivante
            keepAliveIntervalMs: 10000,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            // ✅ Pas de sync — plus rapide
            syncFullHistory: false,
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            getMessage: async () => undefined,
        });

        sock.ev.on('creds.update', saveCreds);

        // ✅ FIX : Demander le pair code seulement après que le socket est prêt
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'connecting') {
                console.log(`[pair] Connexion en cours pour ${num}...`);
            }

            if (connection === 'open') {
                console.log(`✅ [pair] Connecté ! Génération session pour ${num}`);

                if (sessionSent) return;
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
                        text: `╔═════════════════════╗\n║   🥷 *𝗜𝗧𝗔𝗖𝗛𝗜-𝗫𝗠𝗗-𝐕2* 🥷   ║\n╠═════════════════════╣\n║   ✅ SESSION GÉNÉRÉE       ║\n╚═════════════════════╝\n\n🎉 *Félicitations !*\nCopie le message *itachi~xxx* ci-dessus.\n\n📋 *Étapes :*\n┌─────────────────────\n│ 1️⃣ Copie ton Session ID\n│ 2️⃣ Va sur Railway / Render\n│ 3️⃣ SESSION_ID = itachi~xxx\n│ 4️⃣ Relance le bot ✅\n└─────────────────────\n\n> 🥷 *IBSACKO™ · CENTRAL HEX*`
                    }, { quoted: sentMsg });

                    console.log(`✅ [pair] Session envoyée pour ${num}`);
                } catch (e) {
                    console.error('[pair] Erreur envoi session:', e.message);
                }

                await delay(2000);
                try { sock.ws.close(); } catch {}
                setTimeout(() => removeDir(tempDir), 5000);
            }

            if (connection === 'close') {
                const code = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.message || '';
                console.log(`[pair] Fermé. Code: ${code}, Raison: ${reason}`);

                // Ne pas reconnecter si déjà connecté ou logout
                if (sessionSent) return;
                if (code === 401 || code === DisconnectReason.loggedOut) {
                    removeDir(tempDir);
                    return;
                }

                if (retries < MAX_RETRIES) {
                    retries++;
                    console.log(`[pair] Retry ${retries}/${MAX_RETRIES}...`);
                    await delay(3000);
                    connect();
                } else {
                    removeDir(tempDir);
                    if (!res.headersSent) {
                        res.status(503).json({ error: 'Connexion impossible après plusieurs tentatives. Réessaie.' });
                    }
                }
            }
        });

        // ✅ FIX CLEF : Demander le pair code DANS l'event open/connecting 
        // mais APRÈS que la socket soit initialisée
        if (!sock.authState.creds.registered && !pairCodeSent) {
            // Attendre que le socket soit prêt (connexion WebSocket établie)
            await delay(3000);

            try {
                const code = await sock.requestPairingCode(num);
                if (code) {
                    const formatted = code.match(/.{1,4}/g)?.join('-') || code;
                    pairCodeSent = true;
                    console.log(`✅ [pair] Code généré: ${formatted} pour ${num}`);
                    if (!res.headersSent) {
                        res.json({ code: formatted, number: num, status: 'success' });
                    }
                } else {
                    throw new Error('Code vide reçu');
                }
            } catch (e) {
                console.error('[pair] Erreur requestPairingCode:', e.message);
                removeDir(tempDir);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Impossible de générer le code. Réessaie dans 10 secondes.' });
                }
            }
        }
    }

    // Timeout global 2 minutes
    const globalTimeout = setTimeout(() => {
        removeDir(tempDir);
        if (!res.headersSent) {
            try { res.status(408).json({ error: 'Timeout. Le serveur met trop de temps. Réessaie.' }); } catch {}
        }
    }, 120000);

    res.on('finish', () => clearTimeout(globalTimeout));

    try {
        await connect();
    } catch (err) {
        console.error('[pair] Erreur fatale:', err.message);
        clearTimeout(globalTimeout);
        removeDir(tempDir);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Erreur serveur. Réessaie.' });
        }
    }
});

module.exports = router;
