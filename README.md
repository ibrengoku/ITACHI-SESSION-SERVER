# 🥷 ITACHI-XMD Session Generator

Serveur de génération de Session ID pour **ITACHI-XMD v2.0**  
Propulsé par **IBSACKO™ · CENTRAL HEX**

---

## 🚀 Déploiement

### Railway (recommandé)
1. Upload ce dossier sur GitHub
2. New Project → Deploy from GitHub
3. Variable : `PORT = 3000`

### Render
1. Upload sur GitHub  
2. New Web Service → Connect Repo
3. Build: `npm install` | Start: `node index.js`

---

## 🌐 Routes API

| Route | Description |
|-------|-------------|
| `GET /` | Site web |
| `GET /pair?number=224621963059` | Génère le pair code |
| `GET /qr` | Génère le QR code (image PNG) |
| `GET /status` | Statut du serveur |

---

## 📋 Comment utiliser

1. Déploie ce serveur sur Railway/Render
2. Va sur l'URL de ton serveur
3. Entre ton numéro WhatsApp
4. Entre le code dans WhatsApp → Appareils liés
5. Copie le **Session ID** `itachi~xxxxx` dans tes messages
6. Colle dans la variable `SESSION_ID` de ton bot

---

**IBSACKO™ · CENTRAL HEX · 2026**
