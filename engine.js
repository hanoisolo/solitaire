/*
 * Klondike Solitaire - pure game state and rules engine.
 * No DOM dependencies: runs under Node.js and in the browser.
 */
(function (global) {
  'use strict';

  const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
  const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

  function getCardColor(suit) {
    return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
  }

  function createCard(suit, rank) {
    return {
      id: suit + '-' + rank,
      suit: suit,
      rank: rank,
      color: getCardColor(suit),
      faceUp: false
    };
  }

  function createDeck() {
    const deck = [];
    for (let s = 0; s < SUITS.length; s++) {
      for (let r = 0; r < RANKS.length; r++) {
        deck.push(createCard(SUITS[s], RANKS[r]));
      }
    }
    return deck;
  }

  function shuffleDeck(deck, rngFn) {
    rngFn = rngFn || Math.random;
    const copy = deck.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rngFn() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function createInitialState(shouldShuffle, rngFn, drawMode) {
    const deck =
      shouldShuffle === false ? createDeck() : shuffleDeck(createDeck(), rngFn);
    const state = {
      stock: [],
      waste: [],
      foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
      tableau: [[], [], [], [], [], [], []],
      moves: 0,
      score: 0,
      history: [],
      drawMode: drawMode === 3 ? 3 : 1
    };
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      for (let n = 0; n <= col; n++) {
        const card = deck[idx++];
        card.faceUp = n === col;
        state.tableau[col].push(card);
      }
    }
    while (idx < deck.length) {
      state.stock.push(deck[idx++]);
    }
    return state;
  }

  function serializeForSnapshot(state) {
    return JSON.stringify({
      stock: state.stock,
      waste: state.waste,
      foundations: state.foundations,
      tableau: state.tableau,
      moves: state.moves,
      score: state.score
    });
  }

  function cloneStateSnapshot(state) {
    return JSON.parse(serializeForSnapshot(state));
  }

  function pushSnapshot(state) {
    state.history.push(serializeForSnapshot(state));
  }

  function undo(state) {
    if (state.history.length === 0) {
      return false;
    }
    const snap = JSON.parse(state.history.pop());
    state.stock = snap.stock;
    state.waste = snap.waste;
    state.foundations = snap.foundations;
    state.tableau = snap.tableau;
    state.moves = snap.moves;
    state.score = snap.score;
    return true;
  }

  function setDrawMode(state, mode) {
    state.drawMode = mode === 3 ? 3 : 1;
    return state.drawMode;
  }

  function drawFromStock(state, countOverride) {
    const count =
      countOverride !== undefined ? countOverride : state.drawMode || 1;
    if (state.stock.length > 0) {
      pushSnapshot(state);
      const n = Math.min(count, state.stock.length);
      for (let i = 0; i < n; i++) {
        const card = state.stock.pop();
        card.faceUp = true;
        state.waste.push(card);
      }
      state.moves += 1;
      return true;
    }
    if (state.waste.length > 0) {
      pushSnapshot(state);
      while (state.waste.length > 0) {
        const card = state.waste.pop();
        card.faceUp = false;
        state.stock.push(card);
      }
      state.moves += 1;
      return true;
    }
    return false;
  }

  function canMoveToFoundation(card, foundationPile, suit) {
    if (!card || card.suit !== suit || !card.faceUp) {
      return false;
    }
    if (foundationPile.length === 0) {
      return card.rank === 1;
    }
    const top = foundationPile[foundationPile.length - 1];
    return card.rank === top.rank + 1;
  }

  function canMoveToTableau(movingCards, targetColumn) {
    if (!movingCards || movingCards.length === 0) {
      return false;
    }
    for (let i = 0; i < movingCards.length; i++) {
      if (!movingCards[i].faceUp) {
        return false;
      }
    }
    const first = movingCards[0];
    if (targetColumn.length === 0) {
      return first.rank === 13;
    }
    const top = targetColumn[targetColumn.length - 1];
    if (!top.faceUp) {
      return false;
    }
    return first.color !== top.color && first.rank === top.rank - 1;
  }

  function extractCards(state, from) {
    if (from.zone === 'waste') {
      return state.waste.length > 0
        ? [state.waste[state.waste.length - 1]]
        : null;
    }
    if (from.zone === 'foundation') {
      const pile = state.foundations[from.suit];
      return pile && pile.length > 0 ? [pile[pile.length - 1]] : null;
    }
    if (from.zone === 'tableau') {
      const col = state.tableau[from.col];
      if (!col || from.cardIndex < 0 || from.cardIndex >= col.length) {
        return null;
      }
      return col.slice(from.cardIndex);
    }
    return null;
  }

  function removeCards(state, from) {
    if (from.zone === 'waste') {
      state.waste.pop();
    } else if (from.zone === 'foundation') {
      state.foundations[from.suit].pop();
    } else if (from.zone === 'tableau') {
      state.tableau[from.col].length = from.cardIndex;
    }
  }

  function moveCards(state, from, to) {
    const moving = extractCards(state, from);
    if (!moving) {
      return false;
    }
    let legal = false;
    if (to.zone === 'tableau') {
      legal = canMoveToTableau(moving, state.tableau[to.col]);
    } else if (to.zone === 'foundation') {
      legal =
        moving.length === 1 &&
        canMoveToFoundation(moving[0], state.foundations[to.suit], to.suit);
    }
    if (!legal) {
      return false;
    }
    pushSnapshot(state);
    removeCards(state, from);
    if (to.zone === 'tableau') {
      const target = state.tableau[to.col];
      for (let i = 0; i < moving.length; i++) {
        target.push(moving[i]);
      }
      if (from.zone === 'waste') {
        state.score += 5;
      } else if (from.zone === 'foundation') {
        state.score = Math.max(0, state.score - 15);
      }
    } else {
      state.foundations[to.suit].push(moving[0]);
      state.score += 10;
    }
    if (from.zone === 'tableau') {
      const src = state.tableau[from.col];
      if (src.length > 0 && !src[src.length - 1].faceUp) {
        src[src.length - 1].faceUp = true;
        state.score += 5;
      }
    }
    state.moves += 1;
    return true;
  }

  function autoMoveToFoundation(state, from) {
    if (from.zone === 'waste') {
      if (state.waste.length === 0) {
        return false;
      }
      const suit = state.waste[state.waste.length - 1].suit;
      return moveCards(state, { zone: 'waste' }, { zone: 'foundation', suit: suit });
    }
    if (from.zone === 'tableau') {
      const col = state.tableau[from.col];
      if (!col || col.length === 0) {
        return false;
      }
      const suit = col[col.length - 1].suit;
      return moveCards(
        state,
        { zone: 'tableau', col: from.col, cardIndex: col.length - 1 },
        { zone: 'foundation', suit: suit }
      );
    }
    return false;
  }

  function isGameWon(state) {
    for (let s = 0; s < SUITS.length; s++) {
      if (state.foundations[SUITS[s]].length !== 13) {
        return false;
      }
    }
    return true;
  }

  /* ---------- Hint selection (read-only) ---------- */

  function firstFaceUpIndex(col) {
    for (let i = 0; i < col.length; i++) {
      if (col[i].faceUp) {
        return i;
      }
    }
    return -1;
  }

  function findHint(state) {
    if (isGameWon(state)) {
      return null;
    }
    // (a) any move to foundation: waste top first, then tableau tops
    if (state.waste.length > 0) {
      const top = state.waste[state.waste.length - 1];
      if (canMoveToFoundation(top, state.foundations[top.suit], top.suit)) {
        return {
          type: 'foundation',
          from: { zone: 'waste' },
          to: { zone: 'foundation', suit: top.suit },
          card: top
        };
      }
    }
    for (let col = 0; col < 7; col++) {
      const pile = state.tableau[col];
      if (pile.length === 0) {
        continue;
      }
      const top = pile[pile.length - 1];
      if (canMoveToFoundation(top, state.foundations[top.suit], top.suit)) {
        return {
          type: 'foundation',
          from: { zone: 'tableau', col: col, cardIndex: pile.length - 1 },
          to: { zone: 'foundation', suit: top.suit },
          card: top
        };
      }
    }
    // (b) tableau move that flips a face-down card
    for (let fromCol = 0; fromCol < 7; fromCol++) {
      const from = state.tableau[fromCol];
      const idx = firstFaceUpIndex(from);
      if (idx <= 0) {
        continue; // nothing face-down would be flipped
      }
      const moving = from.slice(idx);
      for (let toCol = 0; toCol < 7; toCol++) {
        if (toCol === fromCol) {
          continue;
        }
        if (canMoveToTableau(moving, state.tableau[toCol])) {
          return {
            type: 'tableau-flip',
            from: { zone: 'tableau', col: fromCol, cardIndex: idx },
            to: { zone: 'tableau', col: toCol },
            card: moving[0]
          };
        }
      }
    }
    // (c) other productive tableau moves
    // (c1) waste top onto a tableau column
    if (state.waste.length > 0) {
      const top = state.waste[state.waste.length - 1];
      for (let toCol = 0; toCol < 7; toCol++) {
        if (canMoveToTableau([top], state.tableau[toCol])) {
          return {
            type: 'tableau',
            from: { zone: 'waste' },
            to: { zone: 'tableau', col: toCol },
            card: top
          };
        }
      }
    }
    for (let fromCol = 0; fromCol < 7; fromCol++) {
      const from = state.tableau[fromCol];
      const idx = firstFaceUpIndex(from);
      if (idx < 0) {
        continue;
      }
      // (c2) full face-up column move, except a King at index 0 to an empty column
      if (idx === 0) {
        const moving = from.slice(0);
        for (let toCol = 0; toCol < 7; toCol++) {
          if (toCol === fromCol) {
            continue;
          }
          if (state.tableau[toCol].length === 0 && moving[0].rank === 13) {
            continue; // pointless King shuffle between empty columns
          }
          if (canMoveToTableau(moving, state.tableau[toCol])) {
            return {
              type: 'tableau',
              from: { zone: 'tableau', col: fromCol, cardIndex: 0 },
              to: { zone: 'tableau', col: toCol },
              card: moving[0]
            };
          }
        }
      }
      // (c3) sub-stack split, only when it exposes a foundation-ready card
      for (let cardIndex = idx + 1; cardIndex < from.length; cardIndex++) {
        const exposed = from[cardIndex - 1];
        if (!canMoveToFoundation(exposed, state.foundations[exposed.suit], exposed.suit)) {
          continue;
        }
        const moving = from.slice(cardIndex);
        for (let toCol = 0; toCol < 7; toCol++) {
          if (toCol === fromCol) {
            continue;
          }
          if (canMoveToTableau(moving, state.tableau[toCol])) {
            return {
              type: 'tableau',
              from: { zone: 'tableau', col: fromCol, cardIndex: cardIndex },
              to: { zone: 'tableau', col: toCol },
              card: moving[0]
            };
          }
        }
      }
    }
    // (d) stock draw or recycle
    if (state.stock.length > 0) {
      return {
        type: 'stock',
        from: { zone: 'stock' },
        to: { zone: 'waste' },
        card: state.stock[state.stock.length - 1]
      };
    }
    if (state.waste.length > 0) {
      return { type: 'stock', from: { zone: 'stock' }, to: { zone: 'stock' }, card: null };
    }
    return null;
  }

  /* ---------- Auto-complete ---------- */

  function canAutoComplete(state) {
    if (isGameWon(state)) {
      return false;
    }
    if (state.stock.length > 0 || state.waste.length > 0) {
      return false;
    }
    for (let col = 0; col < 7; col++) {
      const pile = state.tableau[col];
      for (let i = 0; i < pile.length; i++) {
        if (!pile[i].faceUp) {
          return false;
        }
      }
    }
    return true;
  }

  function autoCompleteStep(state) {
    let best = null;
    if (state.waste.length > 0) {
      const top = state.waste[state.waste.length - 1];
      if (canMoveToFoundation(top, state.foundations[top.suit], top.suit)) {
        best = { rank: top.rank, card: top, from: { zone: 'waste' }, to: { zone: 'foundation', suit: top.suit } };
      }
    }
    for (let col = 0; col < 7; col++) {
      const pile = state.tableau[col];
      if (pile.length === 0) {
        continue;
      }
      const top = pile[pile.length - 1];
      if (!canMoveToFoundation(top, state.foundations[top.suit], top.suit)) {
        continue;
      }
      if (best === null || top.rank < best.rank) {
        best = {
          rank: top.rank,
          card: top,
          from: { zone: 'tableau', col: col, cardIndex: pile.length - 1 },
          to: { zone: 'foundation', suit: top.suit }
        };
      }
    }
    if (best === null) {
      return null;
    }
    const moved = moveCards(state, best.from, best.to);
    if (!moved) {
      return null;
    }
    return { from: best.from, to: best.to, card: best.card };
  }

  function getAutoCompleteMoves(state) {
    const sim = cloneStateSnapshot(state);
    sim.history = [];
    sim.drawMode = state.drawMode || 1;
    const moves = [];
    for (let i = 0; i < 52; i++) {
      const step = autoCompleteStep(sim);
      if (!step) {
        break;
      }
      moves.push(step);
    }
    return moves;
  }

  /* ---------- Deterministic near-win test deal ---------- */

  function createNearWinState(drawMode) {
    const state = {
      stock: [],
      waste: [],
      foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
      tableau: [[], [], [], [], [], [], []],
      moves: 0,
      score: 440,
      history: [],
      drawMode: drawMode === 3 ? 3 : 1
    };
    // Foundations hold ranks 1..11 (A..J) of every suit
    for (let s = 0; s < SUITS.length; s++) {
      for (let r = 1; r <= 11; r++) {
        state.foundations[SUITS[s]].push(createCard(SUITS[s], r));
        state.foundations[SUITS[s]][r - 1].faceUp = true;
      }
    }
    // Remaining 8 cards: the four Kings and Queens in alternating-color stacks
    const stacks = [
      ['spades', 'hearts'],
      ['hearts', 'clubs'],
      ['diamonds', 'spades'],
      ['clubs', 'diamonds']
    ];
    for (let col = 0; col < stacks.length; col++) {
      const king = createCard(stacks[col][0], 13);
      const queen = createCard(stacks[col][1], 12);
      king.faceUp = true;
      queen.faceUp = true;
      state.tableau[col].push(king, queen);
    }
    return state;
  }

  /* ---------- Statistics helpers (pure) ---------- */

  function createDefaultStats() {
    return {
      gamesPlayed: 0,
      gamesWon: 0,
      winPercentage: 0,
      currentStreak: 0,
      bestStreak: 0,
      bestTime: null
    };
  }

  function recordGameResult(stats, won, elapsedSeconds) {
    const updated = {
      gamesPlayed: stats.gamesPlayed + 1,
      gamesWon: stats.gamesWon + (won ? 1 : 0),
      winPercentage: 0,
      currentStreak: won ? (stats.currentStreak || 0) + 1 : 0,
      bestStreak: stats.bestStreak || 0,
      bestTime: stats.bestTime === undefined ? null : stats.bestTime
    };
    updated.winPercentage = Math.round((updated.gamesWon / updated.gamesPlayed) * 100);
    if (updated.currentStreak > updated.bestStreak) {
      updated.bestStreak = updated.currentStreak;
    }
    if (won && typeof elapsedSeconds === 'number' && elapsedSeconds >= 0) {
      if (updated.bestTime === null || elapsedSeconds < updated.bestTime) {
        updated.bestTime = elapsedSeconds;
      }
    }
    return updated;
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return (
      String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
    );
  }

  const SolitaireEngine = {
    SUITS: SUITS,
    RANKS: RANKS,
    getCardColor: getCardColor,
    createDeck: createDeck,
    shuffleDeck: shuffleDeck,
    createInitialState: createInitialState,
    cloneStateSnapshot: cloneStateSnapshot,
    pushSnapshot: pushSnapshot,
    undo: undo,
    setDrawMode: setDrawMode,
    drawFromStock: drawFromStock,
    canMoveToFoundation: canMoveToFoundation,
    canMoveToTableau: canMoveToTableau,
    moveCards: moveCards,
    autoMoveToFoundation: autoMoveToFoundation,
    isGameWon: isGameWon,
    findHint: findHint,
    canAutoComplete: canAutoComplete,
    autoCompleteStep: autoCompleteStep,
    getAutoCompleteMoves: getAutoCompleteMoves,
    createNearWinState: createNearWinState,
    createDefaultStats: createDefaultStats,
    recordGameResult: recordGameResult,
    formatTime: formatTime
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolitaireEngine;
  } else if (typeof global !== 'undefined') {
    global.SolitaireEngine = SolitaireEngine;
  }
})(typeof window !== 'undefined' ? window : this);
