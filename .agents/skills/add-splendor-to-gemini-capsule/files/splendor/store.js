'use strict'
// Game storage: all games in memory, written to one JSON file after every
// change so a container restart does not lose a game in progress.

const fs = require('node:fs')
const path = require('node:path')

const MAX_GAMES = 300
const MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000

class GameStore {
  constructor(file) {
    this.file = file
    this.games = {}
    if (file) this.load()
  }

  load() {
    try {
      this.games = JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[splendor] could not read saved games, starting empty:', err.message)
      this.games = {}
    }
    this.prune()
  }

  prune(now = Date.now()) {
    for (const [id, game] of Object.entries(this.games)) {
      if (now - (game.updated || 0) > MAX_IDLE_MS) delete this.games[id]
    }
  }

  get(id) {
    return this.games[id]
  }

  // Room for one more game, after dropping the ones nobody has touched in a month.
  hasRoom() {
    this.prune()
    return Object.keys(this.games).length < MAX_GAMES
  }

  put(game) {
    this.games[game.id] = game
  }

  save() {
    if (!this.file) return
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.games))
    fs.renameSync(tmp, this.file)
  }
}

module.exports = { GameStore, MAX_GAMES }
