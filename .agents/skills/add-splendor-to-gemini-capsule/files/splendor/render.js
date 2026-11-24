'use strict'
// Gemtext rendering for the Splendor game. Tables become preformatted blocks.
// Table titles and help text are the original web game's wording; anything
// new lives in copy.js.

const copy = require('./copy')
const { CARD_KEYS, JEWEL_LETTERS, jewelIdx, otherSeat, seatOf, sum } = require('./game')

const BASE = '/splendor'

const gameUrl = (id) => `${BASE}/g/${id}`
const cmdUrl = (id, query) => `${BASE}/g/${id}/cmd${query ? '?' + encodeURIComponent(query) : ''}`

function table(rows) {
  const widths = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] || 0, String(cell).length)
    })
  }
  const lines = rows.map((row) =>
    row
      .map((cell, i) => String(cell).padEnd(widths[i]))
      .join('  ')
      .trimEnd(),
  )
  return '```\n' + lines.join('\n') + '\n```'
}

const JEWELS_ROW = JEWEL_LETTERS
const COST_ROW = JEWEL_LETTERS.slice(0, 5)
const CARD_HEAD = ['Card ID', ...COST_ROW, 'Gem', 'VP']

// From the original's HELP_TABLE.
const HELP_TABLE = [
  ['Take jewels', '[QqWwEeRrTt-]{2,3}'],
  ['Buy cards', '[A-Ca-c][1-4]|[Xx][1-3]'],
  ['Reserve cards', '[Gg][A-Ca-z][0-4]'],
  ['[U]ndo (if possible)', 'u'],
  ['Show [h]elp', 'h'],
  ['Show [i]nventory', 'i'],
  ['Show [o]pponent inventory', 'o'],
  ['Show cards on [m]arket', 'm'],
  ['Show cards by [j]ewels provided', 'j'],
  ['[L]ist buyable cards sorted by price', 'l'],
  ['Show [s]tocks of resources', 's'],
  ['Show currently accessible [V]P sources', 'v'],
  ["Show which [p]layer's turn it is", 'p'],
  ['(Show commands can be combined)', ''],
  ['(Actions can also be followed by a semicolon and any number of show commands)', ''],
  ['Send a message to your opponent', 'k(.*)'],
]

const cardRow = (id, card) => [id, ...card.slice(0, 5), card[5], card[6]]

function marketRows(state, me, withOpponent) {
  const opp = otherSeat(me)
  const rows = []
  for (const key of CARD_KEYS) if (state.market[key]) rows.push(cardRow(key, state.market[key]))
  if (me !== 'sp') state.reserves[me].forEach((c, i) => rows.push(cardRow('X' + (i + 1), c)))
  if (withOpponent && me !== 'sp') state.reserves[opp].forEach((c, i) => rows.push(cardRow('O' + (i + 1), c)))
  return rows
}

const RESERVES_NOTE = "X1 - X3 are your reserves, O1 - O3 are your opponent's."

function inventoryPanel(state, seat, who, title) {
  const rows = [
    [who, ...JEWELS_ROW],
    ['Inventory', ...state.inventory[seat]],
    ['Building production', ...state.production[seat]],
    ['Buying power', ...state.inventory[seat].map((n, i) => n + (state.production[seat][i] || 0))],
  ]
  const has = who === 'You' ? 'You have' : `${who} has`
  const summary = `${has} a total of ${sum(state.inventory[seat])} jewels, ${state.purchased[seat].length} buildings, and ${state.reserves[seat].length} reserved cards.`
  return [title, table(rows), summary].join('\n')
}

function pricePanel(state, me) {
  const opp = otherSeat(me)
  const rows = marketRows(state, me, false).map((r) => {
    const cost = r.slice(1, 6)
    const figures = (who) => {
      const oop = cost.map((c, i) => Math.max(0, c - state.production[who][i]))
      const missing = oop.map((c, i) => Math.max(0, c - state.inventory[who][i]))
      return [sum(oop), Math.max(0, sum(missing) - state.inventory[who][5])]
    }
    return { row: r, mine: figures(me), theirs: me === 'sp' ? ['', ''] : figures(opp) }
  })
  rows.sort((a, b) => a.mine[0] - b.mine[0] || a.mine[1] - b.mine[1])
  return [
    'Sorting market by effective price:',
    table([
      [...CARD_HEAD, 'Cost', 'Short?', 'Opp. cost', 'Opp. short'],
      ...rows.map((r) => [...r.row, ...r.mine, ...r.theirs]),
    ]),
  ].join('\n')
}

function panel(state, me, ch) {
  const opp = otherSeat(me)
  if (ch === 'H') return ['Commands:', table(HELP_TABLE)].join('\n')
  if (ch === 'I' || ch === 'O') {
    if (me === 'sp') {
      return [inventoryPanel(state, 'p1', 'Player 1', 'Inventory:'), inventoryPanel(state, 'p2', 'Player 2', 'Inventory:')].join('\n')
    }
    if (ch === 'I') return inventoryPanel(state, me, 'You', 'Inventory:')
    return inventoryPanel(state, opp, 'Opponent', "Opponent's inventory:")
  }
  if (ch === 'J') {
    const rows = marketRows(state, me, true).sort((a, b) => jewelIdx(a[6]) - jewelIdx(b[6]) || String(a[0]).localeCompare(String(b[0])))
    return ['Sorting market by jewels:', table([CARD_HEAD, ...rows])].join('\n')
  }
  if (ch === 'K') return 'Chat:\nNot yet supported.'
  if (ch === 'L') return pricePanel(state, me)
  if (ch === 'M') return ['Cards available on the market:', table([CARD_HEAD, ...marketRows(state, me, true)]), RESERVES_NOTE].join('\n')
  if (ch === 'P') return ['Players:', playersText(state, me)].join('\n')
  if (ch === 'S') return ['Stocks:', table([['', ...JEWELS_ROW], ['Stocks', ...state.stocks]])].join('\n')
  if (ch === 'V') {
    const rows = state.nobles.map((n, i) => ['Noble ' + (i + 1), ...n, 3])
    return ['Available and acquired victory points:', table([['', ...COST_ROW, 'Owned by', 'VP'], ...rows])].join('\n')
  }
  return ''
}

// The original's P command, worded as it was.
function playersText(state, me) {
  if (!state.players.p2) return 'Waiting for a second player...'
  const opp = otherSeat(me)
  const lines = []
  if (me === 'sp') {
    lines.push(table([['', 'Points'], ['Player 1', state.points.p1], ['Player 2', state.points.p2]]))
  } else {
    lines.push(`You have ${state.points[me]} points, your opponent has ${state.points[opp]}.`)
  }
  if (state.whose_turn === 'gg') lines.push('The game is over!')
  else if (state.whose_turn === me) lines.push('It is currently your turn.')
  else lines.push('It is not your turn.')
  lines.push(`You are player ${me === 'p1' ? '1' : me === 'p2' ? '2' : 'spectator'}.`)
  return lines.join('\n')
}

const SHOW_LINKS = [
  ['M', 'Show cards on [m]arket'],
  ['I', 'Show [i]nventory'],
  ['O', 'Show [o]pponent inventory'],
  ['L', '[L]ist buyable cards sorted by price'],
  ['S', 'Show [s]tocks of resources'],
  ['V', 'Show currently accessible [V]P sources'],
]

function renderGame(state, userId, hostname) {
  const me = seatOf(state, userId)
  const ui = state.ui[me]
  const id = state.id
  const out = [`# Splendor: ${id}`, '']
  if (ui.message) out.push(ui.message, '')
  out.push(playersText(state, me), '')
  if (!state.players.p2) out.push(copy.shareAddress, `gemini://${hostname}${gameUrl(id)}`, '')
  out.push(`=> ${cmdUrl(id)} Enter command below:`)
  out.push(`=> ${gameUrl(id)} ${copy.linkRefresh}`)
  for (const [c, label] of SHOW_LINKS) out.push(`=> ${cmdUrl(id, c)} ${label}`)
  out.push('')
  const shown = new Set()
  for (const ch of ui.view.split('')) {
    if (shown.has(ch) && ch !== 'H') continue
    shown.add(ch)
    const text = panel(state, me, ch)
    if (text) out.push(text, '')
  }
  out.push(`=> ${BASE}/ ${copy.linkHome}`)
  return out.join('\n') + '\n'
}

function renderIndex() {
  return [
    '# Splendor',
    '',
    copy.indexIntro,
    '',
    copy.indexCertificate,
    '',
    `=> ${BASE}/new ${copy.linkNewGame}`,
    `=> ${BASE}/solo ${copy.linkSoloGame}`,
    '',
    copy.indexHowToPlay,
    '',
    copy.indexAbout,
    '',
    `=> / ${copy.linkBackToCapsule}`,
    '',
  ].join('\n')
}

module.exports = { BASE, cmdUrl, gameUrl, renderGame, renderIndex }
