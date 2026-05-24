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
  res.send('KPC BOT ONLINE ✅')
})

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ SERVER ONLINE')
})

// ================= FIREBASE =================

const serviceAccount = JSON.parse(
  process.env.FIREBASE_CREDENTIAL || '{}'
)

initializeApp({
  credential: cert(serviceAccount)
})

const db = getFirestore()

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
      console.log('❌ BOT_NUMBER BELUM DIISI')
      process.exit(1)
    }

    setTimeout(async () => {

      try {

        const code =
          await sock.requestPairingCode(
            phoneNumber.replace(/\D/g, '')
          )

        console.log(`
╔════════════════════════╗
║    KODE PAIRING WA     ║
╠════════════════════════╣
║       ${code}       
╚════════════════════════╝
`)

        await db
          .collection('config')
          .doc('pairingCode')
          .set({
            code,
            ts: FieldValue.serverTimestamp()
          })

      } catch (err) {

        console.log('❌ GAGAL AMBIL PAIRING')
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

        const reason =
          lastDisconnect?.error?.output?.statusCode

        console.log('❌ CONNECTION CLOSED:', reason)

        if (
          reason !== DisconnectReason.loggedOut
        ) {

          console.log('🔄 RECONNECT 5 DETIK')

          setTimeout(() => {
            startBot()
          }, 5000)

        } else {

          console.log(
            '❌ SESSION LOGOUT HAPUS auth_info'
          )

        }
      }

      if (connection === 'open') {

        console.log('✅ BOT CONNECTED')

        try {

          await db
            .collection('config')
            .doc('botStatus')
            .set({
              online: true,
              ts: FieldValue.serverTimestamp()
            })

        } catch (e) {
          console.log(e)
        }
      }
    }
  )

  // ================= MESSAGE =================

  sock.ev.on(
    'messages.upsert',
    async ({ messages, type }) => {

      try {

        if (type !== 'notify') return

        const msg = messages[0]

        if (!msg.message) return
        if (msg.key.fromMe) return

        const from = msg.key.remoteJid

        const sender =
          cleanNumber(msg.key.participant || from)

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          ''

        if (!text) return

        console.log(`
==========================
📨 PESAN MASUK
👤 ${sender}
💬 ${text}
==========================
`)

        const isAdmin =
          ADMIN_NUMBERS.includes(sender)

        // ================= ADMIN COMMAND =================

        if (isAdmin) {

          const cmd = text.toLowerCase()

          if (cmd === '!ping') {

            return await sock.sendMessage(from, {
              text: '🏓 PONG BOT ONLINE'
            })

          }

          if (cmd === '!menu') {

            return await sock.sendMessage(from, {
              text:
`╔══════════════╗
║   KPC MENU   ║
╚══════════════╝

!ping
!menu
!runtime
!owner
!status`
            })

          }

          if (cmd === '!status') {

            return await sock.sendMessage(from, {
              text:
`✅ STATUS BOT

• Bot aktif
• Server online
• Firebase connected
• Pairing aman`
            })

          }

          if (cmd === '!owner') {

            return await sock.sendMessage(from, {
              text:
`👑 OWNER KPC STORE

• 6281252425581`
            })

          }

          if (cmd === '!runtime') {

            const runtime =
              process.uptime()

            const jam =
              Math.floor(runtime / 3600)

            const menit =
              Math.floor(runtime % 3600 / 60)

            const detik =
              Math.floor(runtime % 60)

            return await sock.sendMessage(from, {
              text:
`⏱️ RUNTIME BOT

${jam} Jam
${menit} Menit
${detik} Detik`
            })

          }
        }

        // ================= AUTO RESPON =================

        let reply = ''

        const lower = text.toLowerCase()

        if (
          lower.includes('harga') ||
          lower.includes('price')
        ) {

          reply =
`📋 LIST HARGA KPC STORE

💸 CASH DDS
1JT = 2RB
5JT = 3RB
10JT = 5RB
50JT = 7RB
100JT = 10RB
500JT = 37RB
1M = 70RB

🎮 GAMEPASS
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
`🛒 CARA ORDER

1. Kirim username Roblox
2. Pilih item
3. Bayar QRIS
4. Tunggu proses
5. Done ✅`

        } else if (
          lower.includes('qris') ||
          lower.includes('bayar')
        ) {

          reply =
`💳 PEMBAYARAN

✅ QRIS
✅ TRANSFER

Kirim bukti transfer setelah bayar.`

        } else {

          reply =
`👋 HALO DARI KPC STORE

Ketik:
• harga
• order
• bayar

Admin akan membalas secepatnya ✅`
        }

        // ================= SEND REPLY =================

        await sock.sendMessage(from, {
          text: reply
        })

        // ================= NOTIF ADMIN =================

        for (const admin of ADMIN_NUMBERS) {

          try {

            await sock.sendMessage(
              formatNumber(admin),
              {
                text:
`🔔 CHAT MASUK

👤 ${sender}

💬 ${text}`
              }
            )

          } catch (e) {
            console.log(e)
          }
        }

      } catch (err) {

        console.log('❌ ERROR MESSAGE')
        console.log(err)

      }
    }
  )
}

// ================= ANTI CRASH =================

process.on(
  'uncaughtException',
  console.error
)

process.on(
  'unhandledRejection',
  console.error
)

// ================= START =================

startBot()