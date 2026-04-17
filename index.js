const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Créer les dossiers temp
[
    path.join(os.tmpdir(), 'itachi-pair'),
    path.join(os.tmpdir(), 'itachi-qr'),
    path.join(__dirname, 'public')
].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/pair', require('./pair'));
app.use('/qr', require('./qr'));

app.get('/status', (req, res) => res.json({
    status: 'online', bot: 'ITACHI-XMD', version: '2.0.0',
    owner: 'IBSACKO™', uptime: Math.floor(process.uptime())
}));

app.get('/ping', (req, res) => res.json({ pong: true }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handler erreurs
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
});

app.listen(PORT, () => {
    console.log(`🥷 ITACHI-XMD Session Server → Port ${PORT}`);
});

module.exports = app;
