'use strict'
// Splendor rules engine, ported from boweiliu/splendor-server (index.js).
// Pure logic: no HTTP, no HTML. Rendering lives in render.js.
//
// Differences from the original, all fixes for cases where it crashed or
// stopped making sense:
//   - reserving a blind card (GA0, GB0, GC0) draws from the deck; the original
//     tested the wrong character and pushed undefined.
//   - buying or reserving an empty market slot, or an out-of-range reserve,
//     is an error message instead of an exception.
//   - a 2-player game ends when someone reaches 15 points; the original
//     overwrote the end-of-game marker with the next player's turn.
//   - gold is only taken when the gold pile is not empty.
//   - a take command with no jewels in it ("---") is rejected.

const copy = require('./copy')
const CARD_LIST = require('./card_table.json')
const NOBLE_LIST = require('./nobles.json')

const JEWEL_LETTERS = ['Q', 'W', 'E', 'R', 'T', 'G']
const JEWEL_NAMES = ['Quartz', 'Wolframite', 'Emerald', 'Ruby', 'Turquoise', 'Gold']
const CARD_KEYS = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4']
const MAX_VICTORY_POINTS = 15
const MAX_INVENTORY = 10
const MAX_RESERVES = 3

const SHOW_COMMANDS_REGEX = /^[HIJKLMOPSV]*$/
const ACTION_REGEX = /^([QWERT-]{2,3}|[A-C][1-4]|X[1-3]|G[A-C][0-4])(;[HIJKLMOPSV]*)?$/

const jewelIdx = (ch) => {
  const i = JEWEL_LETTERS.indexOf(ch)
  return i < 0 ? null : i
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0)

// Game ids may start with ':' to carry settings: ":n=2:myname" -> {n: '2'}.
// The last colon-separated part is the free-form name.
function parseSettings(gameId) {
  const settings = {}
  if (gameId[0] !== ':') return settings
  const parts = gameId.slice(1).split(':')
  parts.pop()
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key) settings[key] = value
  }
  return settings
}

const playersNeeded = (state) => (parseInt(state.settings.n, 10) > 1 ? 2 : 1)

function shuffle(items, rng) {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function newGame(gameId, creatorId, rng = Math.random) {
  const decks = JSON.parse(JSON.stringify(CARD_LIST))
  decks.A = shuffle(decks.A, rng)
  decks.B = shuffle(decks.B, rng)
  decks.C = shuffle(decks.C, rng)
  const market = {}
  for (let i = 1; i <= 4; i++) {
    market['A' + i] = decks.A.pop()
    market['B' + i] = decks.B.pop()
    market['C' + i] = decks.C.pop()
  }
  return {
    id: gameId,
    settings: parseSettings(gameId),
    created: Date.now(),
    updated: Date.now(),
    players: { p1: creatorId },
    whose_turn: 'p1',
    points: { p1: 0, p2: 0 },
    inventory: { p1: [0, 0, 0, 0, 0, 0], p2: [0, 0, 0, 0, 0, 0] },
    stocks: [4, 4, 4, 4, 4, 5],
    decks,
    market,
    // Only the nobles in play this game; the 6th column is who owns it.
    nobles: shuffle(NOBLE_LIST, rng)
      .slice(0, 3)
      .map((n) => n.concat([''])),
    reserves: { p1: [], p2: [] },
    purchased: { p1: [], p2: [] },
    production: { p1: [0, 0, 0, 0, 0], p2: [0, 0, 0, 0, 0] },
    // What each seat's page shows. 'sp' is shared by all spectators.
    ui: {
      p1: { message: 'New game started! You are player 1.', view: 'H' },
      p2: { message: '', view: 'H' },
      sp: { message: '', view: 'H' },
    },
  }
}

// Which seat a user holds. Seats are claimed by first visit: p1 is the
// creator, p2 the next distinct visitor, everyone after that spectates.
function seatOf(state, userId) {
  if (state.players.p1 === userId) return 'p1'
  if (state.players.p2 === userId) return 'p2'
  return 'sp'
}

// Claim a seat for a visitor if one is free. Returns their seat.
function join(state, userId) {
  const seat = seatOf(state, userId)
  if (seat === 'sp' && !state.players.p2) {
    state.players.p2 = userId
    state.ui.p2 = { message: 'Joined! You are player 2.', view: 'H' }
    return 'p2'
  }
  return seat
}

const otherSeat = (seat) => (seat === 'p1' ? 'p2' : seat === 'p2' ? 'p1' : 'sp')

// ---- actions ---------------------------------------------------------------

function takeJewels(state, me, command) {
  const letters = command.split('').filter((c) => c !== '-')
  const inv = state.inventory[me]
  const tooFull = () => sum(inv) + letters.length > MAX_INVENTORY
  const unique = new Set(letters).size === letters.length

  if (letters.length === 2 && command.length === 2 && letters[0] === letters[1]) {
    if (tooFull()) return fail("Can't take that many jewels, inventory too full.")
    const i = jewelIdx(letters[0])
    if (state.stocks[i] < 4) return fail("Can't do that, needs to have at least 4 jewels in that stock.")
    inv[i] += 2
    state.stocks[i] -= 2
    return ok(`Acquired ${command}.`)
  }
  if (command.length === 3 && letters.length > 0 && unique) {
    if (tooFull()) return fail("Can't take that many jewels, inventory too full.")
    if (letters.some((c) => state.stocks[jewelIdx(c)] === 0)) return fail("Can't do that, insufficient stocks.")
    for (const c of letters) {
      inv[jewelIdx(c)] += 1
      state.stocks[jewelIdx(c)] -= 1
    }
    return ok(`Acquired ${command}.`)
  }
  return fail(
    `Unable to parse ${command}. You must take at most 2 gems of the same color, or at most 3 gems of distinct colors. Use '-' to explicitly take fewer gems.`,
  )
}

function buyCard(state, me, command) {
  let cost
  if (command[0] === 'X') {
    const slot = parseInt(command[1], 10)
    if (state.reserves[me].length < slot) return fail("That reserve card doesn't exist!")
    cost = state.reserves[me][slot - 1]
  } else {
    cost = state.market[command]
  }
  if (!cost) return fail(copy.cardUnavailable)

  const production = state.production[me]
  const inv = state.inventory[me]
  let short = 0
  for (let i = 0; i < 5; i++) {
    const afterProduction = Math.max(0, cost[i] - production[i])
    short += Math.max(0, afterProduction - inv[i])
  }
  if (short > inv[5]) return fail("Can't buy, not enough to pay!")

  // Pay: jewels first, gold for what is missing; everything goes back to stock.
  for (let i = 0; i < 5; i++) {
    const afterProduction = Math.max(0, cost[i] - production[i])
    const paid = Math.min(inv[i], afterProduction)
    inv[i] -= paid
    state.stocks[i] += paid
  }
  inv[5] -= short
  state.stocks[5] += short

  state.purchased[me].push(cost)
  if (command[0] === 'X') {
    state.reserves[me].splice(parseInt(command[1], 10) - 1, 1)
  } else {
    state.market[command] = state.decks[command[0]].pop()
  }
  production[jewelIdx(cost[5])] += 1
  state.points[me] += cost[6]

  for (const noble of state.nobles) {
    if (noble[5] === '' && production.every((p, i) => p >= noble[i])) {
      noble[5] = me
      state.points[me] += 3
    }
  }

  let message = `Purchased card ${command}.`
  if (state.points[me] >= MAX_VICTORY_POINTS) {
    message += ` Player ${me[1]} wins!`
    state.whose_turn = 'gg'
  }
  return ok(message)
}

function reserveCard(state, me, command) {
  const tier = command[1]
  const slotKey = command.slice(1)
  if (sum(state.inventory[me]) >= MAX_INVENTORY) return fail("Can't reserve, inventory too full.")
  if (state.reserves[me].length >= MAX_RESERVES) return fail("Can't reserve, already have 3 reserves.")

  let card
  if (command[2] === '0') {
    card = state.decks[tier].pop()
    if (!card) return fail(copy.deckEmpty)
  } else {
    card = state.market[slotKey]
    if (!card) return fail(copy.cardUnavailable)
    state.market[slotKey] = state.decks[tier].pop()
  }
  state.reserves[me].push(card)
  if (state.stocks[5] > 0) {
    state.inventory[me][5] += 1
    state.stocks[5] -= 1
  }
  return ok(`Reserved card ${slotKey} to slot X${state.reserves[me].length}.`)
}

const ok = (message) => ({ ok: true, message })
const fail = (message) => ({ ok: false, message })

function runAction(state, seat, action) {
  if (state.whose_turn === 'gg') return fail('The game is over!')
  if (state.whose_turn !== seat) return fail("It's not your turn!")
  if (!state.players.p2 && playersNeeded(state) > 1) return fail('Needs at least 2 players!')

  let result
  if (/^[QWERT-]{2,3}$/.test(action)) result = takeJewels(state, seat, action)
  else if (/^([A-C][1-4]|X[1-3])$/.test(action)) result = buyCard(state, seat, action)
  else result = reserveCard(state, seat, action)

  // Hand over the turn only in games that need two players, and only if the
  // game did not just end.
  if (result.ok && playersNeeded(state) > 1 && state.whose_turn !== 'gg') {
    state.whose_turn = otherSeat(seat)
  }
  return result
}

// Handle one line typed by a user. Updates the seat's message and view in
// state.ui and returns nothing; the caller re-renders the page.
function handleCommand(state, userId, raw) {
  const seat = join(state, userId)
  const ui = state.ui[seat]
  let command = String(raw || '')
    .trim()
    .replace(/[\r\n]/g, '')
    .replace(/;{2,}/g, ';')
    .toUpperCase()
  if (command === 'HELP') command = 'H'
  command = command.replace(/;HELP$/, ';H')
  state.updated = Date.now()
  if (!command) return

  if (ACTION_REGEX.test(command)) {
    const [action, shows] = command.split(';')
    ui.message = runAction(state, seat, action).message
    if (shows) ui.view = shows
    return
  }
  if (SHOW_COMMANDS_REGEX.test(command)) {
    ui.view = command
    ui.message = ''
    return
  }
  if (command === 'U') {
    ui.message = 'Undo command not yet supported.'
    return
  }
  // The original's wording; nothing the user typed is echoed back.
  const shows = command.split(';')[1]
  ui.message = 'Invalid command before the semicolon.'
  if (shows !== undefined && SHOW_COMMANDS_REGEX.test(shows)) {
    if (shows) ui.view = shows
    return
  }
  ui.view = 'H'
}

module.exports = {
  CARD_KEYS,
  JEWEL_LETTERS,
  JEWEL_NAMES,
  MAX_VICTORY_POINTS,
  handleCommand,
  join,
  jewelIdx,
  newGame,
  otherSeat,
  parseSettings,
  playersNeeded,
  seatOf,
  sum,
}
