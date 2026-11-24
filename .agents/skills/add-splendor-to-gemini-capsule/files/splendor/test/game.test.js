'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')

const copy = require('../copy')
const { handleCommand, join, newGame, parseSettings, seatOf, sum } = require('../game')

// Deterministic generator so every test sees the same shuffled decks.
function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const twoPlayer = () => {
  const g = newGame(':n=2:t', 'alice', seeded())
  join(g, 'bob')
  return g
}

const msg = (g, user) => g.ui[seatOf(g, user)].message

test('settings come from the colon-prefixed part of the id', () => {
  assert.deepEqual(parseSettings(':n=2:foo'), { n: '2' })
  assert.deepEqual(parseSettings('foo'), {})
  assert.deepEqual(parseSettings(':n=2:x=y:foo'), { n: '2', x: 'y' })
})

test('new game: 40/30/20 cards less the 12 on the market, 3 nobles, stocks for two players', () => {
  const g = newGame('x', 'alice', seeded())
  assert.equal(g.decks.A.length, 36)
  assert.equal(g.decks.B.length, 26)
  assert.equal(g.decks.C.length, 16)
  assert.equal(Object.keys(g.market).length, 12)
  assert.equal(g.nobles.length, 3)
  assert.deepEqual(g.stocks, [4, 4, 4, 4, 4, 5])
})

test('seats go to the creator, then the next visitor, then spectators', () => {
  const g = newGame('x', 'alice', seeded())
  assert.equal(seatOf(g, 'alice'), 'p1')
  assert.equal(join(g, 'bob'), 'p2')
  assert.equal(join(g, 'carol'), 'sp')
  assert.equal(seatOf(g, 'bob'), 'p2')
  assert.match(g.ui.p2.message, /Joined! You are player 2/)
})

test('taking three different jewels moves them from stock to inventory and passes the turn', () => {
  const g = twoPlayer()
  handleCommand(g, 'alice', 'qwe')
  assert.deepEqual(g.inventory.p1, [1, 1, 1, 0, 0, 0])
  assert.deepEqual(g.stocks, [3, 3, 3, 4, 4, 5])
  assert.equal(g.whose_turn, 'p2')
  assert.equal(msg(g, 'alice'), 'Acquired QWE.')
})

test('taking two of a kind needs a full pile, and a dash allows fewer jewels', () => {
  const g = twoPlayer()
  handleCommand(g, 'alice', 'QQ')
  assert.deepEqual(g.inventory.p1.slice(0, 2), [2, 0])
  handleCommand(g, 'bob', 'QQ')
  assert.match(msg(g, 'bob'), /at least 4 jewels/)
  assert.equal(g.whose_turn, 'p2', 'a failed move does not pass the turn')
  handleCommand(g, 'bob', 'WE-')
  assert.deepEqual(g.inventory.p2, [0, 1, 1, 0, 0, 0])
})

test('moves out of turn are refused and spectators cannot move', () => {
  const g = twoPlayer()
  handleCommand(g, 'bob', 'QWE')
  assert.equal(msg(g, 'bob'), "It's not your turn!")
  handleCommand(g, 'carol', 'QWE')
  assert.equal(g.ui.sp.message, "It's not your turn!")
  assert.equal(sum(g.inventory.p2), 0)
})

test('a two-player game does not start until the second player has joined', () => {
  const g = newGame(':n=2:t', 'alice', seeded())
  handleCommand(g, 'alice', 'QWE')
  assert.equal(msg(g, 'alice'), 'Needs at least 2 players!')
})

test('a solo game lets player 1 keep moving and keeps player 2 out', () => {
  const g = newGame('solo', 'alice', seeded())
  handleCommand(g, 'alice', 'QWE')
  handleCommand(g, 'alice', 'RT-')
  assert.equal(sum(g.inventory.p1), 5)
  assert.equal(g.whose_turn, 'p1')
})

test('inventory is capped at ten jewels', () => {
  const g = newGame('solo', 'alice', seeded())
  g.inventory.p1 = [2, 2, 2, 2, 1, 0]
  handleCommand(g, 'alice', 'QWE')
  assert.match(msg(g, 'alice'), /inventory too full/)
})

test('buying: pays jewels, uses production first, returns payment to stock, refills the market slot', () => {
  const g = newGame('solo', 'alice', seeded())
  g.market.A1 = [1, 1, 0, 0, 0, 'E', 0]
  g.inventory.p1 = [1, 1, 0, 0, 0, 0]
  g.stocks = [3, 3, 4, 4, 4, 5]
  const deckBefore = g.decks.A.length
  handleCommand(g, 'alice', 'A1')
  assert.equal(msg(g, 'alice'), 'Purchased card A1.')
  assert.deepEqual(g.inventory.p1, [0, 0, 0, 0, 0, 0])
  assert.deepEqual(g.stocks, [4, 4, 4, 4, 4, 5])
  assert.deepEqual(g.production.p1, [0, 0, 1, 0, 0])
  assert.equal(g.decks.A.length, deckBefore - 1)
  assert.ok(g.market.A1, 'slot refilled')

  g.market.A2 = [0, 0, 2, 0, 0, 'Q', 0]
  g.inventory.p1 = [0, 0, 1, 0, 0, 0]
  handleCommand(g, 'alice', 'A2')
  assert.equal(msg(g, 'alice'), 'Purchased card A2.', 'one emerald of production plus one in hand pays for two')
  assert.deepEqual(g.inventory.p1, [0, 0, 0, 0, 0, 0])
})

test('buying: gold covers a shortfall, and too little is refused', () => {
  const g = newGame('solo', 'alice', seeded())
  g.market.B1 = [0, 0, 0, 0, 3, 'R', 1]
  g.inventory.p1 = [0, 0, 0, 0, 1, 2]
  handleCommand(g, 'alice', 'B1')
  assert.equal(msg(g, 'alice'), 'Purchased card B1.')
  assert.equal(g.points.p1, 1)
  assert.equal(g.inventory.p1[5], 0)
  assert.equal(g.stocks[5], 7)

  g.market.B2 = [5, 0, 0, 0, 0, 'R', 2]
  handleCommand(g, 'alice', 'B2')
  assert.equal(msg(g, 'alice'), "Can't buy, not enough to pay!")
})

test('buying an empty slot or a missing reserve is an error, not a crash', () => {
  const g = newGame('solo', 'alice', seeded())
  g.market.C3 = undefined
  handleCommand(g, 'alice', 'C3')
  assert.equal(msg(g, 'alice'), copy.cardUnavailable)
  handleCommand(g, 'alice', 'X2')
  assert.equal(msg(g, 'alice'), "That reserve card doesn't exist!")
})

test('reserving takes a market card (and refills), or the top of the deck for slot 0, and pays gold', () => {
  const g = newGame('solo', 'alice', seeded())
  const wanted = g.market.B2
  handleCommand(g, 'alice', 'GB2')
  assert.equal(msg(g, 'alice'), 'Reserved card B2 to slot X1.')
  assert.deepEqual(g.reserves.p1[0], wanted)
  assert.notDeepEqual(g.market.B2, wanted)
  assert.equal(g.inventory.p1[5], 1)
  assert.equal(g.stocks[5], 4)

  const top = g.decks.C[g.decks.C.length - 1]
  handleCommand(g, 'alice', 'GC0')
  assert.equal(msg(g, 'alice'), 'Reserved card C0 to slot X2.')
  assert.deepEqual(g.reserves.p1[1], top)
})

test('reserving: at most three, and no gold when the pile is empty', () => {
  const g = newGame('solo', 'alice', seeded())
  g.stocks[5] = 0
  handleCommand(g, 'alice', 'GA1')
  assert.equal(g.inventory.p1[5], 0)
  assert.equal(g.stocks[5], 0, 'stock never goes negative')
  handleCommand(g, 'alice', 'GA2')
  handleCommand(g, 'alice', 'GA3')
  handleCommand(g, 'alice', 'GA4')
  assert.equal(msg(g, 'alice'), "Can't reserve, already have 3 reserves.")
})

test('a reserved card can be bought with X', () => {
  const g = newGame('solo', 'alice', seeded())
  g.reserves.p1 = [[0, 0, 0, 0, 1, 'W', 0]]
  g.inventory.p1 = [0, 0, 0, 0, 1, 0]
  handleCommand(g, 'alice', 'X1')
  assert.equal(msg(g, 'alice'), 'Purchased card X1.')
  assert.equal(g.reserves.p1.length, 0)
  assert.deepEqual(g.production.p1, [0, 1, 0, 0, 0])
})

test('a noble goes to the first player whose buildings cover it, for 3 points', () => {
  const g = newGame('solo', 'alice', seeded())
  g.nobles = [[0, 0, 0, 0, 1, ''], [9, 9, 9, 9, 9, '']]
  g.market.A1 = [0, 0, 0, 0, 0, 'T', 0]
  handleCommand(g, 'alice', 'A1')
  assert.equal(g.nobles[0][5], 'p1')
  assert.equal(g.nobles[1][5], '')
  assert.equal(g.points.p1, 3)
})

test('reaching 15 points ends the game, in a two-player game too', () => {
  const g = twoPlayer()
  g.points.p1 = 13
  g.market.C1 = [0, 0, 0, 0, 0, 'Q', 2]
  handleCommand(g, 'alice', 'C1')
  assert.match(msg(g, 'alice'), /Player 1 wins!/)
  assert.equal(g.whose_turn, 'gg')
  handleCommand(g, 'bob', 'QWE')
  assert.equal(msg(g, 'bob'), 'The game is over!')
})

test('looks: a show command sets the view and clears the message; moves keep the view unless given one', () => {
  const g = twoPlayer()
  handleCommand(g, 'alice', 'MS')
  assert.equal(g.ui.p1.view, 'MS')
  assert.equal(g.ui.p1.message, '')
  handleCommand(g, 'alice', 'QWE')
  assert.equal(g.ui.p1.view, 'MS', 'a bare move leaves the view alone')
  handleCommand(g, 'bob', 'RT-;i')
  assert.equal(g.ui.p2.view, 'I')
})

test('garbage input is reported without echoing it back', () => {
  const g = twoPlayer()
  handleCommand(g, 'alice', '=> gemini://evil.example hi')
  assert.equal(msg(g, 'alice'), 'Invalid command before the semicolon.')
  assert.ok(!msg(g, 'alice').includes('evil'))
  handleCommand(g, 'alice', 'u')
  assert.equal(msg(g, 'alice'), 'Undo command not yet supported.')
  handleCommand(g, 'alice', 'help')
  assert.equal(g.ui.p1.view, 'H')
})
