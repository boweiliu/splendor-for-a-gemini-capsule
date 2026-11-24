'use strict'
// Wording the game shows to people that is NOT carried over from the original
// splendor-server. Every entry below is a placeholder written as an
// instruction: replace each `todo(...)` with real text. Facts to cover are
// listed in the instruction itself.
//
// Wording that does come from the original web game (game messages, table
// titles, the command help table) stays in game.js and render.js as it was.

const todo = (instruction) => `[BOWEI: ${instruction}]`

module.exports = {
  // ---- home page, /splendor/ ----
  indexIntro: todo('one or two sentences saying what this is: Splendor, two players, played by typing short commands'),
  indexCertificate: todo(
    'explain that the Gemini client will ask the player to create a certificate (an identity), that this is how the game knows which player they are, and that they should keep using the same one',
  ),
  indexHowToPlay: todo(
    'explain: pick a game name and send the same name to your friend; first person in is player 1, second is player 2, anyone after that can only watch',
  ),
  indexAbout: todo('a credit line for the original web game, linking https://github.com/boweiliu/splendor-server'),
  linkNewGame: todo('link text: start or join a two-player game'),
  linkSoloGame: todo('link text: start or join a solo sandbox where only player 1 can move and turns are not enforced'),
  linkBackToCapsule: todo('link text: back to the capsule front page'),
  linkHome: todo('link text: back to the Splendor home page'),

  // ---- game page ----
  linkRefresh: todo('link text: reload the game page to see the opponent\'s move'),
  shareAddress: todo('one sentence telling the first player to send this address to their opponent so they can join'),

  // ---- input prompts (status 10) ----
  promptGameName: todo('prompt: name the game, saying which characters are allowed (letters, digits, - and _, up to 40) and that the name is what you share with your friend'),
  promptGameNameAgain: todo('prompt shown after a bad name: say which characters are allowed and ask again'),
  promptCommand: todo('prompt: type a command; mention h for help and give one example each of taking jewels, buying a card, and a move followed by a look (like A1;M)'),

  // ---- errors shown by the Gemini status line ----
  needCertificate: todo('tell the player a client certificate is needed to play and that it tells the game which player they are'),
  notFound: todo('not found'),
  tooManyGames: todo('too many games are running right now, try again later'),
  somethingWentWrong: todo('something went wrong on the server'),
  badRequest: todo('the request was not understood'),
  requestTooLong: todo('the request was too long'),
  capsuleUnavailable: todo('the capsule server could not be reached'),

  // ---- game messages that did not exist in the original ----
  cardUnavailable: todo('message: you tried to buy or reserve a market slot that is empty'),
  deckEmpty: todo('message: you tried to reserve blind from a deck that has no cards left'),
}
