'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const tls = require('node:tls')

const copy = require('../copy')
const { createServer } = require('../server')
const { GameStore } = require('../store')

const HOST = 'capsule.test'
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'splendor-test-'))

function makeCert(name) {
  const key = path.join(tmp, name + '.key')
  const cert = path.join(tmp, name + '.crt')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
    '-subj', `/CN=${name}`, '-days', '2', '-keyout', key, '-out', cert,
  ], { stdio: 'ignore' })
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) }
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function request(port, line, identity) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: '127.0.0.1', port, rejectUnauthorized: false, servername: HOST, ...identity })
    const chunks = []
    socket.on('secureConnect', () => socket.write(line + '\r\n'))
    socket.on('data', (c) => chunks.push(c))
    socket.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    socket.on('error', reject)
  })
}

const url = (p) => `gemini://${HOST}${p}`
const header = (response) => response.split('\r\n')[0]
const body = (response) => response.slice(response.indexOf('\r\n') + 2)

async function setup() {
  const serverCreds = makeCert('server')
  const upstreamSeen = []
  const upstream = tls.createServer(serverCreds, (socket) => {
    socket.once('data', (data) => {
      upstreamSeen.push(data.toString())
      socket.end('20 text/gemini\r\nfrom agate\r\n')
    })
    socket.on('error', () => {})
  })
  const upstreamPort = await listen(upstream)
  const store = new GameStore(path.join(tmp, `games-${Math.random()}.json`))
  const server = createServer({
    ...serverCreds,
    store,
    hostname: HOST,
    upstream: { host: '127.0.0.1', port: upstreamPort },
  })
  const port = await listen(server)
  return { port, store, upstreamSeen, close: () => { server.close(); upstream.close() } }
}

test('everything outside /splendor goes to the capsule server unchanged', async (t) => {
  const s = await setup()
  t.after(s.close)
  const response = await request(s.port, url('/posts/hello.gmi?x=1'))
  assert.equal(response, '20 text/gemini\r\nfrom agate\r\n')
  assert.deepEqual(s.upstreamSeen, [url('/posts/hello.gmi?x=1') + '\r\n'])
  assert.equal(header(await request(s.port, url('/splendorous'))), '20 text/gemini', '/splendorous is not our prefix')
})

test('a dead capsule server gives status 43, not a hang', async (t) => {
  const s = await setup()
  t.after(s.close)
  const server = createServer({
    ...makeCert('x'),
    store: s.store,
    hostname: HOST,
    upstream: { host: '127.0.0.1', port: 1 },
  })
  const port = await listen(server)
  t.after(() => server.close())
  assert.match(header(await request(port, url('/'))), /^43 /)
})

test('malformed requests are refused', async (t) => {
  const s = await setup()
  t.after(s.close)
  assert.match(header(await request(s.port, 'not a url')), /^59 /)
  assert.match(header(await request(s.port, 'https://capsule.test/')), /^59 /)
  assert.match(header(await request(s.port, url('/' + 'a'.repeat(1100)))), /^59 /)
})

test('the splendor home page is public; game pages ask for a client certificate', async (t) => {
  const s = await setup()
  t.after(s.close)
  const home = await request(s.port, url('/splendor/'))
  assert.equal(header(home), '20 text/gemini; charset=utf-8')
  assert.match(body(home), /=> \/splendor\/new /)
  assert.equal(header(await request(s.port, url('/splendor'))), '30 /splendor/')
  assert.match(header(await request(s.port, url('/splendor/g/abc'))), /^60 /)
  assert.match(header(await request(s.port, url('/splendor/nope'))), /^51 /)
})

test('naming a game: prompt, validation, then redirect to the game', async (t) => {
  const s = await setup()
  t.after(s.close)
  assert.match(header(await request(s.port, url('/splendor/new'))), /^10 /)
  assert.match(header(await request(s.port, url('/splendor/new?bad%20name%21'))), /^10 /)
  assert.equal(header(await request(s.port, url('/splendor/new?friday'))), '30 /splendor/g/:n=2:friday')
  assert.equal(header(await request(s.port, url('/splendor/solo?lonely'))), '30 /splendor/g/lonely')
})

test('two players play over the wire: seats follow certificates, moves redirect to the page', async (t) => {
  const s = await setup()
  t.after(s.close)
  const alice = makeCert('alice')
  const bob = makeCert('bob')
  const carol = makeCert('carol')
  const game = '/splendor/g/:n=2:match'

  const a1 = await request(s.port, url(game), alice)
  assert.equal(header(a1), '20 text/gemini; charset=utf-8')
  assert.match(body(a1), /New game started! You are player 1\./)
  assert.ok(body(a1).includes(copy.shareAddress))
  assert.match(body(a1), /gemini:\/\/capsule\.test\/splendor\/g\/:n=2:match/)

  const b1 = await request(s.port, url(game), bob)
  assert.match(body(b1), /Joined! You are player 2\./)
  assert.match(body(b1), /It is not your turn\./)

  assert.equal(header(await request(s.port, url(game + '/cmd'), alice)), '10 ' + copy.promptCommand)
  assert.equal(header(await request(s.port, url(game + '/cmd?qwe'), alice)), `30 ${game}`)

  const a2 = await request(s.port, url(game), alice)
  assert.match(body(a2), /Acquired QWE\./)
  assert.match(body(a2), /It is not your turn\./)

  const b2 = await request(s.port, url(game), bob)
  assert.match(body(b2), /It is currently your turn\./)
  await request(s.port, url(game + '/cmd?A1'), alice)
  assert.match(body(await request(s.port, url(game), alice)), /It's not your turn!/)

  const c1 = await request(s.port, url(game), carol)
  assert.match(body(c1), /You are player spectator\./)
  assert.equal(header(await request(s.port, url(game + '/cmd?M'), bob)), `30 ${game}`)
  const market = await request(s.port, url(game), bob)
  assert.match(body(market), /Card ID\s+Q\s+W\s+E\s+R\s+T\s+Gem\s+VP/)
  assert.match(body(market), /```/)
  assert.ok(s.store.get(':n=2:match'), 'game is kept in the store')
})

test('games survive a restart: they are reloaded from the saved file', async (t) => {
  const file = path.join(tmp, 'persist.json')
  const first = new GameStore(file)
  const { newGame, handleCommand, join } = require('../game')
  const g = newGame('persisted', 'alice')
  join(g, 'bob')
  first.put(g)
  handleCommand(g, 'alice', 'QWE')
  first.save()
  const second = new GameStore(file)
  assert.deepEqual(second.get('persisted').inventory.p1, [1, 1, 1, 0, 0, 0])
  assert.equal(second.get('persisted').players.p2, 'bob')
})

test('games nobody touched for a month are dropped on load', () => {
  const file = path.join(tmp, 'old.json')
  fs.writeFileSync(file, JSON.stringify({ old: { id: 'old', updated: Date.now() - 31 * 86400000 }, fresh: { id: 'fresh', updated: Date.now() } }))
  const store = new GameStore(file)
  assert.equal(store.get('old'), undefined)
  assert.ok(store.get('fresh'))
})

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }))
