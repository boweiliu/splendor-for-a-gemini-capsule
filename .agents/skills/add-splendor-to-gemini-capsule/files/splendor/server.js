'use strict'
// Gemini front door on :1965.
//
// agate (the capsule's static file server) moves to a loopback port. This
// process terminates TLS on the public port, answers /splendor/... itself, and
// passes every other request through to agate untouched, so the capsule's
// pages and feed behave exactly as before.

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const tls = require('node:tls')

const copy = require('./copy')
const { GameStore } = require('./store')
const { handleSplendor } = require('./handler')
const { BASE } = require('./render')

const MAX_REQUEST = 1024 + 2
const REQUEST_TIMEOUT_MS = 10_000

function parseRequest(line) {
  if (line.length > 1024) return null
  let url
  try {
    url = new URL(line)
  } catch (err) {
    return null
  }
  if (url.protocol !== 'gemini:' || url.username || url.password) return null
  return url
}

const fingerprintOf = (socket) => {
  const cert = socket.getPeerCertificate()
  if (!cert || !cert.raw) return null
  return crypto.createHash('sha256').update(cert.raw).digest('hex')
}

const isSplendorPath = (url) => url.pathname === BASE || url.pathname.startsWith(BASE + '/')

function respond(socket, { status, meta, body }) {
  socket.end(`${status} ${meta}\r\n${body || ''}`)
}

function passThrough(socket, requestBytes, upstream, hostname) {
  const back = tls.connect({
    host: upstream.host,
    port: upstream.port,
    servername: hostname,
    // Loopback hop to our own agate, which holds a self-signed certificate.
    rejectUnauthorized: false,
  })
  back.on('secureConnect', () => {
    back.write(requestBytes)
    back.pipe(socket)
  })
  const giveUp = () => {
    if (!socket.destroyed && !socket.writableEnded) respond(socket, { status: 43, meta: copy.capsuleUnavailable })
    back.destroy()
  }
  back.on('error', giveUp)
  socket.on('close', () => back.destroy())
}

function createServer({ key, cert, store, hostname, upstream, log = () => {} }) {
  const server = tls.createServer({
    key,
    cert,
    minVersion: 'TLSv1.2',
    // Ask for a client certificate (it names the player) but accept any:
    // Gemini identities are self-signed.
    requestCert: true,
    rejectUnauthorized: false,
  })

  server.on('secureConnection', (socket) => {
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy())
    socket.on('error', () => socket.destroy())
    let buf = Buffer.alloc(0)
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk])
      const end = buf.indexOf('\r\n')
      if (end < 0) {
        if (buf.length > MAX_REQUEST) {
          socket.off('data', onData)
          respond(socket, { status: 59, meta: copy.requestTooLong })
        }
        return
      }
      socket.off('data', onData)
      const line = buf.subarray(0, end).toString('utf8')
      const url = parseRequest(line)
      if (!url) return respond(socket, { status: 59, meta: copy.badRequest })
      if (isSplendorPath(url)) {
        let reply
        try {
          reply = handleSplendor(url, fingerprintOf(socket), store, hostname)
        } catch (err) {
          log('splendor error', err && err.stack)
          reply = { status: 42, meta: copy.somethingWentWrong }
        }
        log('splendor', url.pathname, reply.status)
        return respond(socket, reply)
      }
      passThrough(socket, buf.subarray(0, end + 2), upstream, hostname)
    }
    socket.on('data', onData)
  })
  return server
}

// Read agate's certificate for the hostname. agate writes DER files
// (cert.der, key.der); PEM files are accepted too.
function readCredentials(dir) {
  const read = (name) => fs.readFileSync(path.join(dir, name))
  if (fs.existsSync(path.join(dir, 'cert.der'))) {
    return {
      cert: new crypto.X509Certificate(read('cert.der')).toString(),
      key: crypto.createPrivateKey({ key: read('key.der'), format: 'der', type: 'pkcs8' }).export({ type: 'pkcs8', format: 'pem' }),
    }
  }
  return { cert: read('cert.pem'), key: read('key.pem') }
}

// agate writes its self-signed certificate on first start; wait for it.
async function loadCredentials(certsDir, hostname, waitMs = 60_000) {
  const dir = path.join(certsDir, hostname)
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      return readCredentials(dir)
    } catch (err) {
      if (Date.now() > deadline) throw new Error(`no certificate under ${dir}: ${err.message}`)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

async function main() {
  const hostname = process.env.GEMINI_RESOLVED_HOSTNAME
  if (!hostname) throw new Error('GEMINI_RESOLVED_HOSTNAME is not set')
  const certsDir = process.env.CERTS_DIR
  const dataDir = process.env.SPLENDOR_DATA_DIR
  const [upHost, upPort] = (process.env.AGATE_ADDR || '127.0.0.1:1966').split(':')
  const listenPort = parseInt(process.env.LISTEN_PORT || '1965', 10)

  const { key, cert } = await loadCredentials(certsDir, hostname)
  const store = new GameStore(path.join(dataDir, 'games.json'))
  const server = createServer({
    key,
    cert,
    store,
    hostname,
    upstream: { host: upHost, port: parseInt(upPort, 10) },
    log: (...args) => console.log('[splendor]', ...args),
  })
  server.listen(listenPort, '0.0.0.0', () => console.log(`[splendor] gemini front door for ${hostname} on :${listenPort}`))
  const stop = () => server.close(() => process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[splendor] fatal:', err.message)
    process.exit(1)
  })
}

module.exports = { createServer, loadCredentials, parseRequest }
