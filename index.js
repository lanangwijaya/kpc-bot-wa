const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys')

const { initializeApp, cert } = require('firebase-admin/app')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

const express = require('express')
const pino = require('pino')
const fs = require('fs')

const { webcrypto } = require('crypto')

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto
}

// ================= EXPRESS =================

const app = express()

app.use(express.json())

app.get('/', (_, res) => {
  res.send('KPC BOT ONLINE âœ…')
})

app.listen(process.env.PORT || 3000, () => {
  console.log('âœ… SERVER ONLINE')
})

// ================= FIREBASE =================

let db;
try {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_CREDENTIAL || '{}'
  )

  if (serviceAccount.project_id) {
    initializeApp({
      credential: cert(serviceAccount)
    })
    db = getFirestore()
    console.log('ðŸ”¥ FIREBASE BERHASIL DIKONEKSIKAN')
  } else {
    console.log('âš ï¸ WARNING: FIREBASE_CREDENTIAL kosong atau tidak valid. Fitur database dinonaktifkan.')
  }
} catch (error) {
  console.error('âŒ ERROR FIREBASE INITIALIZATION:', error.message)
}

// ================= CONFIG =================

const ADMIN_NUMBERS = [
  '628983923559',
  '6281252425581',
  '6288989378157',
  '628211549460'
]

function formatNumber(num) {
  let n = num.replace(/\D/g, '')

  if (n.startsWith('0')) {
    n = '62' + n.slice(1)
  }

  if (!n.includes('@s.whatsapp.net')) {
    n += '@s.whatsapp.net'
  }

  return n
}

function cleanNumber(jid = '') {
  return jid
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
}

// ================= START BOT =================

async function startBot() {

  const { state, saveCreds } =
    await useMultiFileAuthState('./auth_info')

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: 'silent' })
      )
    },

    logger: pino({
      level: 'silent'
    }),

    browser: ['KPC STORE', 'Chrome', '1.0.0'],

    printQRInTerminal: false,
    mobile: false,

    markOnlineOnConnect: true,
    syncFullHistory: false,

    generateHighQualityLinkPreview: true,

    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    retryRequestDelayMs: 250
  })

  // ================= PAIRING CODE =================

  if (!state.creds.registered) {

    const phoneNumber = process.env.BOT_NUMBER

    if (!phoneNumber) {
      console.log('âŒ BOT_NUMBER BELUM DIISI DI ENVIRONMENT VARIABLES')
      process.exit(1)
    }

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(
          phoneNumber.replace(/\D/g, '')
        )

        console.log(`
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘    KODE PAIRING WA     â•‘
â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£
â•‘       ${code}       
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
`)

        if (db) {
          await db
            .collection('config')
            .doc('pairingCode')
            .set({
              code,
              ts: FieldValue.serverTimestamp()
            })
        }
      } catch (err) {
        console.log('âŒ GAGAL AMBIL PAIRING CODE')
        console.log(err)
      }
    }, 5000)
  }

  // ================= SAVE SESSION =================

  sock.ev.on('creds.update', saveCreds)

  // ================= CONNECTION =================

  sock.ev.on(
    'connection.update',
    async (update) => {
      const {
        connection,
        lastDisconnect
      } = update

      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode
        console.log('âŒ CONNECTION CLOSED, REASON CODE:', reason)

        if (reason !== DisconnectReason.loggedOut) {
          console.log('ðŸ”„ RECONNECT DALAM 5 DETIK...')
          setTimeout(() => {
            startBot()
          }, 5000)
        } else {
          console.log('âŒ SESSION LOGOUT. Silakan hapus folder "auth_info" dan scan ulang!')
        }
      }

      if (connection === 'open') {
        console.log('âœ… BOT CONNECTED & JALAN')

        if (db) {
          try {
            await db
              .collection('config')
              .doc('botStatus')
              .set({
                online: true,
                ts: FieldValue.serverTimestamp()
              })
          } catch (e) {
            console.log('âŒ GAGAL UPDATE STATUS KE FIREBASE:', e.message)
          }
        }
      }
    }
  )

  // ================= MESSAGE HANDLER =================

  sock.ev.on(
    'messages.upsert',
    async ({ messages, type }) => {
      try {
        if (type !== 'notify') return

        const msg = messages[0]
        if (!msg.message) return
        if (msg.key.fromMe) return

        const from = msg.key.remoteJid
        const isGroup = from.endsWith('@g.us')

        // Mendapatkan nomor pengirim asli
        const sender = cleanNumber(msg.key.participant || from)

        // Mengambil teks pesan dari berbagai tipe pesan WhatsApp
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          ''

        if (!text) return

        console.log(`
==========================
ðŸ“¨ PESAN MASUK ${isGroup ? '[GRUP]' : '[PC]'}
ðŸ‘¤ Nomor: ${sender}
ðŸ’¬ Pesan: ${text}
==========================
`)

        const isAdmin = ADMIN_NUMBERS.includes(sender)

        // ================= ADMIN COMMAND =================
        if (isAdmin) {
          const cmd = text.toLowerCase().trim()

          if (cmd === '!ping') {
            return await sock.sendMessage(from, {
              text: 'ðŸ“ PONG! BOT ONLINE DAN MERESPON.'
            })
          }

          if (cmd === '!menu') {
            return await sock.sendMessage(from, {
              text:
`â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘   KPC MENU   â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

â€¢ !ping    - Cek status bot
â€¢ !menu    - Menampilkan menu ini
â€¢ !runtime - Melihat durasi aktif bot
â€¢ !owner   - Informasi owner KPC
â€¢ !status  - Cek detail server & Firebase`
            })
          }

          if (cmd === '!status') {
            return await sock.sendMessage(from, {
              text:
`âœ… STATUS BOT KPC

â€¢ Bot: Aktif
â€¢ Server: Online
â€¢ Firebase: ${db ? 'Terkoneksi ðŸ”¥' : 'Tidak Terkoneksi âš ï¸'}
â€¢ Pairing: Berhasil`
            })
          }

          if (cmd === '!owner') {
            return await sock.sendMessage(from, {
              text:
`ðŸ‘‘ OWNER KPC STORE

â€¢ No. HP: 6281252425581`
            })
          }

          if (cmd === '!runtime') {
            const runtime = process.uptime()
            const jam = Math.floor(runtime / 3600)
            const menit = Math.floor((runtime % 3600) / 60)
            const detik = Math.floor(runtime % 60)

            return await sock.sendMessage(from, {
              text:
`â±ï¸ RUNTIME BOT KPC

ðŸ‘‰ ${jam} Jam ${menit} Menit ${detik} Detik`
            })
          }
        }

        // ================= AUTO RESPON (KHUSUS CHAT PRIBADI / PC) =================
        // Mencegah bot membalas otomatis di dalam grup yang bisa mengganggu member lain
        if (isGroup) return;

        let reply = ''
        const lower = text.toLowerCase()

        if (
          lower.includes('harga') ||
          lower.includes('price')
        ) {
          reply =
`ðŸ“‹ LIST HARGA KPC STORE

ðŸ’¸ CASH DDS
1JT = 2RB
5JT = 3RB
10JT = 5RB
50JT = 7RB
100JT = 10RB
500JT = 37RB
1M = 70RB

ðŸŽ® GAMEPASS
RADIO = 4RB
SUSPENSI = 4RB
CAT = 7RB
AKSESORIS = 7RB
VELG = 8RB
PLAT = 8RB
SLOT = 9RB
DRAG = 12RB
MEWAH = 13RB
POLISI = 16RB
2X GAJI = 45RB`

        } else if (
          lower.includes('order') ||
          lower.includes('beli')
        ) {
          reply =
`ðŸ›’ CARA ORDER

1. Kirim username Roblox
2. Pilih item yang ingin dibeli
3. Lakukan pembayaran via QRIS/Transfer
4. Tunggu proses dari Admin
5. Done âœ…`

        } else if (
          lower.includes('qris') ||
          lower.includes('bayar')
        ) {
          reply =
`ðŸ’³ PEMBAYARAN KPC STORE

âœ… QRIS (Tanyakan ke admin jika belum dikirim)
âœ… TRANSFER BANK

Harap kirimkan bukti transfer yang valid setelah melakukan pembayaran.`

        } else {
          reply =
`ðŸ‘‹ HALO! SELAMAT DATANG DI KPC STORE

Ada yang bisa kami bantu? Silakan ketik kata kunci di bawah ini:
â€¢ *harga* (Untuk melihat list harga terbaru)
â€¢ *order* (Untuk mengetahui cara pemesanan)
â€¢ *bayar* (Untuk opsi pembayaran)

Admin kami akan segera membalas chat kamu secara manual secepatnya! âœ…`
        }

        // Kirim balasan otomatis ke user
        await sock.sendMessage(from, {
          text: reply
        })

        // ================= NOTIFIKASI KE ADMIN =================
        // Mengirimkan notifikasi ke semua admin terdaftar jika ada user baru yang chat
        for (const admin of ADMIN_NUMBERS) {
          try {
            // Hindari mengirimkan notifikasi chat masuk ke admin yang mengirim pesan itu sendiri
            if (sender === admin) continue;

            await sock.sendMessage(
              formatNumber(admin),
              {
                text: `ðŸ”” CHAT MASUK PC\n\nðŸ‘¤ Pengirim: @${sender}\nðŸ’¬ Pesan: "${text}"`,
                mentions: [formatNumber(sender)]
              }
            )
          } catch (e) {
            console.log('âŒ GAGAL MENGIRIM NOTIFIKASI KE ADMIN:', e.message)
          }
        }

      } catch (err) {
        console.log('âŒ ERROR MESSAGE HANDLER')
        console.log(err)
      }
    }
  )
}

// ================= ANTI CRASH SYSTEM =================

process.on('uncaughtException', (err) => {
  console.error('âŒ CRASH DETECTED (uncaughtException):', err)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('âŒ CRASH DETECTED (unhandledRejection) at:', promise, 'reason:', reason)
})

// ================= RUN BOT =================

startBot()