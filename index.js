const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const express = require('express');
const pino = require('pino');

// Fix crypto Node.js 18
const { webcrypto } = require('crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// ══ EXPRESS SERVER ══
const app = express();
app.use(express.json());

// Halaman utama — status bot
app.get('/', (req, res) => res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KPC Bot WA</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',sans-serif;background:#03070d;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
.box{background:#060d18;border:1px solid rgba(0,240,255,.3);border-radius:20px;padding:28px;width:100%;max-width:360px;text-align:center;}
h1{font-size:28px;margin-bottom:4px;}
.sub{color:rgba(255,255,255,.4);font-size:13px;margin-bottom:20px;}
.status{padding:8px 20px;border-radius:20px;font-size:12px;font-weight:700;display:inline-block;margin-bottom:20px;}
.online{background:rgba(0,230,118,.15);color:#00e676;border:1px solid rgba(0,230,118,.3);}
.offline{background:rgba(255,34,68,.15);color:#ff4466;border:1px solid rgba(255,34,68,.3);}
a{display:block;margin-top:12px;padding:12px;background:rgba(0,240,255,.1);border:1px solid rgba(0,240,255,.3);border-radius:12px;color:#00f0ff;text-decoration:none;font-weight:700;}
</style>
</head>
<body>
<div class="box">
  <h1>🤖 KPC Bot</h1>
  <div class="sub">WhatsApp Bot - KPC Store</div>
  <div class="status online">● RUNNING</div>
  <a href="/pairing">🔑 LIHAT KODE PAIRING</a>
  <a href="/status">📊 STATUS BOT</a>
</div>
</body>
</html>
`));

// Halaman kode pairing — auto refresh tiap 10 detik
app.get('/pairing', async (req, res) => {
  let code = '-';
  let ts = '-';
  try {
    const snap = await db.collection('config').doc('pairingCode').get();
    if (snap.exists) {
      code = snap.data().code || '-';
      const t = snap.data().ts?.toDate?.();
      if (t) ts = t.toLocaleTimeString('id-ID');
    }
  } catch(e) {}

  const botNum = process.env.BOT_NUMBER || '';
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="8">
<title>Kode Pairing KPC Bot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',sans-serif;background:#03070d;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
.box{background:#060d18;border:1px solid rgba(0,240,255,.3);border-radius:20px;padding:28px;width:100%;max-width:380px;text-align:center;}
h1{font-size:20px;margin-bottom:4px;color:#00f0ff;}
.sub{color:rgba(255,255,255,.4);font-size:12px;margin-bottom:24px;}
.code-box{background:#000;border:2px solid #00f0ff;border-radius:14px;padding:20px;margin-bottom:16px;cursor:pointer;transition:background .2s;}
.code-box:active{background:#001a1a;}
.code{font-family:monospace;font-size:38px;font-weight:900;letter-spacing:8px;color:#00f0ff;text-shadow:0 0 20px rgba(0,240,255,.5);}
.code-hint{font-size:11px;color:rgba(255,255,255,.3);margin-top:6px;}
.ts{font-size:11px;color:rgba(255,255,255,.3);margin-bottom:16px;}
.refresh{font-size:11px;color:rgba(255,200,0,.5);margin-bottom:20px;}
.steps{text-align:left;background:rgba(255,255,255,.05);border-radius:12px;padding:14px;margin-bottom:16px;}
.steps p{font-size:13px;color:rgba(255,255,255,.7);margin-bottom:6px;line-height:1.5;}
.btn{display:block;padding:13px;background:linear-gradient(135deg,#25d366,#128c7e);border-radius:12px;color:#fff;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:8px;}
.btn2{display:block;padding:10px;background:rgba(0,240,255,.1);border:1px solid rgba(0,240,255,.3);border-radius:12px;color:#00f0ff;font-size:12px;text-decoration:none;}
</style>
</head>
<body>
<div class="box">
  <h1>🔑 KODE PAIRING WA BOT</h1>
  <div class="sub">Halaman ini auto refresh tiap 8 detik</div>
  
  <div class="code-box" onclick="copyCode()">
    <div class="code" id="codeText">${code}</div>
    <div class="code-hint">👆 Tap untuk copy kode</div>
  </div>
  
  <div class="ts">⏰ Generate: ${ts}</div>
  <div class="refresh">🔄 Auto refresh dalam 8 detik...</div>
  
  <div class="steps">
    <p>1️⃣ Copy kode di atas</p>
    <p>2️⃣ Buka WA nomor bot: <b>${botNum}</b></p>
    <p>3️⃣ Ketuk 3 titik → Perangkat Tertaut</p>
    <p>4️⃣ Tautkan Perangkat → Tautkan dengan nomor telepon</p>
    <p>5️⃣ Masukkan kode <b>dalam 30 detik!</b></p>
  </div>
  
  <a class="btn" href="whatsapp://app">📱 Buka WhatsApp</a>
  <a class="btn2" href="/pairing">🔄 Refresh Kode Manual</a>
</div>
<script>
function copyCode(){
  const code = document.getElementById('codeText').textContent;
  if(navigator.clipboard) navigator.clipboard.writeText(code).then(()=>alert('Kode '+code+' berhasil dicopy!'));
  else { const el=document.createElement('input'); el.value=code; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); alert('Kode '+code+' berhasil dicopy!'); }
}
</script>
</body>
</html>
`);
});

// Status bot
app.get('/status', async (req, res) => {
  let online = false;
  try {
    const snap = await db.collection('config').doc('botStatus').get();
    online = snap.exists && snap.data().online;
  } catch(e) {}
  let pending = 0, done = 0;
  try {
    const p = await db.collection('orders').where('status','==','pending').get();
    const d = await db.collection('orders').where('status','==','done').get();
    pending = p.size; done = d.size;
  } catch(e) {}
  res.json({ bot: online ? 'online' : 'offline', pending, done });
});

app.listen(process.env.PORT || 3000, () => console.log('🌐 Web server running'));

// ══ FIREBASE ══
let db;
try {
  const cred = JSON.parse(process.env.FIREBASE_CREDENTIAL || '{}');
  initializeApp({ credential: cert(cred) });
  db = getFirestore();
  console.log('✅ Firebase connected');
} catch(e) {
  console.error('❌ Firebase error:', e.message);
  process.exit(1);
}

const ADMIN_NUMBERS = ['628983923559','6281252425581','6288989378157','628211549460'];
const ADMIN_NAMES   = ['Alfian','Nanang','Bos Tuyul','Vinzzz'];
const BOT_NUM = (process.env.BOT_NUMBER || '').replace(/[^0-9]/g,'');

function fmtJid(n){ let x=n.replace(/[^0-9]/g,''); if(x.startsWith('0')) x='62'+x.slice(1); return x+'@s.whatsapp.net'; }
function cleanNum(jid){ return jid.replace(/@s\.whatsapp\.net|@g\.us/g,''); }

let sock;
let pairingDone = false;
let retryCount = 0;

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['KPC Store Bot', 'Chrome', '3.0'],
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
  });

  // ══ PAIRING CODE ══
  if (!sock.authState.creds.registered && !pairingDone) {
    if (!BOT_NUM) { console.log('❌ Set BOT_NUMBER di Railway Variables!'); return; }
    await new Promise(r => setTimeout(r, 3000));
    try {
      const code = await sock.requestPairingCode(BOT_NUM);
      pairingDone = true;
      console.log('\n╔══════════════════════════╗');
      console.log('║   KODE PAIRING WA BOT    ║');
      console.log('╠══════════════════════════╣');
      console.log('║  KODE: ' + code + '  ║');
      console.log('╚══════════════════════════╝');
      console.log('Buka WA → Perangkat Tertaut → Tautkan Perangkat → Masukkan Kode');
      console.log('Kode berlaku 60 detik!\n');
      // Simpan ke Firebase
      await db.collection('config').doc('pairingCode').set({ code, ts: FieldValue.serverTimestamp() });
    } catch(e) {
      console.log('Pairing error:', e.message);
    }
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || '';
      console.log('Disconnected:', code, reason);
      if (code === DisconnectReason.loggedOut) {
        console.log('Logged out! Hapus folder auth_info dan restart.');
        return;
      }
      retryCount++;
      const delay = Math.min(retryCount * 3000, 30000);
      console.log(`Reconnecting in ${delay/1000}s... (attempt ${retryCount})`);
      setTimeout(startBot, delay);
    } else if (connection === 'open') {
      console.log('✅ Bot WA KPC Store ONLINE!');
      retryCount = 0;
      pairingDone = true;
      await db.collection('config').doc('botStatus').set({ online: true, ts: FieldValue.serverTimestamp() }).catch(()=>{});
      listenOrders();
      listenChat();
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const from = msg.key.remoteJid;
      if (!from || from.endsWith('@g.us')) continue;
      const text = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
      if (!text) continue;
      const senderNum = cleanNum(from);
      const adminIdx = ADMIN_NUMBERS.indexOf(senderNum);
      if (adminIdx >= 0) {
        await handleAdmin(from, text, senderNum, ADMIN_NAMES[adminIdx]).catch(console.error);
      } else {
        await handleBuyer(from, text, senderNum).catch(console.error);
      }
    }
  });
}

// ══ ADMIN COMMANDS ══
async function handleAdmin(from, text, num, name) {
  const cmd = text.toLowerCase();
  if (cmd === '!help' || cmd === '!bantuan') {
    await sock.sendMessage(from, { text:
      '╔══ KPC BOT COMMAND ══╗\n\n' +
      '📋 ORDER:\n!pending → lihat pending\n!done ID → selesaikan order\n!cancel ID → batalkan order\n\n' +
      '💬 CHAT:\n!chat → lihat chat masuk\n!balas Nama pesan → balas chat\n\n' +
      '⚙️ ADMIN:\n!online → set online\n!offline → set offline\n!status → lihat statistik'
    });
    return;
  }
  if (cmd === '!pending') {
    const snap = await db.collection('orders').where('status','==','pending').orderBy('createdAt','desc').limit(10).get();
    if (snap.empty) { await sock.sendMessage(from,{text:'✅ Tidak ada order pending!'}); return; }
    let msg = '📋 *ORDER PENDING:*\n\n';
    snap.forEach(d => {
      const o = d.data();
      msg += `🧾 #${o.orderId||d.id.slice(-6).toUpperCase()} | 🎮 ${o.usn||'-'} | 💰 ${o.totalRb||0}rb\n📍 ${o.buyerLocation?.city||'-'} | 🕐 ${o.tStr||'-'}\n\n`;
    });
    await sock.sendMessage(from,{text:msg}); return;
  }
  if (cmd.startsWith('!done ') || cmd.startsWith('!selesai ')) {
    const id = text.split(' ')[1]?.toUpperCase();
    if (!id) { await sock.sendMessage(from,{text:'⚠️ Format: !done [ID]'}); return; }
    const snap = await db.collection('orders').where('orderId','==',id).limit(1).get();
    if (snap.empty) { await sock.sendMessage(from,{text:'❌ Order #'+id+' tidak ditemukan!'}); return; }
    const doc = snap.docs[0]; const o = doc.data();
    await doc.ref.update({status:'done'});
    await sock.sendMessage(from,{text:'✅ Order #'+id+' SELESAI!'});
    if (o.buyerWa) {
      await sock.sendMessage(fmtJid(o.buyerWa),{text:
        '✅ *ORDER SELESAI!*\n\nHalo *'+o.usn+'*!\n\n*Order ID:* #'+id+'\n*Total:* Rp '+(o.totalRb||0).toLocaleString('id-ID')+'.000\n\nTerima kasih belanja di *KPC Store* 🏍️\nJangan lupa kasih testimoni! 🌟'
      }).catch(()=>{});
    }
    return;
  }
  if (cmd.startsWith('!cancel ') || cmd.startsWith('!batal ')) {
    const id = text.split(' ')[1]?.toUpperCase();
    if (!id) { await sock.sendMessage(from,{text:'⚠️ Format: !cancel [ID]'}); return; }
    const snap = await db.collection('orders').where('orderId','==',id).limit(1).get();
    if (snap.empty) { await sock.sendMessage(from,{text:'❌ Order #'+id+' tidak ditemukan!'}); return; }
    const doc = snap.docs[0]; const o = doc.data();
    await doc.ref.update({status:'cancel'});
    await sock.sendMessage(from,{text:'❌ Order #'+id+' DIBATALKAN!'});
    if (o.buyerWa) {
      await sock.sendMessage(fmtJid(o.buyerWa),{text:
        '❌ *ORDER DIBATALKAN*\n\nHalo *'+o.usn+'*, maaf order dibatalkan.\n\n*Order ID:* #'+id+'\n\nHubungi admin untuk info lebih lanjut 🙏'
      }).catch(()=>{});
    }
    return;
  }
  if (cmd === '!online') {
    await db.collection('config').doc('adminOnline').set({[num]:true},{merge:true});
    await sock.sendMessage(from,{text:'✅ Kamu ONLINE di toko!'}); return;
  }
  if (cmd === '!offline') {
    await db.collection('config').doc('adminOnline').set({[num]:false},{merge:true});
    await sock.sendMessage(from,{text:'😴 Kamu OFFLINE di toko!'}); return;
  }
  if (cmd === '!status') {
    const [p,d] = await Promise.all([
      db.collection('orders').where('status','==','pending').get(),
      db.collection('orders').where('status','==','done').get()
    ]);
    await sock.sendMessage(from,{text:'📊 *KPC STORE STATUS*\n\n⏳ Pending: '+p.size+'\n✅ Selesai: '+d.size+'\n🤖 Bot: Online ✅'}); return;
  }
  if (cmd === '!chat') {
    const snap = await db.collection('livechat').where('type','==','user').orderBy('ts','desc').limit(10).get();
    if (snap.empty) { await sock.sendMessage(from,{text:'💬 Belum ada chat!'}); return; }
    const seen = new Set(); let msg = '💬 *CHAT MASUK:*\n\n';
    snap.forEach(d => {
      const o = d.data();
      if (!seen.has(o.sessionId)) { seen.add(o.sessionId); msg += `👤 *${o.name}*: ${(o.text||'').slice(0,60)}\n`; }
    });
    msg += '\n_!balas Nama pesan_';
    await sock.sendMessage(from,{text:msg}); return;
  }
  if (cmd.startsWith('!balas ')) {
    const parts = text.split(' '); const target = parts[1]; const reply = parts.slice(2).join(' ');
    if (!target||!reply) { await sock.sendMessage(from,{text:'⚠️ Format: !balas [Nama] [pesan]'}); return; }
    const snap = await db.collection('livechat').where('name','==',target).limit(1).get();
    if (snap.empty) { await sock.sendMessage(from,{text:'❌ '+target+' tidak ditemukan!'}); return; }
    const sid = snap.docs[0].data().sessionId;
    await db.collection('livechat').add({sessionId:sid,name:'Admin KPC',text:reply,type:'admin',ts:FieldValue.serverTimestamp()});
    await sock.sendMessage(from,{text:'✅ Terkirim ke '+target+'!'}); return;
  }
}

// ══ BUYER AUTO REPLY ══
async function handleBuyer(from, text, num) {
  const t = text.toLowerCase();
  let reply = '';
  if (t.includes('harga')||t.includes('price')||t.includes('berapa')||t.includes('list')) {
    reply = '📋 *HARGA KPC STORE*\n\n*🎮 GAMEPASS:*\n📻 Radio: 4rb | 🔧 Suspensi: 4rb\n🎨 Cat: 7rb | ⚙️ Aksesoris: 7rb\n🛞 Velg: 8rb | 🪪 Plat: 8rb\n➕ Slot: 9rb | 🏁 Drag: 12rb\n💎 Mewah: 13rb | 🚔 Polisi: 16rb\n💵 2x Gaji: 45rb\n\n*💰 CASH:*\n1jt=2rb | 5jt=3rb | 10jt=5rb\n50jt=7rb | 100jt=10rb\n500jt=37rb | 1M=70rb\n\n🛒 *Order di:*\nhttps://kpc-store-dds.vercel.app';
  } else if (t.includes('cara')||t.includes('order')||t.includes('beli')) {
    reply = '🛒 *CARA ORDER:*\n\n1️⃣ Buka: https://kpc-store-dds.vercel.app\n2️⃣ Isi username Roblox + nomor WA\n3️⃣ Pilih item\n4️⃣ Klik Chat Admin\n5️⃣ Bayar QRIS\n6️⃣ Tunggu 1-5 menit ✅';
  } else if (t.includes('bayar')||t.includes('qris')||t.includes('transfer')) {
    reply = '💳 *PEMBAYARAN:*\n✅ QRIS (scan di toko)\n✅ Transfer Bank\n\nBukti kirim ke admin setelah bayar!';
  } else if (t.includes('lama')||t.includes('proses')||t.includes('cepat')) {
    reply = '⚡ Proses *1-5 menit* setelah konfirmasi bayar!\nAdmin langsung gerak! 🚀';
  } else if (t.includes('aman')||t.includes('tipu')||t.includes('scam')||t.includes('terpercaya')) {
    reply = '🛡️ *100% AMAN & TERPERCAYA!*\nSudah ribuan order berhasil!\nAda Order ID sebagai bukti tiap transaksi ✅';
  } else if (t.includes('status')||t.includes('cek order')||t.includes('sudah')) {
    reply = '🔍 Untuk cek status order, hubungi admin dengan Order ID kamu!\n\nAtau lihat histori di toko:\nhttps://kpc-store-dds.vercel.app';
  } else {
    reply = '👋 Halo! Selamat datang di *KPC Store* 🏍️\n\nKetik:\n📋 *harga* → daftar harga\n🛒 *cara order* → cara beli\n💳 *bayar* → info pembayaran\n⚡ *proses* → estimasi waktu\n\nAtau langsung order:\n🛒 https://kpc-store-dds.vercel.app\n\nAdmin akan segera membalas! 💬';
  }

  await sock.sendMessage(from, { text: reply });

  // Notif ke admin
  for (const adminNum of ADMIN_NUMBERS) {
    sock.sendMessage(fmtJid(adminNum), { text:
      '🔔 *PESAN WA MASUK*\n👤 +'+num+'\n💬 '+text.slice(0,100)+'\n\n_Balas langsung ke nomor tersebut_'
    }).catch(()=>{});
  }
}

// ══ FIREBASE LISTENERS ══
let orderListened = false;
let chatListened = false;

function listenOrders() {
  if (orderListened) return;
  orderListened = true;
  db.collection('orders').where('status','==','pending').onSnapshot(snap => {
    snap.docChanges().forEach(async change => {
      if (change.type !== 'added') return;
      const o = change.doc.data();
      const id = o.orderId || change.doc.id.slice(-6).toUpperCase();
      const msg =
        '🔔 *ORDER BARU!*\n\n' +
        '🧾 ID: #'+id+'\n' +
        '🎮 Username: '+(o.usn||'-')+'\n' +
        '📱 WA: '+(o.buyerWa||'-')+'\n' +
        '📍 Lokasi: '+(o.buyerLocation?.city||'-')+', '+(o.buyerLocation?.country||'-')+'\n' +
        '💰 Total: Rp '+(o.totalRb||0).toLocaleString('id-ID')+'.000\n' +
        '🕐 Waktu: '+(o.tStr||'-')+'\n\n' +
        '✅ !done '+id+'\n❌ !cancel '+id;
      for (const n of ADMIN_NUMBERS) {
        sock.sendMessage(fmtJid(n), { text: msg }).catch(()=>{});
      }
    });
  });
}

function listenChat() {
  if (chatListened) return;
  chatListened = true;
  db.collection('livechat').where('type','==','user').onSnapshot(snap => {
    snap.docChanges().forEach(async change => {
      if (change.type !== 'added') return;
      const o = change.doc.data();
      for (const n of ADMIN_NUMBERS) {
        sock.sendMessage(fmtJid(n), { text:
          '💬 *CHAT BARU DI TOKO!*\n👤 '+(o.name||'-')+'\n💬 '+(o.text||'')+'\n\n_!balas '+(o.name||'pembeli')+' [pesan]_'
        }).catch(()=>{});
      }
    });
  });
}

startBot().catch(console.error);
