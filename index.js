'use strict';

// Fix crypto Node.js 18
const { webcrypto } = require('crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ══ EXPRESS ══
const app = express();
app.use(express.json());

// Halaman pairing
app.get('/', (req, res) => res.redirect('/pairing'));
app.get('/pairing', async (req, res) => {
  let code = '-', ts = '-';
  try {
    const snap = await db.collection('config').doc('pairingCode').get();
    if (snap.exists) {
      code = snap.data().code || '-';
      const t = snap.data().ts?.toDate?.();
      if (t) ts = t.toLocaleTimeString('id-ID');
    }
  } catch(e) {}
  const botNum = (process.env.BOT_NUMBER || '').replace(/[^0-9]/g,'');
  res.send(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="8">
<title>KPC Bot Pairing</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',sans-serif;background:#03070d;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;}
.box{background:#060d18;border:1px solid rgba(0,240,255,.3);border-radius:20px;padding:24px;width:100%;max-width:380px;text-align:center;}
h1{color:#00f0ff;font-size:18px;margin-bottom:4px;}
.sub{color:rgba(255,255,255,.35);font-size:11px;margin-bottom:20px;}
.code-wrap{background:#000;border:2px solid #00f0ff;border-radius:14px;padding:18px;margin-bottom:12px;cursor:pointer;}
.code{font-family:monospace;font-size:40px;font-weight:900;letter-spacing:10px;color:#00f0ff;text-shadow:0 0 20px rgba(0,240,255,.6);}
.hint{font-size:11px;color:rgba(255,255,255,.3);margin-top:6px;}
.ts{font-size:11px;color:rgba(255,255,255,.25);margin-bottom:6px;}
.refresh{font-size:11px;color:rgba(255,200,0,.5);margin-bottom:18px;}
.steps{text-align:left;background:rgba(255,255,255,.04);border-radius:12px;padding:12px;margin-bottom:16px;}
.steps p{font-size:12px;color:rgba(255,255,255,.65);margin-bottom:5px;line-height:1.5;}
.btn{display:block;padding:12px;border-radius:12px;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:8px;}
.btn-wa{background:linear-gradient(135deg,#25d366,#128c7e);color:#fff;}
.btn-ref{background:rgba(0,240,255,.08);border:1px solid rgba(0,240,255,.25);color:#00f0ff;}
.copied{background:rgba(0,230,118,.15);color:#00e676;padding:6px 12px;border-radius:20px;font-size:11px;display:none;margin-bottom:8px;}
</style>
</head><body>
<div class="box">
  <h1>🔑 KODE PAIRING KPC BOT</h1>
  <div class="sub">Auto refresh tiap 8 detik</div>
  <div class="code-wrap" onclick="copyCode()">
    <div class="code" id="codeEl">${code}</div>
    <div class="hint">👆 Tap untuk copy</div>
  </div>
  <div class="ts">⏰ ${ts}</div>
  <div id="copiedMsg" class="copied">✅ Kode berhasil dicopy!</div>
  <div class="refresh">🔄 Refresh otomatis dalam 8 detik</div>
  <div class="steps">
    <p>1️⃣ Tap kode di atas untuk copy</p>
    <p>2️⃣ Buka WA nomor: <b>+${botNum}</b></p>
    <p>3️⃣ 3 titik → Perangkat Tertaut</p>
    <p>4️⃣ Tautkan Perangkat → Tautkan dengan nomor telepon</p>
    <p>5️⃣ Paste kode — <b style="color:#ff4">dalam 30 detik!</b></p>
  </div>
  <a class="btn btn-wa" href="whatsapp://app">📱 Buka WhatsApp</a>
  <a class="btn btn-ref" href="/pairing">🔄 Refresh Manual</a>
</div>
<script>
function copyCode(){
  const c=document.getElementById('codeEl').textContent.trim();
  if(c==='-') return;
  if(navigator.clipboard){
    navigator.clipboard.writeText(c).then(()=>showCopied());
  } else {
    const el=document.createElement('textarea');
    el.value=c; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el); showCopied();
  }
}
function showCopied(){
  const el=document.getElementById('copiedMsg');
  el.style.display='block';
  setTimeout(()=>el.style.display='none',2000);
}
</script>
</body></html>`);
});

app.get('/status', async (req, res) => {
  let status = { bot: 'unknown', pending: 0, done: 0 };
  try {
    const s = await db.collection('config').doc('botStatus').get();
    status.bot = s.exists && s.data().online ? 'online' : 'offline';
    const p = await db.collection('orders').where('status','==','pending').get();
    const d = await db.collection('orders').where('status','==','done').get();
    status.pending = p.size; status.done = d.size;
  } catch(e) {}
  res.json(status);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🌐 Web: http://localhost:' + PORT));

// ══ FIREBASE ══
let db;
try {
  const cred = JSON.parse(process.env.FIREBASE_CREDENTIAL || '{}');
  initializeApp({ credential: cert(cred) });
  db = getFirestore();
  console.log('✅ Firebase OK');
} catch(e) {
  console.error('❌ Firebase error:', e.message);
  process.exit(1);
}

// ══ CONFIG ══
const ADMIN_NUMBERS = ['628983923559','6281252425581','6288989378157','628211549460'];
const ADMIN_NAMES   = ['Alfian','Nanang','Bos Tuyul','Vinzzz'];
const BOT_NUM = (process.env.BOT_NUMBER || '').replace(/[^0-9]/g,'');
const AUTH_DIR = path.join(__dirname, 'auth_info');

// Reset auth kalau diminta
if (process.env.RESET_AUTH === 'true') {
  try { fs.rmSync(AUTH_DIR, { recursive: true }); console.log('🔄 Auth reset!'); } catch(e) {}
}

// Format nomor
function fmtJid(num) {
  let n = String(num).replace(/[^0-9]/g,'');
  if (!n.endsWith('@s.whatsapp.net')) n += '@s.whatsapp.net';
  return n;
}

// ══ BOT ══
let sock, retryCount = 0, pairingRequested = false, listenersStarted = false;

async function startBot() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
      },
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['KPC Store Bot', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
    });

    // ── PAIRING CODE ──
    if (!state.creds.registered && !pairingRequested) {
      if (!BOT_NUM) { console.log('❌ Set BOT_NUMBER di Railway!'); return; }
      pairingRequested = true;
      await new Promise(r => setTimeout(r, 3000));
      try {
        const code = await sock.requestPairingCode(BOT_NUM);
        console.log('\n╔══════════════════════════╗');
        console.log('║   KODE PAIRING WA BOT    ║');
        console.log('╠══════════════════════════╣');
        console.log('║  KODE: ' + code + '  ║');
        console.log('╚══════════════════════════╝');
        console.log('⏳ Berlaku 60 detik!\n');
        await db.collection('config').doc('pairingCode').set({
          code, ts: FieldValue.serverTimestamp()
        }).catch(()=>{});
      } catch(e) {
        console.log('⚠️ Pairing error:', e.message);
        pairingRequested = false;
      }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log('🔌 Disconnected, code:', code);

        if (code === DisconnectReason.loggedOut) {
          console.log('🚪 Logged out! Reset auth dan restart.');
          try { fs.rmSync(AUTH_DIR, { recursive: true }); } catch(e) {}
          pairingRequested = false;
          retryCount = 0;
          setTimeout(startBot, 3000);
          return;
        }

        if (code === DisconnectReason.connectionReplaced) {
          console.log('⚠️ Connection replaced.');
          return;
        }

        retryCount++;
        const delay = Math.min(retryCount * 5000, 30000);
        console.log(`🔄 Reconnect dalam ${delay/1000}s... (ke-${retryCount})`);
        setTimeout(startBot, delay);

      } else if (connection === 'open') {
        console.log('✅ Bot WA KPC Store ONLINE!');
        retryCount = 0;
        pairingRequested = false;
        await db.collection('config').doc('botStatus').set({
          online: true, ts: FieldValue.serverTimestamp()
        }).catch(()=>{});
        if (!listenersStarted) {
          listenersStarted = true;
          listenOrders();
          listenChats();
        }
      }
    });

    // ── TERIMA PESAN ──
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe || !msg.message) continue;
        const from = msg.key.remoteJid;
        if (!from || from.includes('@g.us')) continue; // skip group
        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption || ''
        ).trim();
        if (!text) continue;
        const senderNum = from.replace('@s.whatsapp.net','');
        const adminIdx = ADMIN_NUMBERS.indexOf(senderNum);
        if (adminIdx >= 0) {
          await handleAdmin(from, text, senderNum, ADMIN_NAMES[adminIdx]).catch(e=>console.log('Admin err:',e.message));
        } else {
          await handleBuyer(from, text, senderNum).catch(e=>console.log('Buyer err:',e.message));
        }
      }
    });

  } catch(e) {
    console.error('❌ startBot error:', e.message);
    retryCount++;
    setTimeout(startBot, Math.min(retryCount * 5000, 30000));
  }
}

// ── KIRIM PESAN ──
async function send(jid, text) {
  try { await sock.sendMessage(jid, { text }); } catch(e) { console.log('Send err:', e.message); }
}

async function sendAll(text) {
  for (const num of ADMIN_NUMBERS) {
    await send(fmtJid(num), text).catch(()=>{});
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── HANDLE ADMIN ──
async function handleAdmin(from, text, num, name) {
  const cmd = text.trim().toLowerCase();

  if (cmd === '!help' || cmd === '!bantuan') {
    await send(from,
      '╔══════════════════╗\n║  KPC BOT COMMAND  ║\n╚══════════════════╝\n\n' +
      '📋 *ORDER:*\n!pending → order pending\n!done [ID] → selesaikan order\n!cancel [ID] → batalkan order\n\n' +
      '💬 *CHAT:*\n!chat → chat masuk\n!balas [nama] [pesan] → balas pembeli\n\n' +
      '📊 *LAIN:*\n!status → status toko\n!online → set online\n!offline → set offline'
    ); return;
  }

  if (cmd === '!pending') {
    const snap = await db.collection('orders').where('status','==','pending').orderBy('createdAt','desc').limit(10).get();
    if (snap.empty) { await send(from, '✅ Tidak ada order pending!'); return; }
    let msg = '📋 *ORDER PENDING:*\n\n';
    snap.forEach(d => {
      const o = d.data();
      msg += `🧾 #${o.orderId||d.id.slice(-6).toUpperCase()}\n🎮 ${o.usn||'-'}\n💰 Rp ${(o.totalRb||0).toLocaleString('id-ID')}.000\n🕐 ${o.tStr||'-'}\n\n`;
    });
    await send(from, msg); return;
  }

  if (cmd.startsWith('!done ') || cmd.startsWith('!selesai ')) {
    const id = text.split(' ')[1]?.toUpperCase();
    if (!id) { await send(from, '⚠️ Format: !done [ORDER_ID]'); return; }
    const snap = await db.collection('orders').where('orderId','==',id).limit(1).get();
    if (snap.empty) { await send(from, '❌ Order #'+id+' tidak ditemukan!'); return; }
    const order = snap.docs[0].data();
    await snap.docs[0].ref.update({ status: 'done' });
    await send(from, '✅ Order #'+id+' SELESAI!');
    if (order.buyerWa) {
      await send(fmtJid(order.buyerWa),
        '✅ *ORDER SELESAI!*\n\nHalo *'+order.usn+'*! Order kamu sudah diproses!\n\n' +
        '*Order ID:* #'+id+'\n*Total:* Rp '+(order.totalRb||0).toLocaleString('id-ID')+'.000\n\n' +
        'Terima kasih belanja di *KPC Store* 🏍️\nJangan lupa kasih testimoni ya! 🌟'
      );
    }
    return;
  }

  if (cmd.startsWith('!cancel ') || cmd.startsWith('!batal ')) {
    const id = text.split(' ')[1]?.toUpperCase();
    if (!id) { await send(from, '⚠️ Format: !cancel [ORDER_ID]'); return; }
    const snap = await db.collection('orders').where('orderId','==',id).limit(1).get();
    if (snap.empty) { await send(from, '❌ Order #'+id+' tidak ditemukan!'); return; }
    const order = snap.docs[0].data();
    await snap.docs[0].ref.update({ status: 'cancel' });
    await send(from, '❌ Order #'+id+' DIBATALKAN!');
    if (order.buyerWa) {
      await send(fmtJid(order.buyerWa),
        '❌ *ORDER DIBATALKAN*\n\nHalo *'+order.usn+'*, maaf order kamu dibatalkan.\n\n' +
        '*Order ID:* #'+id+'\n\nHubungi admin untuk info lebih lanjut 🙏'
      );
    }
    return;
  }

  if (cmd === '!online') {
    await db.collection('config').doc('adminStatus').set({ [num]: true }, { merge: true });
    await send(from, '✅ Kamu ONLINE di toko!'); return;
  }

  if (cmd === '!offline') {
    await db.collection('config').doc('adminStatus').set({ [num]: false }, { merge: true });
    await send(from, '😴 Kamu OFFLINE di toko!'); return;
  }

  if (cmd === '!status') {
    const p = await db.collection('orders').where('status','==','pending').get();
    const d = await db.collection('orders').where('status','==','done').get();
    await send(from, '📊 *STATUS KPC STORE*\n\n⏳ Pending: '+p.size+'\n✅ Selesai: '+d.size+'\n\n✅ Bot Online'); return;
  }

  if (cmd === '!chat') {
    const snap = await db.collection('livechat').where('type','==','user').orderBy('ts','desc').limit(10).get();
    if (snap.empty) { await send(from, '💬 Belum ada chat!'); return; }
    let msg = '💬 *CHAT MASUK:*\n\n';
    snap.forEach(d => { const o=d.data(); msg += `👤 *${o.name||'-'}*: ${(o.text||'').slice(0,50)}\n`; });
    msg += '\n_!balas [nama] [pesan]_';
    await send(from, msg); return;
  }

  if (cmd.startsWith('!balas ')) {
    const parts = text.split(' ');
    const nama = parts[1];
    const pesan = parts.slice(2).join(' ');
    if (!nama || !pesan) { await send(from, '⚠️ Format: !balas [nama] [pesan]'); return; }
    const snap = await db.collection('livechat').where('name','==',nama).limit(1).get();
    if (snap.empty) { await send(from, '❌ Pembeli '+nama+' tidak ditemukan!'); return; }
    const sessionId = snap.docs[0].data().sessionId;
    await db.collection('livechat').add({ sessionId, name:'Admin KPC', text:pesan, type:'admin', ts:FieldValue.serverTimestamp() });
    await send(from, '✅ Pesan terkirim ke '+nama+'!'); return;
  }
}

// ── HANDLE PEMBELI ──
async function handleBuyer(from, text, num) {
  const t = text.toLowerCase();
  let reply = '';

  if (t.includes('harga') || t.includes('price') || t.includes('berapa')) {
    reply = '📋 *HARGA KPC STORE*\n\n*🎮 GAMEPASS:*\n📻 Radio: 4rb\n🔧 Suspensi: 4rb\n🎨 Cat: 7rb\n⚙️ Aksesoris: 7rb\n🛞 Velg: 8rb\n🪪 Plat: 8rb\n➕ Slot: 9rb\n🏁 Drag: 12rb\n💎 Mewah: 13rb\n🚔 Polisi: 16rb\n💵 2x Gaji: 45rb\n\n*💰 CASH:*\n1jt=2rb | 5jt=3rb | 10jt=5rb\n50jt=7rb | 100jt=10rb | 500jt=37rb | 1M=70rb\n\n🛒 Order: https://kpc-store-dds.vercel.app';
  } else if (t.includes('cara') || t.includes('order') || t.includes('beli')) {
    reply = '🛒 *CARA ORDER:*\n\n1️⃣ Buka: https://kpc-store-dds.vercel.app\n2️⃣ Isi username Roblox + nomor WA\n3️⃣ Pilih item\n4️⃣ Klik Chat Admin\n5️⃣ Bayar via QRIS\n6️⃣ Tunggu 1-5 menit ✅';
  } else if (t.includes('bayar') || t.includes('qris') || t.includes('transfer')) {
    reply = '💳 *PEMBAYARAN:*\n\n✅ QRIS (scan di toko)\n✅ Transfer Bank\n\nSetelah bayar kirim bukti ke admin!';
  } else if (t.includes('lama') || t.includes('proses')) {
    reply = '⚡ Proses *1-5 menit* setelah konfirmasi! Admin langsung gerak 🚀';
  } else if (t.includes('aman') || t.includes('tipu') || t.includes('scam')) {
    reply = '🛡️ *100% AMAN!* Ribuan order berhasil. Ada Order ID sebagai bukti setiap transaksi ✅';
  } else if (t.includes('cek') || t.includes('lacak') || t.includes('status')) {
    reply = '🔍 Untuk cek status order, ketik Order ID kamu (contoh: #AB12CD)\nAtau buka dashboard di toko!';
  } else {
    reply = '👋 Halo! Saya bot KPC Store 🤖\n\nKetik:\n• *harga* → daftar harga\n• *cara order* → cara beli\n• *bayar* → info pembayaran\n• *aman?* → keamanan\n\nAtau langsung order:\n🛒 https://kpc-store-dds.vercel.app\n\nAdmin akan segera membalas! 💬';
  }

  await send(from, reply);

  // Notif ke admin
  await sendAll('🔔 *PESAN DARI PEMBELI*\n\n📱 +'+num+'\n💬 '+text.slice(0,100)+'\n\n_Balas: !balas atau WA langsung_');
}

// ── LISTENER FIREBASE → NOTIF ADMIN ──
function listenOrders() {
  console.log('👂 Listening orders...');
  db.collection('orders').where('status','==','pending')
    .onSnapshot(snap => {
      snap.docChanges().forEach(async change => {
        if (change.type !== 'added') return;
        const o = change.doc.data();
        const id = o.orderId || change.doc.id.slice(-6).toUpperCase();
        const msg =
          '🔔 *ORDER BARU!*\n\n' +
          '🧾 #'+id+'\n' +
          '🎮 '+o.usn+'\n' +
          '📱 '+(o.buyerWa||'-')+'\n' +
          '📍 '+(o.buyerLocation?.city||'-')+', '+(o.buyerLocation?.country||'-')+'\n' +
          '💰 Rp '+(o.totalRb||0).toLocaleString('id-ID')+'.000\n' +
          '🕐 '+(o.tStr||'-')+'\n\n' +
          '✅ !done '+id+'\n❌ !cancel '+id;
        await sendAll(msg);
      });
    }, e => console.log('Orders listener error:', e.message));
}

function listenChats() {
  console.log('👂 Listening chats...');
  db.collection('livechat').where('type','==','user')
    .onSnapshot(snap => {
      snap.docChanges().forEach(async change => {
        if (change.type !== 'added') return;
        const o = change.doc.data();
        const msg =
          '💬 *CHAT DI TOKO*\n\n' +
          '👤 '+(o.name||'-')+'\n' +
          '💬 '+o.text+'\n\n' +
          '_!balas '+(o.name||'nama')+' [pesan]_';
        await sendAll(msg);
      });
    }, e => console.log('Chat listener error:', e.message));
}

// ── START ──
startBot();
