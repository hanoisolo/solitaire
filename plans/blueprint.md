## 1. Architecture Summary

### File Layout (`C:\Users\fboy2\VibeProjects\solitaire`)
- `engine.js` — Pure, stateless/serializable Klondike Solitaire state and rules engine. Universal module wrapper (`window.SolitaireEngine` in browser, `module.exports` in Node.js). Zero DOM dependencies.
- `test_engine.js` — Automated headless Node.js test suite (`node:assert`) validating `engine.js` rules, state transitions, and snapshot/undo mechanics.
- `index.html` — Single-page application markup loaded directly via `file://` protocol using classic `<script src="engine.js"></script>` and `<script src="app.js"></script>` tags.
- `styles.css` — Casino-felt visual styling, CSS custom properties, card rendering, responsive 7-column tableau cascade, header HUD, and win celebration modal.
- `app.js` — DOM renderer and controller managing user interactions (click-to-move, HTML5 drag-and-drop stacks, double-click foundation auto-move, New Game, Undo button) and bridging DOM events to `SolitaireEngine`.

### Data Flow & State Snapshot Format (for Undo)
To make state inspection, testing, and Undo trivial and deterministic, `engine.js` operates on a plain, JSON-serializable state object:

```js
{
  stock: [Card, ...],         // faceDown cards remaining to be drawn
  waste: [Card, ...],         // faceUp drawn cards (top card is last element)
  foundations: {              // 4 suit piles, ascending A(1) -> K(13)
    spades: [Card, ...],
    hearts: [Card, ...],
    diamonds: [Card, ...],
    clubs: [Card, ...]
  },
  tableau: [                  // 7 columns (index 0..6); top/playable cards at the end
    [Card, ...], ...
  ],
  moves: 0,                   // integer move counter
  score: 0,                   // integer score counter (standard Klondike scoring)
  history: [string, ...]      // stack of JSON-stringified snapshots (excluding `history` itself)
}
```

Where each `Card` object is:
```js
{
  id: "hearts-1",             // "<suit>-<rank>"
  suit: "hearts",             // "spades" | "hearts" | "diamonds" | "clubs"
  rank: 1,                    // 1 (Ace) .. 13 (King)
  color: "red",               // "red" (hearts/diamonds) | "black" (spades/clubs)
  faceUp: false               // boolean
}
```

**Undo Snapshot Protocol:**
Before any state-mutating action (`drawFromStock`, `moveCards`, `autoMoveToFoundation`), `pushSnapshot(state)` serializes `{ stock, waste, foundations, tableau, moves, score }` via `JSON.stringify` and pushes it onto `state.history`. Calling `undo(state)` pops the last string from `state.history`, parses it, and restores all properties onto `state`.

### Module Connection
- `index.html` loads `<link rel="stylesheet" href="styles.css">`, then `<script src="engine.js"></script>`, then `<script src="app.js"></script>` at the end of `<body>`.
- `engine.js` ends with:
  ```js
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolitaireEngine;
  } else if (typeof window !== 'undefined') {
    window.SolitaireEngine = SolitaireEngine;
  }
  ```
- `app.js` accesses `window.SolitaireEngine`, maintains the live `gameState` + UI selection state (`selectedSource`), and re-renders the board cleanly on every state transition.

---

## 2. Ordered Execution Segments

### Segment 1: Pure Game State & Rules Engine + Automated Node Test Suite
- **(a) Exact files and functions to create/modify:**
  - **Create `engine.js`** exporting `SolitaireEngine` with:
    - `SUITS` (`['spades', 'hearts', 'diamonds', 'clubs']`), `RANKS` (`1..13`), ` getCardColor(suit)`
    - `createDeck()` — returns an ordered 52-card array (`faceUp: false`).
    - `shuffleDeck(deck, rngFn = Math.random)` — returns a new Fisher-Yates shuffled array.
    - `createInitialState(shouldShuffle = true, rngFn = Math.random)` — creates deck, optionally shuffles, deals 7 tableau columns (column `i` has `i + 1` cards, only the last card `faceUp: true`), puts remaining 24 cards into `stock` (`faceUp: false`), initializes empty `waste`, empty `foundations`, `moves: 0`, `score: 0`, `history: []`.
    - `cloneStateSnapshot(state)` & `pushSnapshot(state)` — serializes state (without `history`) for Undo.
    - `undo(state)` — pops most recent snapshot from `state.history` and restores state in-place (returns `true` if undone, `false` if history empty).
    - `drawFromStock(state)` — records snapshot; if `stock.length > 0`, pops top card, sets `faceUp: true`, pushes to `waste`, increments `moves`; if `stock` is empty and `waste.length > 0`, recycles all `waste` cards back to `stock` in reverse order with `faceUp: false`, increments `moves`. Returns `true` if state changed, `false` if both `stock` and `waste` are empty.
    - `canMoveToFoundation(card, foundationPile, suit)` — validates `card.suit === suit`, `card.faceUp === true`, and `rank === 1` (if empty) or `rank === topCard.rank + 1`.
    - `canMoveToTableau(movingCards, targetColumn)` — validates `movingCards` is non-empty, all `faceUp`, and for `movingCards[0]`: if `targetColumn` is empty, `movingCards[0].rank === 13` (King only); otherwise `targetColumn` top card is `faceUp`, `movingCards[0].color !== topCard.color`, and `movingCards[0].rank === topCard.rank - 1`.
    - `moveCards(state, from, to)` — validates and executes a move between `{ zone: 'waste' | 'tableau' | 'foundation', col?: number, cardIndex?: number, suit?: string }` and `{ zone: 'tableau' | 'foundation', col?: number, suit?: string }`. Pushes snapshot before mutating, moves the card(s), auto-flips the newly exposed top card of a source tableau column (`faceUp = true`, `+5` score), updates `moves` (`+1`) and `score` (`+10` to foundation, `+5` waste to tableau, `-15` foundation to tableau, floored at 0). Returns `true` on legal move, `false` on illegal move (leaving state and history untouched).
    - `autoMoveToFoundation(state, from)` — attempts to move the top card from `waste` or `tableau[col]` to its matching suit foundation via `moveCards`. Returns `true` if moved, `false` otherwise.
    - `isGameWon(state)` — returns `true` when all 4 foundation piles have 13 cards (`52` total).
  - **Create `test_engine.js`**:
    - Uses `node:assert/strict` to test:
      1. 52 unique cards created with valid suits, ranks, colors.
      2. Deterministic and random shuffle behavior without losing cards.
      3. Dealing 7 tableau columns (1..7 cards, top card `faceUp: true`, underneath `faceUp: false`, 24 cards in stock).
      4. Legal and illegal alternating-color descending tableau moves (single cards, multi-card stacks, King-only on empty column, rejecting same-color or wrong-rank moves).
      5. Auto-flipping a face-down tableau card when the card above it moves away.
      6. Stock drawing to waste and waste recycling when stock is exhausted.
      7. Suit-ascending foundation moves (Ace on empty, 2 on Ace of same suit, rejecting wrong suit/rank or multi-card stack to foundation).
      8. Snapshot/Undo restoration and `isGameWon` detection.
- **(b) Concrete goal:** Establish a 100% pure, deterministic, bug-free Klondike Solitaire engine with full test coverage under Node.js before any UI is built.
- **(c) Verification Gate:**
  - Command: `node test_engine.js`
  - Pass criteria: Command exits with code `0` and prints a pass confirmation with all assertions succeeding.

---

### Segment 2: Clean Casino-Felt UI (`index.html` and `styles.css`)
- **(a) Exact files and functions to create/modify:**
  - **Create `index.html`**:
    - Semantic HTML5 document (`<!DOCTYPE html>`) with title `"Klondike Solitaire"`, linking `styles.css`.
    - Top control bar (`.top-bar`): Game title, stats container (`#move-counter`, `#score-counter`), and action buttons (`#btn-undo`, `#btn-new-game`).
    - Game board container (`#game-board`):
      - Top row (`.top-row`): Stock slot (`#stock-pile`), Waste slot (`#waste-pile`), spacer, and 4 Foundation slots (`#foundation-spades`, `#foundation-hearts`, `#foundation-diamonds`, `#foundation-clubs`) with suit watermarks (`♠`, `♥`, `♦`, `♣`).
      - Tableau section (`#tableau`): 7 column containers (`#tableau-0` through `#tableau-6` with `data-col="0..6"`).
    - Win celebration overlay modal (`#win-overlay`, hidden by default with `.hidden` class) displaying final moves/score and a `"Play Again"` button (`#btn-play-again`).
    - Classic script tags at the bottom of `<body>`: `<script src="engine.js"></script>` followed by `<script src="app.js"></script>`.
  - **Create `styles.css`**:
    - Radial-gradient green casino-felt background (`#0f5132` to `#072e1b`), gold/ivory HUD typography, responsive layout container.
    - Slot placeholders (`.pile-slot`, `.tableau-col`) with subtle rounded borders and suit icons for foundations.
    - Card styling (`.card`, `.card.face-down`, `.card.face-up`, `.card.red`, `.card.black`, `.card.selected`, `.card.dragging`):
      - Crisp white card faces with rounded corners, box-shadow, top-left and bottom-right corner rank+suit indices, and central suit pip.
      - Patterned crimson/gold back design for `.card.face-down`.
      - Vertical cascade positioning inside `.tableau-col` using CSS custom property `--card-index` or vertical margins so stacked cards fan downward cleanly.
      - Visual highlight (`.selected`, `.drop-target`) and `.win-overlay` celebration styles.
- **(b) Concrete goal:** Produce a complete, self-contained HTML structure and casino-felt stylesheet with all board slots, HUD elements, card visual states, and win modal hooks ready for `app.js`.
- **(c) Verification Gate:**
  - Command:
    ```
    node -e "const fs=require('fs'),assert=require('assert');const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('styles.css','utf8');['stock-pile','waste-pile','foundation-spades','foundation-hearts','foundation-diamonds','foundation-clubs','tableau-0','tableau-6','btn-new-game','btn-undo','move-counter','score-counter','win-overlay','engine.js','app.js'].forEach(id=>assert(html.includes(id),'Missing in HTML: '+id));['.card','.face-up','.face-down','.red','.black','.selected'].forEach(sel=>assert(css.includes(sel),'Missing in CSS: '+sel));console.log('Segment 2 Gate Passed');"
    ```
  - Pass criteria: Command exits with code `0` and outputs `Segment 2 Gate Passed`.

---

### Segment 3: Interactive Gameplay (`app.js`)
- **(a) Exact files and functions to create/modify:**
  - **Create `app.js`** implementing the interactive game controller and DOM renderer:
    - `initGame()` — initializes `gameState = SolitaireEngine.createInitialState(true)`, clears `selectedSource = null`, binds board/window event listeners, and calls `render()`.
    - `formatRank(rank)` & `getSuitSymbol(suit)` — maps `1,11,12,13` to `'A','J','Q','K'` and suits to `'♠','♥','♦','♣'`.
    - `createCardElement(card, sourceInfo)` — builds the `.card` DOM element with rank/suit labels, sets `draggable = card.faceUp`, attaches click, double-click, and HTML5 drag (`dragstart`, `dragend`) listeners.
    - `render()` — clears and re-renders `#stock-pile`, `#waste-pile`, all 4 `#foundation-<suit>` piles, and `#tableau-0..6` columns from `gameState`, preserving `.selected` visual state if `selectedSource` is active.
    - `handleStockClick()` — clears selection, invokes `SolitaireEngine.drawFromStock(gameState)`, and calls `render()`.
    - `handleSourceOrTargetClick(targetInfo)` — implements click-to-move:
      - If no `selectedSource`, selects any clicked `faceUp` card (top of waste, top of foundation, or any `faceUp` card/stack in a tableau column) and highlights it.
      - If `selectedSource` is already set, attempts `SolitaireEngine.moveCards(gameState, selectedSource, targetInfo)`; clears selection and calls `render()`. Clicking an empty tableau slot or foundation slot while a card is selected attempts to move the selected card/stack there.
    - `handleCardDoubleClick(sourceInfo)` — invokes `SolitaireEngine.autoMoveToFoundation(gameState, sourceInfo)` (valid for top card of `waste` or top card of a `tableau` column), clears selection, and re-renders.
    - `setupDragAndDrop()` — handles `dragstart` (stores serialized `sourceInfo` in `dataTransfer` and module state), `dragover` (`event.preventDefault()`), and `drop` on `.tableau-col` and `.foundation-slot` targets to invoke `SolitaireEngine.moveCards(gameState, draggedSource, dropTarget)`.
- **(b) Concrete goal:** Connect the pure engine to the DOM so players can draw/recycle stock, move single cards and multi-card stacks via click-to-move or drag-and-drop, auto-flip newly exposed tableau cards, and double-click cards to send them to foundations.
- **(c) Verification Gate:**
  - Command:
    ```
    node --check app.js && node -e "const fs=require('fs'),assert=require('assert');const code=fs.readFileSync('app.js','utf8');['initGame','render','createCardElement','handleStockClick','handleCardDoubleClick','autoMoveToFoundation','moveCards','drawFromStock','dragstart','drop'].forEach(fn=>assert(code.includes(fn),'Missing in app.js: '+fn));console.log('Segment 3 Gate Passed');"
    ```
  - Pass criteria: `node --check app.js` passes syntax validation and the assertion script exits `0` printing `Segment 3 Gate Passed`.

---

### Segment 4: New Game, Undo, Move/Score Counter & Win Celebration State
- **(a) Exact files and functions to create/modify:**
  - **Modify `app.js`**:
    - `updateHUD()` — updates `#move-counter` (`gameState.moves`), `#score-counter` (`gameState.score`), and sets `#btn-undo.disabled = (gameState.history.length === 0)`. Called on every `render()`.
    - `handleNewGame()` — resets `gameState = SolitaireEngine.createInitialState(true)`, clears `selectedSource`, hides `#win-overlay`, and calls `render()`. Bound to both `#btn-new-game` and `#btn-play-again`.
    - `handleUndo()` — clears `selectedSource`, calls `SolitaireEngine.undo(gameState)`, hides `#win-overlay`, and calls `render()`. Bound to `#btn-undo` (and `Ctrl+Z` / `Cmd+Z` keyboard shortcut).
    - `checkWinState()` — checks `SolitaireEngine.isGameWon(gameState)` inside `render()`; when `true`, removes `.hidden` from `#win-overlay` and displays the final move count and score in `#win-stats`.
  - **Modify `test_engine.js`**:
    - Add an end-to-end verification suite testing full game lifecycle integration: multi-step move sequence, score/move increments, `undo(state)` restoring exact prior `moves`/`score`/piles, and a simulated 52-card foundation completion triggering `isGameWon(state) === true`.
- **(b) Concrete goal:** Complete the user experience with working New Game, Undo (with disabled state when history is empty), live Move and Score counters, and the Win celebration state, verified both at the engine level and via a headless DOM-stub smoke test of `app.js`.
- **(c) Verification Gate:**
  - Command:
    ```
    node test_engine.js && node --check app.js && node -e "const fs=require('fs'),assert=require('assert');const code=fs.readFileSync('app.js','utf8');['updateHUD','handleNewGame','handleUndo','checkWinState','isGameWon','SolitaireEngine.undo'].forEach(fn=>assert(code.includes(fn),'Missing in app.js: '+fn));console.log('Segment 4 Gate Passed');"
    ```
  - Pass criteria: Command exits with code `0`, running the expanded `test_engine.js` suite and verifying all Segment 4 lifecycle functions in `app.js`.

---

## 3. Assumptions Made
1. **Standard Klondike Draw-1 Rules:** Drawing from stock turns 1 card at a time to the waste pile, with unlimited passes through the stock. This offers the smoothest casual play experience and clean determinism.
2. **Standard Klondike Scoring:** Waste to Tableau = `+5`, Waste/Tableau to Foundation = `+10`, Turning over a face-down Tableau card = `+5`, Foundation back to Tableau = `-15` (score floored at `0`).
3. **Classic Script Execution (`file://` compatible):** No ES modules (`import`/`export`), bundlers, or external image/font assets are used so double-clicking `index.html` offline in any modern desktop browser works out-of-the-box.

---

## 4. Risks & Mitigations
1. **Risk: Drag-and-drop vs. Click-to-move conflicts on stacked tableau cards.**
   - *Mitigation:* Event propagation (`event.stopPropagation()`) will be used on `.card` click handlers so clicking a specific card in a tableau column selects that exact card (and any face-up cards stacked on top of it) rather than triggering the parent column's empty-slot handler.
2. **Risk: Reference mutation bugs corrupting the Undo history stack.**
   - *Mitigation:* `pushSnapshot(state)` uses `JSON.stringify` on the pure data fields (`stock`, `waste`, `foundations`, `tableau`, `moves`, `score`), ensuring deep immutability of every historical snapshot. Failed/illegal move attempts in `moveCards` must validate *before* pushing a snapshot so illegal clicks do not pollute the Undo stack.
3. **Risk: Clicking a face-down card in a tableau column.**
   - *Mitigation:* Since `engine.js` auto-flips the exposed top card of any tableau column immediately when the card covering it is moved, face-down cards are never clickable or draggable; `engine.js` and `app.js` both explicitly guard `card.faceUp === true`.

---

## 5. Verification Steps for Each Deliverable
1. **Deliverable 1 (`engine.js`, `test_engine.js`):** Run `node test_engine.js` — verifies 52-card deck generation, shuffle, 7-column tableau deal, alternating-color descending moves, King on empty column, stock/waste draw & recycle, suit-ascending foundations, auto-flip, and snapshot/undo.
2. **Deliverable 2 (`index.html`, `styles.css`):** Run the Segment 2 Node assertion gate — verifies all required DOM containers, IDs, classic script tags, and CSS card/board selectors exist.
3. **Deliverable 3 (`app.js` interactive gameplay):** Run `node --check app.js` and the Segment 3 Node assertion gate — verifies zero syntax errors and presence of click-to-move, drag-and-drop, double-click auto-foundation, and stock cycling handlers.
4. **Deliverable 4 (New Game, Undo, HUD counters, Win celebration):** Run `node test_engine.js`, `node --check app.js`, and the Segment 4 Node assertion gate — verifies HUD synchronization, Undo restoration, New Game reset, and Win detection.

APPROVED
