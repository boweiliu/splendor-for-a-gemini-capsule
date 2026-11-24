'use strict'
// Routes /splendor/... Gemini requests. Pure function of (request, store):
// no sockets here, so it can be tested directly.

const copy = require('./copy')
const { handleCommand, join, newGame } = require('./game')
const { BASE, gameUrl, renderGame, renderIndex } = require('./render')

const GEMTEXT = 'text/gemini; charset=utf-8'
const NAME_RE = /^[A-Za-z0-9_-]{1,40}$/
// Raw ids as the original web game used them: optional ":key=value:" settings
// in front of the name.
const GAME_ID_RE = /^:?[A-Za-z0-9_=:-]{1,60}$/

const text = (body) => ({ status: 20, meta: GEMTEXT, body })
const redirect = (to) => ({ status: 30, meta: to })
const prompt = (message) => ({ status: 10, meta: message })
const NEED_CERT = { status: 60, meta: copy.needCertificate }


// url: a parsed URL. userId: certificate fingerprint, or null if none was sent.
function handleSplendor(url, userId, store, hostname) {
  let pathname
  let query = null
  try {
    pathname = decodeURIComponent(url.pathname)
    if (url.search.length > 1) query = decodeURIComponent(url.search.slice(1))
  } catch (err) {
    return { status: 59, meta: copy.badRequest }
  }

  if (pathname === BASE) return redirect(BASE + '/')
  if (pathname === BASE + '/') return text(renderIndex())

  if (pathname === BASE + '/new' || pathname === BASE + '/solo') {
    if (query === null) return prompt(copy.promptGameName)
    if (!NAME_RE.test(query)) return prompt(copy.promptGameNameAgain)
    // Two-player games carry the original's ":n=2:" setting in their id.
    return redirect(gameUrl(pathname === BASE + '/new' ? ':n=2:' + query : query))
  }

  const match = /^\/splendor\/g\/([^/]+)(\/cmd)?$/.exec(pathname)
  if (!match || !GAME_ID_RE.test(match[1])) return { status: 51, meta: copy.notFound }
  const id = match[1]
  const isCmd = Boolean(match[2])

  if (!userId) return NEED_CERT

  let game = store.get(id)
  if (!game) {
    if (!store.hasRoom()) return { status: 41, meta: copy.tooManyGames }
    game = newGame(id, userId)
    store.put(game)
    store.save()
  } else {
    const hadSecondPlayer = Boolean(game.players.p2)
    join(game, userId)
    if (!hadSecondPlayer && game.players.p2) store.save()
  }

  if (isCmd) {
    if (query === null) return prompt(copy.promptCommand)
    handleCommand(game, userId, query.slice(0, 200))
    store.save()
    return redirect(gameUrl(id))
  }
  return text(renderGame(game, userId, hostname))
}

module.exports = { handleSplendor }
