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

  function createInitialState(shouldShuffle, rngFn) {
    const deck =
      shouldShuffle === false ? createDeck() : shuffleDeck(createDeck(), rngFn);
    const state = {
      stock: [],
      waste: [],
      foundations: { spades: [], hearts: [], diamonds: [], clubs: [] },
      tableau: [[], [], [], [], [], [], []],
      moves: 0,
      score: 0,
      history: []
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

  function drawFromStock(state) {
    if (state.stock.length > 0) {
      pushSnapshot(state);
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
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
    drawFromStock: drawFromStock,
    canMoveToFoundation: canMoveToFoundation,
    canMoveToTableau: canMoveToTableau,
    moveCards: moveCards,
    autoMoveToFoundation: autoMoveToFoundation,
    isGameWon: isGameWon
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolitaireEngine;
  } else if (typeof global !== 'undefined') {
    global.SolitaireEngine = SolitaireEngine;
  }
})(typeof window !== 'undefined' ? window : this);
