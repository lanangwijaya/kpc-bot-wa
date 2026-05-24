const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const express = require('express');
const pino = require('pino');
const fs = require('fs');

// Fix crypto untuk Node.js 18
const { webcrypto } = require('crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;

// ══ EXPRESS SERVER (biar Railway tidak mati) ══
const app = express();
app.use(express.json());
app.get('/', (req, res) => res.send('KPC Bot WA - Online ✅'));
app.listen(process.env.PORT || 3000, () => console.log('Server running'));

// ══ FIREBASE INIT ══
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIAL || '{}');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ══ CONFIG ══
const ADMIN_NUMBERS = [
  '628983923559',
  '6281252425581', 
  '6288989378157',
  '628211549460'
];
const ADMIN_NAMES = ['Alfian', 'Nanang', 'Bos Tuyul', 'Vinzzz'];

// Format nomor WA
function fmtNum(num) {
  let n = num.replace(/[^0-9]/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (!n.endsWith('@s.whatsapp.net')) n += '@s.whatsapp.net';
  return n;
}

function cleanNum(jid) {
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

// ══ BOT UTAMA ══
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    // Pakai pairing code, bukan QR
    mobile: false,
  });

  // ══ PAIRING CODE ══
  if (!sock.authState.creds.registered) {
    const phoneNumber = process.env.BOT_NUMBER || '';
    if (!phoneNumber) {
      console.log('❌ Set BOT_NUMBER di environment variable Railway!');
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 2000));
    const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
    console.log('\n╔════════════════════════╗');
    console.log('║  KODE PAIRING WA BOT   ║');
    console.log('╠════════════════════════╣');
    console.log('║  KODE: ' + code + '         ║');
    console.log('╚════════════════════════╝');
    console.log('\nBuka WA → Perangkat Tertaut → Tautkan Perangkat → Masukkan Kode\n');
    
    // Simpan kode ke Firebase biar bisa dilihat dari web
    await db.collection('config').doc('pairingCode').set({ code, ts: FieldValue.serverTimestamp() });
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('Reconnecting...');
        setTimeout(startBot, 3000);
      } else {
        console.log('Logged out. Hapus folder auth_info dan restart.');
      }
    } else if (connection === 'open') {
      console.log('✅ Bot WA KPC Store ONLINE!');
      db.collection('config').doc('botStatus').set({ online: true, ts: FieldValue.serverTimestamp() });
    }
  });

  // ══ TERIMA PESAN ══
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const from = msg.key.remoteJid;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const senderNum = cleanNum(from);

      // Cek apakah dari admin
      const adminIdx = ADMIN_NUMBERS.indexOf(senderNum);
      const isAdmin = adminIdx >= 0;

      if (!text) continue;

      console.log(`📨 [${isAdmin ? 'ADMIN:'+ADMIN_NAMES[adminIdx] : senderNum}]: ${text}`);

      // ══ COMMAND ADMIN ══
      if (isAdmin) {
        await handleAdminCommand(sock, from, text, senderNum, ADMIN_NAMES[adminIdx]);
        continue;
      }

      // ══ PESAN DARI PEMBELI ══
      await handleBuyerMessage(sock, from, text, senderNum);
    }
  });

  // ══ LISTENER FIREBASE → NOTIF KE ADMIN ══
  listenFirebaseOrders(sock);
  listenFirebaseChat(sock);
}

// ══ HANDLE PESAN ADMIN ══
async function handleAdminCommand(sock, from, text, num, name) {
  const cmd = text.trim().toLowerCase();

  if (cmd === '!help' || cmd === '!bantuan') {
    await sock.sendMessage(from, { text: 
      '╔══════════════════╗\n' +
      '║  KPC BOT COMMAND  ║\n' +
      '╚══════════════════╝\n\n' +
      '📋 *ORDER:*\n' +
      '!pending → lihat order pending\n' +
      '!done [ID] → tandai order selesai\n' +
      '!cancel [ID] → batalkan order\n\n' +
      '💬 *CHAT:*\n' +
      '!chat → lihat chat masuk\n' +
      '!balas [nomor] [pesan] → balas chat pembeli\n\n' +
      '📊 *INFO:*\n' +
      '!status → status toko\n' +
      '!online → set admin online\n' +
      '!offline → set admin offline'
    });
    return;
  }

  if (cmd === '!pending') {
    const snap = await db.collection('orders').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(10).get();
    if (snap.empty) { await sock.sendMessage(from, { text: '✅ Tidak ada order pending!' }); return; }
    let msg = '📋 *ORDER PENDING:*\n\n';
    snap.forEach(d => {
      const o = d.data();
      msg += `🧾 #${o.orderId||d.id.slice(-6).toUpperCase()}\n`;
      msg += `🎮 ${o.usn||'-'}\n`;
      msg += `💰 Rp ${(o.totalRb||0).toLocaleString('id-ID')}.000\n`;
      msg += `🕐 ${o.tStr||'-'}\n\n`;
    });
    await sock.sendMessage(from, { text: msg });
    return;
  }

  if (cmd.startsWith('!done ') || cmd.startsWith('!selesai ')) {
    const orderId = text.split(' ')[1]?.toUpperCase();
    if (!orderId) { await sock.sendMessage(from, { text: '⚠️ Format: !done [ORDER_ID]' }); return; }
    const snap = await db.collection('orders').where('orderId', '==', orderId).limit(1).get();
    if (snap.empty) { await sock.sendMessage(from, { text: '❌ Order #'+orderId+' tidak ditemukan!' }); return; }
    const docRef = snap.docs[0];
    const order = docRef.data();
    await docRef.ref.update({ status: 'done' });
    await sock.sendMessage(from, { text: '✅ Order #'+orderId+' ditandai SELESAI!' });
    // Kirim notif ke pembeli
    if (order.buyerWa) {
      const buyerJid = fmtNum(order.buyerWa);
      await sock.sendMessage(buyerJid, { text:
        '✅ *ORDER SELESAI!*\n\n' +
        'Halo *'+order.usn+'*! Order kamu sudah diproses!\n\n' +
        '*Order ID:* #'+orderId+'\n' +
        '*Total:* Rp '+(order.totalRb||0).toLocaleString('id-ID')+'.000\n\n' +
        'Terima kasih belanja di *KPC Store* 🏍️\nJangan lupa kasih testimoni ya! 🌟'
      });
    }
    return;
  }

  if (cmd.startsWith('!cancel ') || cmd.startsWith('!batal ')) {
    const orderId = text.split(' ')[1]?.toUpperCase();
    if (!orderId) { await sock.sendMessage(from, { text: '⚠️ Format: !cancel [ORDER_ID]' }); return; }
    const snap = await db.collection('orders').where('orderId', '==', orderId).limit(1).get();
    if (snap.empty) { await sock.sendMessage(from, { text: '❌ Order #'+orderId+' tidak ditemukan!' }); return; }
    const docRef = snap.docs[0];
    const order = docRef.data();
    await docRef.ref.update({ status: 'cancel' });
    await sock.sendMessage(from, { text: '❌ Order #'+orderId+' DIBATALKAN!' });
    if (order.buyerWa) {
      const buyerJid = fmtNum(order.buyerWa);
      await sock.sendMessage(buyerJid, { text:
        '❌ *ORDER DIBATALKAN*\n\nHalo *'+order.usn+'*, maaf order kamu dibatalkan.\n\n' +
        '*Order ID:* #'+orderId+'\n\nHubungi admin untuk info lebih lanjut 🙏'
      });
    }
    return;
  }

  if (cmd === '!online') {
    await db.collection('config').doc('adminStatus').set({ [num]: true }, { merge: true });
    await sock.sendMessage(from, { text: '✅ Kamu sekarang ONLINE di toko!' });
    return;
  }

  if (cmd === '!offline') {
    await db.collection('config').doc('adminStatus').set({ [num]: false }, { merge: true });
    await sock.sendMessage(from, { text: '😴 Kamu sekarang OFFLINE di toko!' });
    return;
  }

  if (cmd === '!chat') {
    const snap = await db.collection('livechat').orderBy('ts', 'desc').limit(20).get();
    if (snap.empty) { await sock.sendMessage(from, { text: '💬 Belum ada chat masuk!' }); return; }
    const sessions = {};
    snap.forEach(d => {
      const o = d.data();
      if (!sessions[o.sessionId]) sessions[o.sessionId] = { name: o.name, msgs: [] };
      sessions[o.sessionId].msgs.unshift(o);
    });
    let msg = '💬 *CHAT MASUK:*\n\n';
    Object.values(sessions).slice(0, 5).forEach(s => {
      const last = s.msgs[s.msgs.length - 1];
      msg += `👤 *${s.name}*: ${last?.text?.slice(0, 50)||''}\n`;
    });
    msg += '\n_!balas [nama] [pesan] untuk membalas_';
    await sock.sendMessage(from, { text: msg });
    return;
  }

  if (cmd.startsWith('!balas ')) {
    const parts = text.split(' ');
    const targetName = parts[1];
    const replyText = parts.slice(2).join(' ');
    if (!targetName || !replyText) { await sock.sendMessage(from, { text: '⚠️ Format: !balas [nama] [pesan]' }); return; }
    // Cari session berdasarkan nama
    const snap = await db.collection('livechat').where('name', '==', targetName).limit(1).get();
    if (snap.empty) { await sock.sendMessage(from, { text: '❌ Pembeli '+targetName+' tidak ditemukan!' }); return; }
    const sessionId = snap.docs[0].data().sessionId;
    await db.collection('livechat').add({ sessionId, name: 'Admin KPC', text: replyText, type: 'admin', ts: FieldValue.serverTimestamp() });
    await sock.sendMessage(from, { text: '✅ Pesan terkirim ke '+targetName+'!' });
    return;
  }

  if (cmd === '!status') {
    const pending = await db.collection('orders').where('status', '==', 'pending').get();
    const done = await db.collection('orders').where('status', '==', 'done').get();
    await sock.sendMessage(from, { text:
      '📊 *STATUS KPC STORE*\n\n' +
      '⏳ Pending: '+pending.size+' order\n' +
      '✅ Selesai: '+done.size+' order\n\n' +
      '_Bot WA KPC Store Online_ ✅'
    });
    return;
  }
}

// ══ HANDLE PESAN PEMBELI ══
async function handleBuyerMessage(sock, from, text, num) {
  const cmd = text.trim().toLowerCase();
  
  let reply = '';
  if (cmd.includes('harga') || cmd.includes('price') || cmd.includes('berapa')) {
    reply = '📋 *HARGA KPC STORE*\n\n*GAMEPASS:*\n📻 Radio: 4rb\n🔧 Suspensi: 4rb\n🎨 Cat: 7rb\n⚙️ Aksesoris: 7rb\n🛞 Velg: 8rb\n🪪 Plat: 8rb\n➕ Slot: 9rb\n🏁 Drag: 12rb\n💎 Mewah: 13rb\n🚔 Polisi: 16rb\n💵 2x Gaji: 45rb\n\n*CASH:*\n💸 1jt=2rb | 5jt=3rb\n💰 10jt=5rb | 50jt=7rb\n🤑 100jt=10rb | 500jt=37rb\n👑 1M=70rb\n\n🛒 Order di: https://kpc-store-dds.vercel.app';
  } else if (cmd.includes('cara') || cmd.includes('order') || cmd.includes('beli')) {
    reply = '🛒 *CARA ORDER KPC STORE:*\n\n1️⃣ Buka toko: https://kpc-store-dds.vercel.app\n2️⃣ Isi username Roblox + nomor WA\n3️⃣ Pilih item yang mau dibeli\n4️⃣ Klik Chat Admin\n5️⃣ Bayar via QRIS\n6️⃣ Tunggu proses 1-5 menit ✅';
  } else if (cmd.includes('bayar') || cmd.includes('transfer') || cmd.includes('qris')) {
    reply = '💳 *PEMBAYARAN:*\n\nKami menerima:\n✅ QRIS (scan QR di toko)\n✅ Transfer Bank\n\nSetelah bayar, kirim bukti ke admin ya!';
  } else if (cmd.includes('lama') || cmd.includes('proses')) {
    reply = '⚡ Proses *1-5 menit* setelah konfirmasi pembayaran!\nAdmin langsung gerak! 🚀';
  } else if (cmd.includes('aman') || cmd.includes('tipu') || cmd.includes('scam')) {
    reply = '🛡️ *100% AMAN!*\n\nSudah ribuan order berhasil!\nSetiap transaksi ada Order ID sebagai bukti.\nNo tipu-tipu! ✅';
  } else {
    reply = '👋 Halo! Saya bot KPC Store.\n\nKetik:\n• *harga* → lihat daftar harga\n• *cara order* → cara beli\n• *bayar* → info pembayaran\n\nAtau langsung order di:\n🛒 https://kpc-store-dds.vercel.app\n\nAdmin akan segera membalas! 💬';
  }

  await sock.sendMessage(from, { text: reply });

  // Notif ke semua admin
  for (const adminNum of ADMIN_NUMBERS) {
    try {
      await sock.sendMessage(fmtNum(adminNum), { text:
        '🔔 *PESAN MASUK*\n\n' +
        '👤 Dari: +' + num + '\n' +
        '💬 Pesan: ' + text.slice(0, 100) + '\n\n' +
        '_Balas dengan !balas atau langsung WA pembeli_'
      });
    } catch(e) {}
  }
}

// ══ LISTENER ORDER FIREBASE → NOTIF WA ADMIN ══
function listenFirebaseOrders(sock) {
  db.collection('orders').where('status', '==', 'pending')
    .onSnapshot(snap => {
      snap.docChanges().forEach(async change => {
        if (change.type !== 'added') return;
        const o = change.doc.data();
        const msg = 
          '🔔 *ORDER BARU MASUK!*\n\n' +
          '🧾 ID: #'+(o.orderId||change.doc.id.slice(-6).toUpperCase())+'\n' +
          '🎮 Username: '+o.usn+'\n' +
          '📱 WA: '+(o.buyerWa||'-')+'\n' +
          '📍 Lokasi: '+(o.buyerLocation?.city||'-')+', '+(o.buyerLocation?.country||'-')+'\n' +
          '💰 Total: Rp '+(o.totalRb||0).toLocaleString('id-ID')+'.000\n' +
          '🕐 Waktu: '+(o.tStr||'-')+'\n\n' +
          '✅ !done '+(o.orderId||change.doc.id.slice(-6).toUpperCase())+' → tandai selesai\n' +
          '❌ !cancel '+(o.orderId||change.doc.id.slice(-6).toUpperCase())+' → batalkan';

        for (const adminNum of ADMIN_NUMBERS) {
          try {
            await sock.sendMessage(fmtNum(adminNum), { text: msg });
          } catch(e) {}
        }
      });
    });
}

// ══ LISTENER CHAT FIREBASE → NOTIF WA ADMIN ══
function listenFirebaseChat(sock) {
  db.collection('livechat').where('type', '==', 'user')
    .onSnapshot(snap => {
      snap.docChanges().forEach(async change => {
        if (change.type !== 'added') return;
        const o = change.doc.data();
        const msg = 
          '💬 *CHAT BARU DI TOKO!*\n\n' +
          '👤 Nama: '+(o.name||'-')+'\n' +
          '💬 Pesan: '+o.text+'\n\n' +
          '_Balas: !balas '+(o.name||'pembeli')+' [pesan]_\n' +
          '_Atau buka dashboard: https://kpc-store-dds.vercel.app/admin-dashboard.html_';

        for (const adminNum of ADMIN_NUMBERS) {
          try {
            await sock.sendMessage(fmtNum(adminNum), { text: msg });
          } catch(e) {}
        }
      });
    });
}

// START
startBot().catch(console.error);
