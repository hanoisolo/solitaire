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
