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
  let timerInterval = null;
  let elapsedSeconds = 0;
  let isAutoCompleting = false;
  let autoCompleteTimer = null;
  let hintTimeout = null;
  let stats = null;
  let gameResultRecorded = true; // no game in progress yet

  const DRAW_MODE_KEY = 'solitaire_draw_mode';
  const STATS_KEY = 'solitaire_stats';

  const els = {
    stock: document.getElementById('stock-pile'),
    waste: document.getElementById('waste-pile'),
    tableau: Array.prototype.slice.call(document.querySelectorAll('.tableau-col')),
    foundations: {},
    moveCounter: document.getElementById('move-counter'),
    scoreCounter: document.getElementById('score-counter'),
    timerDisplay: document.getElementById('timer-display'),
    btnUndo: document.getElementById('btn-undo'),
    btnNewGame: document.getElementById('btn-new-game'),
    btnDrawMode: document.getElementById('btn-draw-mode'),
    btnHint: document.getElementById('btn-hint'),
    btnAutoComplete: document.getElementById('btn-auto-complete'),
    btnNearWin: document.getElementById('btn-near-win'),
    btnStats: document.getElementById('btn-stats'),
    statsModal: document.getElementById('stats-modal'),
    statGamesPlayed: document.getElementById('stat-games-played'),
    statGamesWon: document.getElementById('stat-games-won'),
    statWinPct: document.getElementById('stat-win-pct'),
    statCurrentStreak: document.getElementById('stat-current-streak'),
    statBestStreak: document.getElementById('stat-best-streak'),
    statBestTime: document.getElementById('stat-best-time'),
    btnResetStats: document.getElementById('btn-reset-stats'),
    btnCloseStats: document.getElementById('btn-close-stats'),
    winOverlay: document.getElementById('win-overlay'),
    winStats: document.getElementById('win-stats'),
    btnPlayAgain: document.getElementById('btn-play-again')
  };
  Array.prototype.forEach.call(document.querySelectorAll('.foundation-slot'), function (el) {
    els.foundations[el.getAttribute('data-suit')] = el;
  });

  /* ---------- localStorage preferences & statistics ---------- */

  function loadDrawModePref() {
    try {
      return window.localStorage.getItem(DRAW_MODE_KEY) === '3' ? 3 : 1;
    } catch (err) {
      return 1;
    }
  }

  function saveDrawModePref(mode) {
    try {
      window.localStorage.setItem(DRAW_MODE_KEY, String(mode));
    } catch (err) {
      /* storage unavailable: preference simply not persisted */
    }
  }

  function loadStats() {
    let parsed = null;
    try {
      parsed = JSON.parse(window.localStorage.getItem(STATS_KEY) || 'null');
    } catch (err) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object') {
      return SolitaireEngine.createDefaultStats();
    }
    // Merge so older records never break on missing fields
    const merged = SolitaireEngine.createDefaultStats();    const keys = ['gamesPlayed', 'gamesWon', 'winPercentage', 'currentStreak', 'bestStreak'];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (typeof parsed[k] === 'number' && isFinite(parsed[k])) {
        merged[k] = parsed[k];
      }
    }
    if (typeof parsed.bestTime === 'number' && isFinite(parsed.bestTime)) {
      merged.bestTime = parsed.bestTime;
    }
    return merged;
  }

  function saveStats() {
    try {
      window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (err) {
      /* storage unavailable: stats stay in memory for this session */
    }
  }

  function recordCurrentGameIfNeeded(won) {
    if (gameResultRecorded) {
      return;
    }
    if (gameState.moves === 0 && !won) {
      return; // nothing happened: not a played game
    }
    if (!won && SolitaireEngine.isGameWon(gameState)) {
      return; // never record a won game as a loss
    }
    stats = SolitaireEngine.recordGameResult(stats, won, elapsedSeconds);
    saveStats();
    gameResultRecorded = true;
  }

  /* ---------- Game timer ---------- */

  function startTimerIfNeeded() {
    if (timerInterval !== null || SolitaireEngine.isGameWon(gameState)) {
      return;
    }
    timerInterval = window.setInterval(function () {
      elapsedSeconds += 1;
      els.timerDisplay.textContent = SolitaireEngine.formatTime(elapsedSeconds);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval !== null) {
      window.clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function resetTimer() {
    stopTimer();
    elapsedSeconds = 0;
    els.timerDisplay.textContent = '00:00';
  }

  /* ---------- Hint highlighting ---------- */

  function clearHintHighlight() {
    if (hintTimeout !== null) {
      window.clearTimeout(hintTimeout);
      hintTimeout = null;
    }
    Array.prototype.forEach.call(
      document.querySelectorAll('.hint-source, .hint-target'),
      function (el) {
        el.classList.remove('hint-source', 'hint-target');
      }
    );
  }

  function topCardElement(pileEl) {
    return pileEl.lastElementChild && pileEl.lastElementChild.classList.contains('card')
      ? pileEl.lastElementChild
      : pileEl;
  }

  function hintElementFor(zoneInfo, isTarget) {
    if (!zoneInfo) {
      return null;
    }
    if (zoneInfo.zone === 'waste') {
      return isTarget ? els.waste : topCardElement(els.waste);
    }
    if (zoneInfo.zone === 'stock') {
      return els.stock;
    }
    if (zoneInfo.zone === 'foundation') {
      return isTarget ? els.foundations[zoneInfo.suit] : topCardElement(els.foundations[zoneInfo.suit]);
    }
    if (zoneInfo.zone === 'tableau') {
      const colEl = els.tableau[zoneInfo.col];
      if (isTarget) {
        return topCardElement(colEl);
      }
      const cardEl = colEl.children[zoneInfo.cardIndex];
      return cardEl || colEl;
    }
    return null;
  }

  function handleHint() {
    clearHintHighlight();
    const hint = SolitaireEngine.findHint(gameState);
    if (!hint) {
      return; // nothing legal to suggest
    }
    const sourceEl = hintElementFor(hint.from, false);
    const targetEl = hintElementFor(hint.to, true);
    if (sourceEl) {
      sourceEl.classList.add('hint-source');
    }
    if (targetEl && targetEl !== sourceEl) {
      targetEl.classList.add('hint-target');
    }
    hintTimeout = window.setTimeout(clearHintHighlight, 1500);
  }

  /* ---------- Auto-complete animation ---------- */

  function stopAutoComplete() {
    if (autoCompleteTimer !== null) {
      window.clearTimeout(autoCompleteTimer);
      autoCompleteTimer = null;
    }
    isAutoCompleting = false;
    els.btnAutoComplete.disabled = false;
  }

  function stepAutoComplete() {
    autoCompleteTimer = window.setTimeout(function () {
      const step = SolitaireEngine.autoCompleteStep(gameState);
      render();
      if (step && !SolitaireEngine.isGameWon(gameState)) {
        stepAutoComplete();
      } else {
        stopAutoComplete();
      }
    }, 120);
  }

  function handleAutoComplete() {
    if (isAutoCompleting || !SolitaireEngine.canAutoComplete(gameState)) {
      return;
    }
    clearHintHighlight();
    isAutoCompleting = true;
    els.btnAutoComplete.disabled = true;
    stepAutoComplete();
  }

  /* ---------- Statistics modal ---------- */

  function renderStatsModal() {
    els.statGamesPlayed.textContent = String(stats.gamesPlayed);
    els.statGamesWon.textContent = String(stats.gamesWon);
    els.statWinPct.textContent = stats.winPercentage + '%';
    els.statCurrentStreak.textContent = String(stats.currentStreak);
    els.statBestStreak.textContent = String(stats.bestStreak);
    els.statBestTime.textContent =
      stats.bestTime === null ? '--:--' : SolitaireEngine.formatTime(stats.bestTime);
  }

  function openStatsModal() {
    renderStatsModal();
    els.statsModal.classList.remove('hidden');
  }

  function closeStatsModal() {
    els.statsModal.classList.add('hidden');
  }

  function handleResetStats() {
    stats = SolitaireEngine.createDefaultStats();
    saveStats();
    renderStatsModal();
  }

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

  function createCardElement(card, sourceInfo, interactive) {
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

    if (!card.faceUp || sourceInfo.zone === 'stock' || interactive === false) {
      return el; // face-down cards and fanned waste cards are never interactive
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
    clearHintHighlight();

    // Stock: show the top face-down card (or nothing when empty)
    clearChildren(els.stock);
    if (gameState.stock.length > 0) {
      const top = gameState.stock[gameState.stock.length - 1];
      els.stock.appendChild(
        createCardElement(top, { zone: 'stock', cardIndex: 0 })
      );
    }

    // Waste: draw-3 fans the top three cards; only the top card is interactive
    clearChildren(els.waste);
    if (gameState.waste.length > 0) {
      const fanCount = gameState.drawMode === 3 ? 3 : 1;
      const visibleStart = Math.max(0, gameState.waste.length - fanCount);
      for (let i = visibleStart; i < gameState.waste.length; i++) {
        const wasteCard = gameState.waste[i];
        const isTop = i === gameState.waste.length - 1;
        const el = createCardElement(wasteCard, { zone: 'waste' }, isTop);
        el.style.setProperty('--waste-fan-index', String(i - visibleStart));
        if (isTop && isSelected({ zone: 'waste' })) {
          el.classList.add('selected');
        }
        els.waste.appendChild(el);
      }
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
    els.btnDrawMode.textContent = 'Draw: ' + (gameState.drawMode === 3 ? '3' : '1');
    els.btnAutoComplete.classList.toggle(
      'hidden',
      isAutoCompleting || !SolitaireEngine.canAutoComplete(gameState)
    );
    if (gameState.moves > 0) {
      startTimerIfNeeded();
    }
  }

  function hideWinOverlay() {
    els.winOverlay.classList.add('hidden');
  }

  function checkWinState() {
    if (SolitaireEngine.isGameWon(gameState)) {
      stopTimer();
      recordCurrentGameIfNeeded(true);
      els.winStats.textContent =
        'You finished in ' + gameState.moves + ' moves with a score of ' +
        gameState.score + ' in ' + SolitaireEngine.formatTime(elapsedSeconds) + '.';
      els.winOverlay.classList.remove('hidden');
    }
  }

  function handleNewGame() {
    stopAutoComplete();
    recordCurrentGameIfNeeded(false);
    gameState = SolitaireEngine.createInitialState(true, undefined, loadDrawModePref());
    selectedSource = null;
    draggedSource = null;
    gameResultRecorded = false;
    hideWinOverlay();
    resetTimer();
    render();
  }

  function handleNearWinDeal() {
    stopAutoComplete();
    recordCurrentGameIfNeeded(false);
    gameState = SolitaireEngine.createNearWinState(loadDrawModePref());
    selectedSource = null;
    draggedSource = null;
    gameResultRecorded = false;
    hideWinOverlay();
    resetTimer();
    render();
  }

  function handleDrawModeToggle() {
    const newMode = gameState.drawMode === 3 ? 1 : 3;
    SolitaireEngine.setDrawMode(gameState, newMode);
    saveDrawModePref(newMode);
    render();
  }

  function handleUndo() {
    if (isAutoCompleting) {
      stopAutoComplete();
    }
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
    stats = loadStats();
    gameState = SolitaireEngine.createInitialState(true, undefined, loadDrawModePref());
    selectedSource = null;
    draggedSource = null;
    gameResultRecorded = false;

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
    els.btnDrawMode.addEventListener('click', handleDrawModeToggle);
    els.btnHint.addEventListener('click', handleHint);
    els.btnAutoComplete.addEventListener('click', handleAutoComplete);
    els.btnNearWin.addEventListener('click', handleNearWinDeal);
    els.btnStats.addEventListener('click', openStatsModal);
    els.btnCloseStats.addEventListener('click', closeStatsModal);
    els.btnResetStats.addEventListener('click', handleResetStats);
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
