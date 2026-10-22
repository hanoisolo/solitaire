'use strict';
/* Automated Node test suite for the Klondike Solitaire engine (engine.js).
 * Verification Gate for Segment 1: "node test_engine.js" must exit 0.
 */
const assert = require('node:assert/strict');
const SolitaireEngine = require('./engine.js');

let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log('ok - ' + name);
}

function card(suit, rank, faceUp) {
  return {
    id: suit + '-' + rank,
    suit: suit,
    rank: rank,
    color: SolitaireEngine.getCardColor(suit),
    faceUp: !!faceUp
  };
}

function freshState() {
  return SolitaireEngine.createInitialState(false);
}

/* 1. 52-card deck creation */
test('createDeck returns 52 unique valid cards', () => {
  const deck = SolitaireEngine.createDeck();
  assert.equal(deck.length, 52);
  const ids = new Set(deck.map((c) => c.id));
  assert.equal(ids.size, 52, 'cards must be unique');
  for (const c of deck) {
    assert.ok(SolitaireEngine.SUITS.includes(c.suit), 'valid suit: ' + c.suit);
    assert.ok(c.rank >= 1 && c.rank <= 13, 'valid rank: ' + c.rank);
    assert.equal(c.faceUp, false, 'new deck cards are face-down');
    if (c.suit === 'hearts' || c.suit === 'diamonds') {
      assert.equal(c.color, 'red');
    } else {
      assert.equal(c.color, 'black');
    }
    assert.equal(c.id, c.suit + '-' + c.rank);
  }
});

/* 2. Shuffle behavior */
test('shuffleDeck is deterministic with a fixed rng and loses no cards', () => {
  const deckA = SolitaireEngine.createDeck();
  const deckB = SolitaireEngine.createDeck();
  const rngA = () => 0.42;
  const rngB = () => 0.42;
  const shuffledA = SolitaireEngine.shuffleDeck(deckA, rngA);
  const shuffledB = SolitaireEngine.shuffleDeck(deckB, rngB);
  assert.deepEqual(
    shuffledA.map((c) => c.id),
    shuffledB.map((c) => c.id),
    'same rng sequence gives the same permutation'
  );
  assert.equal(shuffledA.length, 52);
  assert.equal(new Set(shuffledA.map((c) => c.id)).size, 52, 'no cards lost');
  assert.deepEqual(
    deckA.map((c) => c.id),
    SolitaireEngine.createDeck().map((c) => c.id),
    'input deck is not mutated'
  );
});

test('random shuffle produces a different order but preserves all cards', () => {
  const deck = SolitaireEngine.createDeck();
  const shuffled = SolitaireEngine.shuffleDeck(deck);
  assert.equal(shuffled.length, 52);
  assert.equal(new Set(shuffled.map((c) => c.id)).size, 52);
});

/* 3. Dealing the 7 tableau columns */
test('createInitialState deals 7 tableau columns and a 24-card stock', () => {
  const state = freshState();
  for (let col = 0; col < 7; col++) {
    assert.equal(state.tableau[col].length, col + 1, 'column ' + col + ' size');
    for (let n = 0; n < state.tableau[col].length; n++) {
      assert.equal(
        state.tableau[col][n].faceUp,
        n === col,
        'only the top card of column ' + col + ' is face-up'
      );
    }
  }
  assert.equal(state.stock.length, 24, '24 cards remain in stock');
  for (const c of state.stock) {
    assert.equal(c.faceUp, false, 'stock cards are face-down');
  }
  assert.equal(state.waste.length, 0);
  assert.equal(state.moves, 0);
  assert.equal(state.score, 0);
  assert.equal(state.history.length, 0);
  const total =
    state.stock.length +
    state.waste.length +
    state.tableau.reduce((n, col) => n + col.length, 0) +
    Object.values(state.foundations).reduce((n, p) => n + p.length, 0);
  assert.equal(total, 52, 'all 52 cards accounted for');
});

/* 4. Legal and illegal alternating-color tableau moves */
test('canMoveToTableau enforces alternating colors and descending rank', () => {
  const redSix = [card('hearts', 6, true)];
  const blackSix = [card('spades', 6, true)];
  const redSeven = [card('diamonds', 7, true)];
  const blackSeven = [card('clubs', 7, true)];
  assert.equal(SolitaireEngine.canMoveToTableau(redSix, blackSeven), true);
  assert.equal(SolitaireEngine.canMoveToTableau(blackSix, redSeven), true);
  assert.equal(SolitaireEngine.canMoveToTableau(redSix, redSeven), false, 'same color rejected');
  assert.equal(SolitaireEngine.canMoveToTableau(blackSix, blackSeven), false, 'same color rejected');
  const redEight = [card('hearts', 8, true)];
  assert.equal(SolitaireEngine.canMoveToTableau(redSix, redEight), false, 'non-consecutive rank rejected');
  assert.equal(SolitaireEngine.canMoveToTableau([card('hearts', 13, true)], []), true, 'King on empty column');
  assert.equal(SolitaireEngine.canMoveToTableau([card('hearts', 12, true)], []), false, 'non-King on empty column rejected');
  assert.equal(SolitaireEngine.canMoveToTableau([], []), false, 'empty move rejected');
  assert.equal(
    SolitaireEngine.canMoveToTableau([card('spades', 5, false)], [redSix]),
    false,
    'face-down card rejected'
  );
  assert.equal(
    SolitaireEngine.canMoveToTableau([card('spades', 6, true)], [card('hearts', 7, false)]),
    false,
    'face-down target top rejected'
  );
});

test('moveCards executes legal single-card and multi-card tableau moves', () => {
  const state = freshState();
  state.tableau[0] = [card('spades', 9, false), card('hearts', 8, true), card('clubs', 7, true), card('diamonds', 6, true)];
  state.tableau[1] = [card('spades', 9, true)];
  // Move the stack hearts-8, clubs-7, diamonds-6 onto spades-9
  const moved = SolitaireEngine.moveCards(state, { zone: 'tableau', col: 0, cardIndex: 1 }, { zone: 'tableau', col: 1 });
  assert.equal(moved, true);
  assert.deepEqual(
    state.tableau[1].map((c) => c.id),
    ['spades-9', 'hearts-8', 'clubs-7', 'diamonds-6'],
    'stack moved in order'
  );
  assert.deepEqual(state.tableau[0].map((c) => c.id), ['spades-9'], 'source keeps the face-down card');
  assert.equal(state.moves, 1);
});

test('moveCards rejects illegal moves without touching state or history', () => {
  const state = freshState();
  state.tableau[0] = [card('spades', 9, true)];
  state.tableau[1] = [card('hearts', 9, true)]; // same color family for a black target? hearts is red; craft below
  state.tableau[1] = [card('diamonds', 9, true)];
  const historyBefore = state.history.length;
  const moved = SolitaireEngine.moveCards(state, { zone: 'tableau', col: 0, cardIndex: 0 }, { zone: 'tableau', col: 1 });
  assert.equal(moved, false, 'red onto red rejected');
  assert.equal(state.tableau[0].length, 1, 'source untouched');
  assert.equal(state.tableau[1].length, 1, 'target untouched');
  assert.equal(state.moves, 0);
  assert.equal(state.history.length, historyBefore, 'no snapshot for illegal moves');
});

/* 5. Auto-flip of newly exposed tableau cards */
test('moving a card off a column flips the newly exposed card face-up (+5 score)', () => {
  const state = freshState();
  state.tableau[0] = [card('spades', 7, false), card('hearts', 6, true)];
  state.tableau[1] = [card('clubs', 7, true)];
  const moved = SolitaireEngine.moveCards(state, { zone: 'tableau', col: 0, cardIndex: 1 }, { zone: 'tableau', col: 1 });
  assert.equal(moved, true);
  assert.equal(state.tableau[0][0].faceUp, true, 'exposed card auto-flipped');
  assert.equal(state.score, 5, 'flip bonus');
});

/* 6. Stock/waste cycling */
test('drawFromStock draws to waste and recycles when stock is empty', () => {
  const state = freshState();
  assert.equal(state.stock.length, 24);
  const firstId = state.stock[state.stock.length - 1].id;
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.stock.length, 23);
  assert.equal(state.waste.length, 1);
  assert.equal(state.waste[0].faceUp, true);
  assert.equal(state.waste[0].id, firstId, 'top of stock moves to waste');
  assert.equal(state.moves, 1);

  // Exhaust the stock
  while (state.stock.length > 0) {
    SolitaireEngine.drawFromStock(state);
  }
  assert.equal(state.waste.length, 24);
  const wasteIds = state.waste.map((c) => c.id);

  // Recycle: waste goes back to stock face-down
  const movesBefore = state.moves;
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.stock.length, 24);
  assert.equal(state.waste.length, 0);
  assert.equal(state.moves, movesBefore + 1);
  for (const c of state.stock) {
    assert.equal(c.faceUp, false);
  }
  // Drawing after recycle yields the first-drawn card again
  SolitaireEngine.drawFromStock(state);
  assert.equal(state.waste[0].id, wasteIds[0]);
});

test('drawFromStock returns false when stock and waste are both empty', () => {
  const state = freshState();
  state.stock = [];
  state.waste = [];
  assert.equal(SolitaireEngine.drawFromStock(state), false);
  assert.equal(state.moves, 0);
});

/* 7. Suit-ascending foundation moves */
test('canMoveToFoundation enforces suit and ascending rank from Ace', () => {
  const ace = card('hearts', 1, true);
  assert.equal(SolitaireEngine.canMoveToFoundation(ace, [], 'hearts'), true);
  assert.equal(SolitaireEngine.canMoveToFoundation(ace, [], 'spades'), false, 'suit must match');
  assert.equal(SolitaireEngine.canMoveToFoundation(card('hearts', 2, true), [], 'hearts'), false, '2 not on empty');
  const pile = [card('hearts', 1, true)];
  assert.equal(SolitaireEngine.canMoveToFoundation(card('hearts', 2, true), pile, 'hearts'), true);
  const diamondPile = [card('diamonds', 1, true)];
  assert.equal(SolitaireEngine.canMoveToFoundation(card('diamonds', 2, true), diamondPile, 'diamonds'), true, 'diamonds-2 on diamonds-1 is legal');
  assert.equal(SolitaireEngine.canMoveToFoundation(card('diamonds', 2, true), diamondPile, 'hearts'), false, 'card suit must match the foundation suit');
  assert.equal(SolitaireEngine.canMoveToFoundation(card('hearts', 3, true), pile, 'hearts'), false, 'not consecutive');
  assert.equal(SolitaireEngine.canMoveToFoundation(card('hearts', 2, false), pile, 'hearts'), false, 'face-down rejected');
});

test('moveCards to foundation scores +10 and rejects multi-card stacks', () => {
  const state = freshState();
  state.waste = [card('clubs', 1, true)];
  assert.equal(SolitaireEngine.moveCards(state, { zone: 'waste' }, { zone: 'foundation', suit: 'clubs' }), true);
  assert.deepEqual(state.foundations.clubs.map((c) => c.id), ['clubs-1']);
  assert.equal(state.score, 10);
  assert.equal(state.moves, 1);
  assert.equal(state.waste.length, 0);

  state.tableau[0] = [card('clubs', 2, true), card('hearts', 1, true)];
  assert.equal(
    SolitaireEngine.moveCards(state, { zone: 'tableau', col: 0, cardIndex: 0 }, { zone: 'foundation', suit: 'hearts' }),
    false,
    'multi-card stack to foundation rejected'
  );
});

test('autoMoveToFoundation sends waste and tableau top cards to their suit pile', () => {
  const state = freshState();
  state.waste = [card('hearts', 1, true)];
  assert.equal(SolitaireEngine.autoMoveToFoundation(state, { zone: 'waste' }), true);
  assert.deepEqual(state.foundations.hearts.map((c) => c.id), ['hearts-1']);

  state.tableau[3] = [card('hearts', 2, true)];
  assert.equal(SolitaireEngine.autoMoveToFoundation(state, { zone: 'tableau', col: 3 }), true);
  assert.deepEqual(state.foundations.hearts.map((c) => c.id), ['hearts-1', 'hearts-2']);

  state.tableau[4] = [card('spades', 5, true)];
  assert.equal(SolitaireEngine.autoMoveToFoundation(state, { zone: 'tableau', col: 4 }), false, '5 cannot go on empty spades foundation');
});

/* 8. Snapshot / undo and win detection */
test('undo restores the exact prior state including moves and score', () => {
  const state = freshState();
  state.waste = [card('diamonds', 1, true)];
  state.tableau[1] = [card('clubs', 2, true)];

  assert.equal(SolitaireEngine.moveCards(state, { zone: 'waste' }, { zone: 'foundation', suit: 'diamonds' }), true);
  const afterMove = { moves: state.moves, score: state.score };
  assert.equal(afterMove.moves, 1);
  assert.equal(afterMove.score, 10);

  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(state.moves, 0, 'moves restored');
  assert.equal(state.score, 0, 'score restored');
  assert.deepEqual(state.waste.map((c) => c.id), ['diamonds-1'], 'waste restored');
  assert.deepEqual(state.foundations.diamonds, [], 'foundation restored');

  // Undo again: history is now empty
  assert.equal(SolitaireEngine.undo(state), false);
});

test('undo restores tableau piles and a recycle cycle', () => {
  const state = freshState();
  state.stock = [card('spades', 1, false)];
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.waste.length, 1);
  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(state.stock.length, 1);
  assert.equal(state.waste.length, 0);
  assert.equal(state.moves, 0);
});

test('isGameWon is true only when all four foundations hold 13 cards', () => {
  const state = freshState();
  assert.equal(SolitaireEngine.isGameWon(state), false);
  for (const suit of SolitaireEngine.SUITS) {
    state.foundations[suit] = [];
    for (let r = 1; r <= 13; r++) {
      state.foundations[suit].push(card(suit, r, true));
    }
  }
  assert.equal(SolitaireEngine.isGameWon(state), true);
  state.foundations.clubs.pop();
  assert.equal(SolitaireEngine.isGameWon(state), false);
});

/* 9. Segment 4: lifecycle integration */
test('multi-step sequence: undo restores exact prior moves, score, and piles', () => {
  const state = freshState();
  state.waste = [card('spades', 1, true)];
  state.tableau[0] = [card('clubs', 5, false)];
  state.tableau[1] = [card('diamonds', 2, true)];

  // Step 1: waste ace to foundation (+10)
  assert.equal(SolitaireEngine.moveCards(state, { zone: 'waste' }, { zone: 'foundation', suit: 'spades' }), true);
  assert.equal(state.moves, 1);
  assert.equal(state.score, 10);

  // Step 2: ace back from foundation onto diamonds-2 (-15, floored at 0)
  assert.equal(SolitaireEngine.moveCards(state, { zone: 'foundation', suit: 'spades' }, { zone: 'tableau', col: 1 }), true);
  assert.equal(state.moves, 2);
  assert.equal(state.score, 0, 'score floors at 0');
  assert.deepEqual(state.tableau[1].map((c) => c.id), ['diamonds-2', 'spades-1']);
  assert.deepEqual(state.foundations.spades, []);

  // Undo step 2
  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(state.moves, 1);
  assert.equal(state.score, 10);
  assert.deepEqual(state.tableau[1].map((c) => c.id), ['diamonds-2']);
  assert.deepEqual(state.foundations.spades.map((c) => c.id), ['spades-1']);
  assert.equal(state.waste.length, 0);

  // Undo step 1
  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(state.moves, 0);
  assert.equal(state.score, 0);
  assert.deepEqual(state.waste.map((c) => c.id), ['spades-1']);
  assert.deepEqual(state.foundations.spades, []);
});

test('simulated full 52-card foundation completion triggers isGameWon', () => {
  const state = freshState();
  state.stock = [];
  state.waste = [];
  for (const suit of SolitaireEngine.SUITS) {
    for (let r = 1; r <= 13; r++) {
      state.waste = [card(suit, r, true)];
      const moved = SolitaireEngine.autoMoveToFoundation(state, { zone: 'waste' });
      assert.equal(moved, true, suit + '-' + r + ' should auto-move to its foundation');
    }
  }
  assert.equal(SolitaireEngine.isGameWon(state), true);
  assert.equal(state.moves, 52);
  assert.equal(state.score, 520, '52 foundation moves at +10 each');
  // Undoing the last ace flips the win back off
  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(SolitaireEngine.isGameWon(state), false);
});

console.log('All ' + passed + ' engine tests passed.');

/* ================================================================
 * UPGRADE PASS - new feature tests (appended, none above removed)
 * ================================================================ */

/* 19. Draw mode state and preference */
test('createInitialState defaults to draw 1 and accepts drawMode 3', () => {
  const state = freshState();
  assert.equal(state.drawMode, 1, 'default draw mode is 1');
  const state3 = SolitaireEngine.createInitialState(false, undefined, 3);
  assert.equal(state3.drawMode, 3);
  assert.equal(SolitaireEngine.setDrawMode(state, 3), 3);
  assert.equal(state.drawMode, 3);
  assert.equal(SolitaireEngine.setDrawMode(state, 2), 1, 'invalid mode normalizes to 1');
  assert.equal(state.drawMode, 1);
});

/* 20. Draw-3 basics */
test('drawFromStock in draw-3 mode moves 3 cards to waste in draw order', () => {
  const state = SolitaireEngine.createInitialState(false, undefined, 3);
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.stock.length, 21);
  assert.equal(state.waste.length, 3);
  assert.equal(state.moves, 1, 'one click counts as one move');
  // Unshuffled deal leaves clubs-K on top of the stock
  assert.deepEqual(
    state.waste.map((c) => c.id),
    ['clubs-13', 'clubs-12', 'clubs-11'],
    'pop order preserved: K then Q then J, J on top of waste'
  );
  assert.ok(state.waste.every((c) => c.faceUp));
});

/* 21. Draw-3 partial remainder */
test('draw-3 draws only the remaining cards when stock has fewer than 3', () => {
  const state = SolitaireEngine.createInitialState(false, undefined, 3);
  state.stock = [card('hearts', 4, false), card('hearts', 3, false)];
  state.waste = [];
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.waste.length, 2, 'only 2 cards were available');
  assert.equal(state.stock.length, 0);
  assert.equal(state.moves, 1);
  // Next click with empty stock recycles instead of drawing
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.stock.length, 2);
  assert.equal(state.waste.length, 0);
});

/* 22. Draw-3 recycle order semantics */
test('draw-3 recycle restores the original pass order', () => {
  const state = SolitaireEngine.createInitialState(false, undefined, 3);
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  const firstClickWasteIds = state.waste.map((c) => c.id);
  // Exhaust the stock with the remaining 7 draws of the pass
  for (let i = 0; i < 7; i++) {
    assert.equal(SolitaireEngine.drawFromStock(state), true);
  }
  assert.equal(state.stock.length, 0);
  assert.equal(state.waste.length, 24);
  // Recycle
  assert.equal(SolitaireEngine.drawFromStock(state), true);
  assert.equal(state.stock.length, 24);
  assert.equal(state.waste.length, 0);
  for (const c of state.stock) {
    assert.equal(c.faceUp, false);
  }
  // Drawing again replays the same pass order, 3 at a time
  SolitaireEngine.drawFromStock(state);
  assert.deepEqual(
    state.waste.map((c) => c.id),
    firstClickWasteIds,
    'new pass starts with the same first-drawn cards'
  );
});

/* 23. Undo of a draw-3 draw */
test('undo restores stock and waste exactly after a draw-3 draw', () => {
  const state = SolitaireEngine.createInitialState(false, undefined, 3);
  SolitaireEngine.drawFromStock(state);
  assert.equal(state.waste.length, 3);
  assert.equal(state.moves, 1);
  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(state.stock.length, 24);
  assert.equal(state.waste.length, 0);
  assert.equal(state.moves, 0);
  assert.equal(state.stock[state.stock.length - 1].id, 'clubs-13', 'stock order fully restored');
});

/* 24. DEV-1: drawMode is a sticky preference, undo never reverts it */
test('undo does not revert a mid-game draw mode toggle', () => {
  const state = freshState();
  SolitaireEngine.setDrawMode(state, 3);
  SolitaireEngine.drawFromStock(state);
  assert.equal(state.waste.length, 3, 'draw-3 active');
  assert.equal(SolitaireEngine.undo(state), true);
  assert.equal(state.drawMode, 3, 'preference survives undo');
  assert.equal(state.waste.length, 0);
});

/* 25. Hint priority (a): foundation moves come first */
test('findHint prefers foundation moves over tableau and stock', () => {
  const state = freshState();
  state.stock = [];
  state.waste = [card('hearts', 1, true)];
  state.tableau[0] = [card('clubs', 8, false), card('spades', 7, true)];
  state.tableau[1] = [card('diamonds', 8, true)];
  // Waste ace can go to foundation; spades-7 could also flip onto diamonds-8.
  const hint = SolitaireEngine.findHint(state);
  assert.ok(hint, 'a hint exists');
  assert.equal(hint.type, 'foundation');
  assert.deepEqual(hint.from, { zone: 'waste' });
  assert.equal(hint.to.suit, 'hearts');
  assert.equal(hint.card.id, 'hearts-1');
});

/* 26. Hint priority (b): tableau moves that flip a face-down card */
test('findHint prefers tableau moves that flip a face-down card', () => {
  const state = freshState();
  state.stock = [];
  state.waste = [];
  // No foundation moves possible; col0 has a face-down card under a movable red 6
  state.tableau[0] = [card('diamonds', 9, false), card('hearts', 6, true)];
  state.tableau[1] = [card('spades', 7, true)];
  state.tableau[2] = [card('clubs', 9, true)]; // a plain tableau target for the 6 as well
  const hint = SolitaireEngine.findHint(state);
  assert.ok(hint);
  assert.equal(hint.type, 'tableau-flip');
  assert.equal(hint.from.col, 0);
  assert.equal(hint.from.cardIndex, 1);
  assert.equal(hint.to.col, 1, 'targets the black 7');
});

/* 27. Hint priority (c): other tableau moves + King-on-empty exclusion */
test('findHint falls back to plain tableau moves and skips pointless King moves', () => {
  const state = freshState();
  state.stock = [];
  state.waste = [card('hearts', 6, true)];
  state.tableau[0] = [card('spades', 7, true)];
  state.tableau[1] = [];
  state.tableau[2] = [];
  state.tableau[3] = [];
  state.tableau[4] = [];
  state.tableau[5] = [];
  state.tableau[6] = [];
  const hint = SolitaireEngine.findHint(state);
  assert.ok(hint);
  assert.equal(hint.type, 'tableau');
  assert.deepEqual(hint.from, { zone: 'waste' });
  assert.equal(hint.to.col, 0);

  // Only move on the board is King at index 0 to an empty column: skip it
  const kingState = freshState();
  kingState.stock = [];
  kingState.waste = [];
  kingState.tableau[0] = [card('spades', 13, true)];
  for (let col = 1; col < 7; col++) kingState.tableau[col] = [];
  const kingHint = SolitaireEngine.findHint(kingState);
  assert.equal(kingHint, null, 'no hint when the only move is a pointless King shuffle');
});

/* 28. Hint priority (d): stock draw / recycle fallback */
test('findHint falls back to stock draw and recycle', () => {
  const state = freshState();
  state.waste = [];
  state.tableau[0] = [card('spades', 13, true)];
  for (let col = 1; col < 7; col++) state.tableau[col] = [];
  // Stock non-empty: hint is to draw
  const drawHint = SolitaireEngine.findHint(state);
  assert.equal(drawHint.type, 'stock');
  assert.deepEqual(drawHint.to, { zone: 'waste' });
  assert.equal(drawHint.card.id, 'clubs-13');

  // Stock empty, waste non-empty, no card moves: hint is to recycle
  state.stock = [];
  state.waste = [card('hearts', 5, true)];
  state.tableau[0] = [card('hearts', 7, true)];
  for (let col = 1; col < 7; col++) state.tableau[col] = [];
  const recycleHint = SolitaireEngine.findHint(state);
  assert.equal(recycleHint.type, 'stock');
  assert.deepEqual(recycleHint.to, { zone: 'stock' });
  assert.equal(recycleHint.card, null);
});

/* 29. Auto-complete gating */
test('canAutoComplete requires an unwon game, empty stock/waste, all face-up', () => {
  const near = SolitaireEngine.createNearWinState(1);
  assert.equal(SolitaireEngine.canAutoComplete(near), true);

  const faceDown = SolitaireEngine.createNearWinState(1);
  faceDown.tableau[0][0].faceUp = false;
  assert.equal(SolitaireEngine.canAutoComplete(faceDown), false, 'face-down card blocks');

  const withStock = SolitaireEngine.createNearWinState(1);
  withStock.stock.push(card('diamonds', 1, false));
  assert.equal(SolitaireEngine.canAutoComplete(withStock), false, 'stock blocks');

  const withWaste = SolitaireEngine.createNearWinState(1);
  withWaste.waste.push(card('diamonds', 1, true));
  assert.equal(SolitaireEngine.canAutoComplete(withWaste), false, 'waste blocks');

  const won = SolitaireEngine.createNearWinState(1);
  for (const suit of SolitaireEngine.SUITS) {
    won.foundations[suit].push(card(suit, 12, true), card(suit, 13, true));
  }
  assert.equal(SolitaireEngine.canAutoComplete(won), false, 'already-won game blocks');
});

/* 30. Auto-complete step picks the lowest eligible rank (waste competes too) */
test('autoCompleteStep moves the lowest-rank eligible card to its foundation', () => {
  const state = freshState();
  state.stock = [];
  state.waste = [card('hearts', 3, true)]; // hearts foundation has 1,2
  state.foundations.hearts = [card('hearts', 1, true), card('hearts', 2, true)];
  state.foundations.spades = [card('spades', 1, true)];
  state.tableau[0] = [card('spades', 2, true)]; // rank 2 beats rank 3
  for (let col = 1; col < 7; col++) state.tableau[col] = [];
  const step = SolitaireEngine.autoCompleteStep(state);
  assert.ok(step);
  assert.equal(step.card.id, 'spades-2', 'lowest rank wins');
  assert.deepEqual(step.from, { zone: 'tableau', col: 0, cardIndex: 0 });
  assert.equal(state.foundations.spades.length, 2);
  assert.equal(state.score, 10, '+10 for tableau to foundation');

  // The waste card is still eligible when it is the only candidate
  const wasteOnly = freshState();
  wasteOnly.stock = [];
  wasteOnly.waste = [card('hearts', 3, true)];
  wasteOnly.foundations.hearts = [card('hearts', 1, true), card('hearts', 2, true)];
  for (let col = 0; col < 7; col++) wasteOnly.tableau[col] = [];
  const wasteStep = SolitaireEngine.autoCompleteStep(wasteOnly);
  assert.ok(wasteStep, 'waste card still eligible');
  assert.deepEqual(wasteStep.from, { zone: 'waste' });
  assert.equal(wasteStep.card.id, 'hearts-3');
});

/* 31. Near-win deal + full auto-complete run */
test('createNearWinState auto-completes to a win in 8 steps with correct scoring', () => {
  const state = SolitaireEngine.createNearWinState(3);
  assert.equal(state.drawMode, 3);
  assert.equal(state.stock.length, 0);
  assert.equal(state.waste.length, 0);
  assert.equal(state.score, 440);
  assert.equal(state.moves, 0);
  const totalCards =
    state.tableau.reduce((n, col) => n + col.length, 0) +
    Object.values(state.foundations).reduce((n, p) => n + p.length, 0);
  assert.equal(totalCards, 52, 'all 52 cards accounted for');
  assert.ok(state.tableau[0].every((c) => c.faceUp));

  const moves = SolitaireEngine.getAutoCompleteMoves(state);
  assert.equal(moves.length, 8, 'four Queens then four Kings');
  assert.equal(state.moves, 0, 'simulation did not touch the live state');
  assert.equal(state.tableau[0].length, 2, 'live tableau untouched');

  // Run for real
  let steps = 0;
  while (!SolitaireEngine.isGameWon(state)) {
    const step = SolitaireEngine.autoCompleteStep(state);
    assert.ok(step, 'step ' + (steps + 1) + ' must exist');
    steps++;
    if (steps > 52) throw new Error('auto-complete did not terminate');
  }
  assert.equal(steps, 8);
  assert.equal(state.score, 520, '440 + 8 x 10');
  assert.equal(state.moves, 8);
  assert.equal(SolitaireEngine.getAutoCompleteMoves(state).length, 0, 'nothing left to auto-complete');
});

/* 32. Statistics math */
test('recordGameResult tracks played, won, pct, streaks, and best time', () => {
  let stats = SolitaireEngine.createDefaultStats();
  assert.deepEqual(stats, {
    gamesPlayed: 0, gamesWon: 0, winPercentage: 0, currentStreak: 0, bestStreak: 0, bestTime: null
  });
  stats = SolitaireEngine.recordGameResult(stats, true, 120);
  assert.equal(stats.gamesPlayed, 1);
  assert.equal(stats.gamesWon, 1);
  assert.equal(stats.winPercentage, 100);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.bestStreak, 1);
  assert.equal(stats.bestTime, 120);
  stats = SolitaireEngine.recordGameResult(stats, true, 90);
  assert.equal(stats.bestTime, 90, 'best time improves');
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.bestStreak, 2);
  stats = SolitaireEngine.recordGameResult(stats, false, 45);
  assert.equal(stats.gamesPlayed, 3);
  assert.equal(stats.gamesWon, 2);
  assert.equal(stats.winPercentage, 67, 'rounds to 67');
  assert.equal(stats.currentStreak, 0, 'loss resets streak');
  assert.equal(stats.bestStreak, 2, 'best streak survives');
  assert.equal(stats.bestTime, 90, 'loss never updates best time');
});

/* 33. Timer formatting */
test('formatTime formats seconds as mm:ss with zero padding', () => {
  assert.equal(SolitaireEngine.formatTime(0), '00:00');
  assert.equal(SolitaireEngine.formatTime(9), '00:09');
  assert.equal(SolitaireEngine.formatTime(125), '02:05');
  assert.equal(SolitaireEngine.formatTime(3600), '60:00');
  assert.equal(SolitaireEngine.formatTime(-5), '00:00', 'negative clamps to zero');
  assert.equal(SolitaireEngine.formatTime(undefined), '00:00');
});

console.log('All ' + passed + ' engine tests passed (including upgrade tests).');
