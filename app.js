/* Klondike Solitaire - DOM renderer and interactive gameplay controller.
 * Segment 3: click-to-move, drag-and-drop stacks, stock drawing,
 * auto-flip via engine, double-click auto-move to foundation.
 */
(function () {
  'use strict';

  const SolitaireEngine = window.SolitaireEngine;

  let gameState = null;
  let selectedSource = null; // { zone:'waste' } | { zone:'foundation', suit } | { zone:'tableau', col, cardIndex }
  let draggedSource = null;

  const els = {
    stock: document.getElementById('stock-pile'),
    waste: document.getElementById('waste-pile'),
    tableau: Array.prototype.slice.call(document.querySelectorAll('.tableau-col')),
    foundations: {},
    moveCounter: document.getElementById('move-counter'),
    scoreCounter: document.getElementById('score-counter'),
    btnUndo: document.getElementById('btn-undo'),
    btnNewGame: document.getElementById('btn-new-game'),
    winOverlay: document.getElementById('win-overlay'),
    winStats: document.getElementById('win-stats'),
    btnPlayAgain: document.getElementById('btn-play-again')
  };
  Array.prototype.forEach.call(document.querySelectorAll('.foundation-slot'), function (el) {
    els.foundations[el.getAttribute('data-suit')] = el;
  });

  function formatRank(rank) {
    if (rank === 1) return 'A';
    if (rank === 11) return 'J';
    if (rank === 12) return 'Q';
    if (rank === 13) return 'K';
    return String(rank);
  }

  function getSuitSymbol(suit) {
    return { spades: '\u2660', hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663' }[suit];
  }

  function sameSource(a, b) {
    if (!a || !b || a.zone !== b.zone) return false;
    if (a.zone === 'tableau') return a.col === b.col && a.cardIndex === b.cardIndex;
    if (a.zone === 'foundation') return a.suit === b.suit;
    return true;
  }

  function createCardElement(card, sourceInfo) {
    const el = document.createElement('div');
    el.className = 'card ' + (card.faceUp ? 'face-up ' + card.color : 'face-down');
    if (card.faceUp) {
      const label = formatRank(card.rank) + '<br>' + getSuitSymbol(card.suit);
      el.innerHTML =
        '<div class="corner top-left">' + label + '</div>' +
        '<div class="corner bottom-right">' + label + '</div>' +
        '<div class="pip">' + getSuitSymbol(card.suit) + '</div>';
    }
    el.style.setProperty(
      '--card-index',
      String(sourceInfo.zone === 'tableau' ? sourceInfo.cardIndex : 0)
    );

    if (!card.faceUp || sourceInfo.zone === 'stock') {
      return el; // face-down cards are never interactive
    }

    el.draggable = true;

    el.addEventListener('click', function (event) {
      event.stopPropagation();
      handleSourceOrTargetClick(sourceInfo);
    });

    el.addEventListener('dblclick', function (event) {
      event.stopPropagation();
      handleCardDoubleClick(sourceInfo);
    });

    el.addEventListener('dragstart', function (event) {
      draggedSource = sourceInfo;
      if (event.dataTransfer) {
        event.dataTransfer.setData('text/plain', JSON.stringify(sourceInfo));
        event.dataTransfer.effectAllowed = 'move';
      }
      el.classList.add('dragging');
    });

    el.addEventListener('dragend', function () {
      draggedSource = null;
      el.classList.remove('dragging');
      clearDropHighlights();
      render();
    });

    return el;
  }

  function isSelected(sourceInfo) {
    if (!selectedSource || selectedSource.zone !== sourceInfo.zone) {
      return false;
    }
    if (sourceInfo.zone === 'tableau') {
      return (
        selectedSource.zone === 'tableau' &&
        selectedSource.col === sourceInfo.col &&
        sourceInfo.cardIndex >= selectedSource.cardIndex
      );
    }
    if (sourceInfo.zone === 'waste') return true;
    if (sourceInfo.zone === 'foundation') return selectedSource.suit === sourceInfo.suit;
    return false;
  }

  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function render() {
    // Stock: show the top face-down card (or nothing when empty)
    clearChildren(els.stock);
    if (gameState.stock.length > 0) {
      const top = gameState.stock[gameState.stock.length - 1];
      els.stock.appendChild(
        createCardElement(top, { zone: 'stock', cardIndex: 0 })
      );
    }

    // Waste: show only the top card
    clearChildren(els.waste);
    if (gameState.waste.length > 0) {
      const top = gameState.waste[gameState.waste.length - 1];
      const el = createCardElement(top, { zone: 'waste' });
      if (isSelected({ zone: 'waste' })) el.classList.add('selected');
      els.waste.appendChild(el);
    }

    // Foundations: show the top card of each suit pile
    SolitaireEngine.SUITS.forEach(function (suit) {
      const pileEl = els.foundations[suit];
      pileEl.textContent = getSuitSymbol(suit); // restores the suit watermark when the pile is empty
      const pile = gameState.foundations[suit];
      if (pile.length > 0) {
        const top = pile[pile.length - 1];
        const el = createCardElement(top, { zone: 'foundation', suit: suit });
        if (selectedSource && selectedSource.zone === 'foundation' && selectedSource.suit === suit) {
          el.classList.add('selected');
        }
        pileEl.appendChild(el);
      }
    });

    // Tableau: render each column with its cascade
    els.tableau.forEach(function (colEl, col) {
      clearChildren(colEl);
      gameState.tableau[col].forEach(function (card, cardIndex) {
        const sourceInfo = { zone: 'tableau', col: col, cardIndex: cardIndex };
        const el = createCardElement(card, sourceInfo);
        if (selectedSource && isSelected(sourceInfo)) {
          el.classList.add('selected');
        }
        colEl.appendChild(el);
      });
    });

    updateHUD();
    checkWinState();
  }

  function updateHUD() {
    els.moveCounter.textContent = String(gameState.moves);
    els.scoreCounter.textContent = String(gameState.score);
    els.btnUndo.disabled = gameState.history.length === 0;
  }

  function hideWinOverlay() {
    els.winOverlay.classList.add('hidden');
  }

  function checkWinState() {
    if (SolitaireEngine.isGameWon(gameState)) {
      els.winStats.textContent =
        'You finished in ' + gameState.moves + ' moves with a score of ' + gameState.score + '.';
      els.winOverlay.classList.remove('hidden');
    }
  }

  function handleNewGame() {
    gameState = SolitaireEngine.createInitialState(true);
    selectedSource = null;
    draggedSource = null;
    hideWinOverlay();
    render();
  }

  function handleUndo() {
    selectedSource = null;
    draggedSource = null;
    SolitaireEngine.undo(gameState);
    hideWinOverlay();
    render();
  }

  function attemptMove(from, to) {
    SolitaireEngine.moveCards(gameState, from, to);
    selectedSource = null;
    render();
  }

  function targetFromSourceInfo(sourceInfo) {
    if (sourceInfo.zone === 'tableau') {
      return { zone: 'tableau', col: sourceInfo.col };
    }
    if (sourceInfo.zone === 'foundation') {
      return { zone: 'foundation', suit: sourceInfo.suit };
    }
    return null;
  }

  function handleSourceOrTargetClick(sourceInfo) {
    if (selectedSource === null) {
      selectedSource = sourceInfo;
      render();
      return;
    }
    if (sameSource(selectedSource, sourceInfo)) {
      selectedSource = null;
      render();
      return;
    }
    const target = targetFromSourceInfo(sourceInfo);
    if (target) {
      attemptMove(selectedSource, target);
    } else {
      selectedSource = null;
      render();
    }
  }

  function handleStockClick() {
    selectedSource = null;
    SolitaireEngine.drawFromStock(gameState);
    render();
  }

  function handleCardDoubleClick(sourceInfo) {
    selectedSource = null;
    SolitaireEngine.autoMoveToFoundation(gameState, sourceInfo);
    render();
  }

  function clearDropHighlights() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.drop-target'),
      function (el) {
        el.classList.remove('drop-target');
      }
    );
  }

  function bindDropTarget(el, getTarget) {
    el.addEventListener('dragover', function (event) {
      if (draggedSource) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        el.classList.add('drop-target');
      }
    });
    el.addEventListener('dragleave', function () {
      el.classList.remove('drop-target');
    });
    el.addEventListener('drop', function (event) {
      event.preventDefault();
      el.classList.remove('drop-target');
      if (draggedSource) {
        attemptMove(draggedSource, getTarget());
        draggedSource = null;
      }
    });
  }

  function setupDragAndDrop() {
    els.tableau.forEach(function (colEl, col) {
      bindDropTarget(colEl, function () {
        return { zone: 'tableau', col: col };
      });
    });
    SolitaireEngine.SUITS.forEach(function (suit) {
      bindDropTarget(els.foundations[suit], function () {
        return { zone: 'foundation', suit: suit };
      });
    });
  }

  function initGame() {
    gameState = SolitaireEngine.createInitialState(true);
    selectedSource = null;
    draggedSource = null;

    els.stock.addEventListener('click', handleStockClick);
    els.tableau.forEach(function (colEl, col) {
      colEl.addEventListener('click', function () {
        if (selectedSource) {
          attemptMove(selectedSource, { zone: 'tableau', col: col });
        }
      });
    });
    SolitaireEngine.SUITS.forEach(function (suit) {
      els.foundations[suit].addEventListener('click', function () {
        if (selectedSource) {
          attemptMove(selectedSource, { zone: 'foundation', suit: suit });
        }
      });
    });

    setupDragAndDrop();

    els.btnNewGame.addEventListener('click', handleNewGame);
    els.btnPlayAgain.addEventListener('click', handleNewGame);
    els.btnUndo.addEventListener('click', handleUndo);
    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        handleUndo();
      }
    });

    render();
  }

  initGame();
})();
