/* End-to-end smoke check for the feature upgrade (Segment 3 verification gate).
 * Simulates the full near-win flow the UI performs, using only the pure engine:
 * near-win deal -> auto-complete animation steps -> win -> statistics update.
 * Run: node plans/smoke_upgrade.js  (must exit 0)
 */
'use strict';
const assert = require('node:assert/strict');
const SolitaireEngine = require('../engine.js');

let checks = 0;
function ok(name, fn) {
  fn();
  checks++;
  console.log('smoke ok - ' + name);
}

/* 1. Near-win deal loads in the user's saved draw-3 preference */
ok('near-win deal with draw mode 3 is immediately auto-completable', () => {
  const state = SolitaireEngine.createNearWinState(3);
  assert.equal(state.drawMode, 3);
  assert.equal(SolitaireEngine.canAutoComplete(state), true);
  assert.equal(SolitaireEngine.isGameWon(state), false);
});

/* 2. The animation loop the UI runs: one step per tick until the game is won */
ok('auto-complete step loop finishes the game in 8 ticks with win scoring', () => {
  const state = SolitaireEngine.createNearWinState(3);
  let ticks = 0;
  const preview = SolitaireEngine.getAutoCompleteMoves(state);
  assert.equal(preview.length, 8, 'preview predicts 8 moves');
  while (!SolitaireEngine.isGameWon(state)) {
    const step = SolitaireEngine.autoCompleteStep(state);
    assert.ok(step, 'tick ' + (ticks + 1) + ' must produce a move');
    ticks++;
    assert.ok(ticks <= 52, 'animation must terminate');
  }
  assert.equal(ticks, 8);
  assert.equal(state.score, 520);
  assert.equal(state.moves, 8);
  assert.equal(SolitaireEngine.canAutoComplete(state), false, 'button hides once won');
});

/* 3. Undo still works after auto-complete and reverses score changes */
ok('undo reverses the last auto-complete step including its score', () => {
  const state = SolitaireEngine.createNearWinState(3);
  SolitaireEngine.autoCompleteStep(state);
  assert.equal(state.score, 450);
  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(state.score, 440);
  assert.equal(state.moves, 0);
  assert.equal(SolitaireEngine.canAutoComplete(state), true, 'button returns after undo');
});

/* 4. Draw-3 play path: draw, hint, recycle, all consistent */
ok('draw-3 draw/hint/recycle path is consistent mid-game', () => {
  const state = SolitaireEngine.createInitialState(false, undefined, 3);
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.waste.length, 3);
  const hint = SolitaireEngine.findHint(state);
  assert.ok(hint, 'a hint always exists while the stock has cards');
  for (let i = 0; i < 7; i++) SolitaireEngine.drawFromStock(state);
  assert.equal(state.stock.length, 0);
  assert.equal(SolitaireEngine.drawFromStock(state), true, 'recycle click');
  assert.equal(state.stock.length, 24);
});

/* 5. Statistics update exactly as the UI records them */
ok('stats record win once, then an abandoned game as a loss', () => {
  let stats = SolitaireEngine.createDefaultStats();
  // Win the near-win deal in 42 seconds
  stats = SolitaireEngine.recordGameResult(stats, true, 42);
  assert.deepEqual(
    { p: stats.gamesPlayed, w: stats.gamesWon, pct: stats.winPercentage, s: stats.currentStreak, b: stats.bestStreak, t: stats.bestTime },
    { p: 1, w: 1, pct: 100, s: 1, b: 1, t: 42 }
  );
  // Player abandons an in-progress game: recorded as a loss with no best-time update
  stats = SolitaireEngine.recordGameResult(stats, false, 500);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.bestStreak, 1);
  assert.equal(stats.bestTime, 42, 'loss never touches best time');
  assert.equal(stats.winPercentage, 50);
  assert.equal(SolitaireEngine.formatTime(stats.bestTime), '00:42');
});

console.log('smoke: all ' + checks + ' checks passed.');
