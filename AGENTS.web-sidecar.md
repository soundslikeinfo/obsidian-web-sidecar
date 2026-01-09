# Web Sidecar Plugin — Developer Guide

This document describes the expected behavior, UI patterns, and architectural decisions for the **Web Sidecar** Obsidian plugin. It is intended for senior developers maintaining or extending this plugin.

> **See also:** `AGENTS.md` for general Obsidian plugin conventions, `AGENTS.web-sidecar.regression.md` for known regressions and their fixes.

---

## Conventions

### Comment Style

- **Keep comments concise.** Avoid verbose explanations of "thinking process" or alternative approaches considered.
- Single-line TODOs are preferred: `// TODO: Fix the visual flash for default icons`
- Multi-line explanatory comments should be reserved for genuinely complex logic.
- Avoid leaving "notebook-style" reasoning in production code.

### Terminology Consistency

Always use these terms in UI strings, context menus, and settings:

| Correct Term | Incorrect Alternatives |
|--------------|------------------------|
| "web viewer" | "browser tab", "web tab" |
| "note" | "file", "document" |
| "Open in new web viewer" | "Open in new tab" |
| "Close linked web views" | "Close all web views for this page" |

---

## ESLint & Code Quality

> **Current Status**: 0 Errors (Clean Baseline)
> All 80+ legacy errors were resolved on 2026-01-06.

To maintain this clean state ("flush out nuisances before they start"), adhere to the following strict rules:

### 1. Zero Persistence Strategy
-   Run `npm run lint` frequently.
-   Do not commit code with lint errors. A clean build is a requirement, not a suggestion.

### 2. Promise Handling (No Floating Promises)
-   **Rule**: Every Promise must be handled.
-   **Correct usage**:
    ```typescript
    // If you need the result or order:
    await this.asyncMethod();

    // If it's fire-and-forget (e.g., in an event handler):
    void this.asyncMethod();
    
    // In array map (if waiting):
    await Promise.all(items.map(i => this.process(i)));
    ```
-   **Why**: Unhandled promises swallow errors and lead to impossible-to-debug race conditions.

### 3. Type Safety (No `any`)
-   **Rule**: Avoid `any`. It defeats the purpose of TypeScript.
-   **Alternatives**:
    -   Use `unknown` if the type is truly dynamic, then narrow it with type guards (`if (typeof val === 'string')`).
    -   Use strict interfaces for plugin internals.
    -   If interacting with untyped Obsidian internals (rare), minimize the scope of any necessary casts and document *why* it is needed.

### 4. Deprecation Watch
-   **`activeLeaf`**: This is deprecated.
    -   **Use**: `app.workspace.getLeaf()` or `app.workspace.getActiveViewOfType(View)?.leaf`.
-   Always prefer modern Obsidian API replacements to future-proof the plugin.

### 5. Event Handlers
-   DOM event handlers in Obsidian views often cannot be `async`.
-   Do not pass an async function directly to `addEventListener` if the types expect a void return.
-   **Pattern**:
    ```typescript
    element.addEventListener('click', (e) => {
         // Wrap async work
         void this.handleClick(e);
    });
    ```

---

## Plugin Overview

**Web Sidecar** is a sidebar companion for Obsidian's web viewers. It:
- Tracks all open web viewer tabs (native `webviewer`)
- Displays matching notes from the vault for each tracked URL
- Shows "Virtual Tabs" for open notes with URL properties (but no active web viewer)
- Provides quick actions: create notes, open URLs, focus tabs, open paired view
- Injects experimental header buttons and menu items into web viewer panes

---

## Architecture

```
src/
├── main.ts                           # Plugin lifecycle, event registration
├── commands.ts                       # Command palette commands
├── types.ts                          # Interfaces (TrackedWebViewer, IWebSidecarView, Settings)
├── views/
│   ├── webSidecarView.ts             # Main ItemView sidebar (implements IWebSidecarView)
│   └── components/
│       ├── ContextMenus.ts           # Facade for all context menu modules
│       ├── NoteRenderer.ts           # Renders note items in lists
│       ├── SectionRenderer.ts        # Orchestrates auxiliary sections
│       ├── context-menus/            # Modular context menu definitions
│       │   ├── ContextMenuHelpers.ts # Shared helpers (openWebViewerAndRefresh, etc.)
│       │   ├── GroupContextMenu.ts   # Domain/Subreddit group menus
│       │   ├── NoteContextMenu.ts    # Note item menus
│       │   ├── PinnedTabContextMenu.ts
│       │   ├── VirtualTabContextMenu.ts
│       │   └── WebViewerContextMenu.ts
│       ├── sections/                 # Modular auxiliary section renderers
│       │   ├── DomainSection.ts
│       │   ├── GithubSection.ts
│       │   ├── RecentNotesSection.ts
│       │   ├── SectionHelpers.ts     # Drag-and-drop, sorting helpers
│       │   ├── SubredditSection.ts
│       │   ├── TagSection.ts
│       │   ├── TwitterSection.ts
│       │   └── YouTubeSection.ts
│       └── tabs/                     # Tab list renderers
│           ├── LinkedNotesTabRenderer.ts     # Orchestrates linked-mode tab list
│           ├── LinkedNotesTabItemRenderer.ts # Individual tab item rendering
│           └── PinnedTabRenderer.ts          # Pinned tabs section
├── services/
│   ├── TabStateService.ts            # Tracks all web viewer tabs with focus timestamps
│   ├── NavigationService.ts          # Handles opening notes/URLs, paired opening, focus
│   ├── FocusService.ts               # Focus cycling for tabs and notes
│   ├── LeafManagement.ts             # Leaf creation and management helpers
│   ├── PageTitleService.ts           # Async page title fetching
│   ├── UrlIndex.ts                   # Fast URL-to-note lookup index
│   ├── contentCapture.ts             # Captures web page content as markdown
│   ├── faviconUtils.ts               # Favicon URL generation
│   ├── obsidianHelpers.ts            # Obsidian API helpers
│   ├── urlUtils.ts                   # URL normalization, domain extraction
│   ├── webViewerUtils.ts             # Web viewer homepage retrieval
│   ├── noteMatcher.ts                # Re-exports from matchers/
│   └── matchers/                     # Modular note matching logic
│       ├── core.ts                   # Core URL matching logic
│       ├── index.ts                  # Barrel export
│       ├── recent.ts                 # Recent notes matching
│       ├── reddit.ts                 # Reddit/subreddit matching
│       ├── youtube.ts                # YouTube channel matching
│       ├── twitter.ts                # Twitter/X user matching
│       ├── github.ts                 # GitHub repo matching
│       └── tags.ts                   # Tag-based matching
├── experimental/
│   └── WebViewerManager.ts           # Injects header buttons and menu items into web viewers
├── modals/                           # Modal dialogs (CreateNoteModal, etc.)
└── settings/                         # Settings tab and configuration
```

---

## Core Behaviors

### 1. Tab Tracking

**Expected behavior:**
- All open `webviewer` leaves are tracked
- Each tab stores: `leafId`, `url`, `title`, `lastFocused` timestamp, `isPopout`, `leaf` reference
- Tabs sorted by `lastFocused` (most recent first) or alphabetically by title
- Closed tabs are automatically removed on next poll cycle

**Implementation notes:**
- Use `workspace.getLeavesOfType()` to scan for web viewers
- Store tabs in `Map<string, TrackedWebViewer>` keyed by leaf ID
- Update `lastFocused` on every `active-leaf-change` event

### 1a. Pinned Tabs

**Expected behavior:**
- Pinned tabs persist across sessions (stored in settings)
- Each pinned tab has a `url` (home URL) and optional `currentUrl` (navigated/redirected URL)
- Pinned tabs appear in their own section above regular tabs
- Clicking a pinned tab opens or focuses its associated web viewer
- Notes linked to pinned URLs should NOT appear as virtual tabs

**Key properties (PinnedTab interface):**
- `id`: Unique identifier
- `url`: Home/base URL (user pinned this)
- `currentUrl`: Actual URL in web viewer after navigation/redirect
- `title`: Display title
- `leafId`: Associated web viewer leaf (undefined if closed)
- `isNote`, `notePath`: If pinned from a note

**Context menu options (when redirect detected):**
- "Reset to pinned URL" — navigates back to `pin.url`
- "Update linked notes to current URL" — updates notes AND `pin.url`
- "Save current URL as pinned" — only updates `pin.url`

### 1b. Redirect Detection & Recovery

**Problem:** When a web viewer auto-redirects (e.g., deleted Reddit post → "deleted by user" page), the association between the original note and the web viewer breaks.

**Solution Architecture:**

For **regular web viewers (TrackedWebViewer)**:
- `originalUrl` field stores URL when opened from a linked note (virtual tab)
- `setPendingOriginalUrl()` sets URL **BEFORE** opening web viewer
- `scanAllWebViewers()` applies pending URL when new tab is registered
- Context menu shows "Update linked note(s) url to current view" when redirect detected

For **pinned tabs**:
- `syncPinnedTabCurrentUrl()` automatically syncs `pin.currentUrl` when navigation detected
- Called from `scanAllWebViewers()` when URL change detected on pinned leaf
- Existing context menu handles the update

**Critical timing (race condition fix):**
```typescript
// BEFORE opening URL, set pending original URL
this.view.setPendingOriginalUrl(virtualTab.url);
await this.view.openUrlSmartly(virtualTab.url, e);
// Original URL is applied when new tab is registered in scanAllWebViewers
```

### 1c. Virtual Tab Filtering

**Expected behavior:**
- Notes with URLs already open in a web viewer → NO virtual tab
- Notes with URLs matching a pinned tab → NO virtual tab (shown under pin instead)
- Only notes with URLs not open anywhere appear as virtual tabs

**Implementation:**
```typescript
// In getVirtualTabs():
const pinnedUrls = new Set<string>();
for (const pin of settings.pinnedTabs) {
    pinnedUrls.add(pin.url);
    if (pin.currentUrl) pinnedUrls.add(pin.currentUrl);
}
// Later: if (pinnedUrls.has(propValue)) continue;
```

### 2. Virtual Tabs (Open Notes with URLs)

**Expected behavior:**
- Notes that are open in the editor AND have a URL property appear as "virtual tabs"
- Virtual tabs are italicized and show a link icon
- Clicking a virtual tab opens the URL in a new web viewer
- Virtual tabs disappear once the URL is opened in a web viewer (they become real tabs)

**Implementation notes:**
- Check all markdown leaves for files with frontmatter URL properties
- Cross-reference against already-open web viewer URLs to avoid duplicates
- Cache page titles from previous web viewer sessions for display

### 3. URL Detection & Polling

**Expected behavior:**
- URLs update automatically when navigation occurs within a web viewer
- No user action required to refresh — polling handles it
- Polling does NOT re-render the DOM unless tab data actually changed

**Implementation notes:**
- Poll interval: 500ms
- Use change detection (hash of tab URLs + titles) to prevent unnecessary re-renders
- Unnecessary re-renders cause: collapsible sections to collapse, hover states to flicker

```typescript
// CRITICAL: Only update if tabs changed
const previousHash = this.getTabsHash();
this.scanAllWebViewers();
const newHash = this.getTabsHash();
if (previousHash !== newHash) {
    this.view?.updateTabs(this.getTrackedTabs(), this.getVirtualTabs());
}
```

### 4. URL Property Handling (Array Support)

**Expected behavior:**
- URL properties can be single strings OR arrays of strings
- If array, first valid URL is used for matching
- Both formats are supported: `source: https://...` and `source: [https://..., https://...]`

```typescript
const values = Array.isArray(propValue) ? propValue : [propValue];
for (const val of values) {
    if (typeof val !== 'string') continue;
    if (!isValidUrl(val)) continue;
    // Process URL...
}
```

### 5. Title Filtering

**Expected behavior:**
- Invalid or placeholder titles are NOT displayed (show domain instead)
- Filtered titles: `data:text/...`, `about:blank`, `about:newtab`, `New Tab`, `Loading...`

```typescript
private isValidTitle(title: string | undefined): boolean {
    if (!title || title.trim() === '') return false;
    if (/^data:[a-z]+\//.test(title)) return false;
    if (/^about:(blank|newtab|srcdoc)/.test(title)) return false;
    if (title === 'New Tab' || title === 'Loading...') return false;
    return true;
}
```

### 6. Sidebar Focus Bug Prevention

**Expected behavior:**
- Clicking sidebar elements should work on the FIRST click
- No "double-click required" behavior due to Electron focus issues

**Implementation notes:**
- Track `isInteracting` flag via `mouseenter`/`mouseleave` on container
- Skip `render()` calls while `isInteracting === true` (unless manual refresh)
- Prevents polling from destroying DOM mid-interaction

```typescript
updateTabs(trackedTabs: TrackedWebViewer[], virtualTabs: VirtualTab[]): void {
    this.trackedTabs = trackedTabs;
    this.virtualTabs = virtualTabs;
    // Skip render if user is interacting
    if (!this.isInteracting && !this.isManualRefresh) {
        this.render();
    }
}
```

### 7. Active Tab Highlighting

**Expected behavior:**
- The currently focused web viewer tab is visually highlighted in the sidebar
- Highlighting uses `is-active` class with accent border and bolder text

**Key fixes:**
- Track `lastActiveLeaf` as a fallback when sidebar gains focus
- Ignore `active-leaf-change` events where `leaf === this.leaf` (sidebar itself)

### 7a. Note Focus Indicator (Blue Dot)

**Expected behavior:**
- When a note (linked to a web viewer URL) is focused in the editor, a blue dot appears to its left in the sidecar
- Only shows for exact-match notes in the expanded notes list
- Uses `is-focused` class with CSS `::before` pseudo-element

**Implementation notes:**
- In `renderLinkedNotes()`, check if each note's file path matches the active leaf's file
- Uses `lastActiveLeaf` fallback when sidecar itself is focused
- CSS: `.web-sidecar-linked-note-list li.is-focused::before` with accent-colored dot

### 7b. Note Tab Cycling

**Expected behavior:**
- When clicking a note that has multiple open tabs, cycling through each instance
- Similar pattern to `focusNextInstance` for web viewer tabs
- First click focuses first instance, subsequent clicks cycle to next

**Implementation notes:**
- `FocusService.focusNextNoteInstance(filePath: string)` handles cycling
- Uses `noteCycleIndex: Map<string, number>` to track position
- If only one instance exists, just focuses it (no cycling)

### 8. Immediate UI Refresh After Actions

**Expected behavior:**
- The sidecar MUST update immediately after ANY action that changes tab/leaf state
- No "stale" UI where closed tabs persist or new tabs don't appear

**Implementation notes:**
- ALL methods in `NavigationService` that modify leaves must call:
```typescript
this.isManualRefreshCallback(true);
this.onRefreshCallback();
```
- This includes: `openNoteSmartly`, `openUrlSmartly`, `openNewWebViewer`, `closeLeaf`, `closeAllLeavesForUrl`, `closeLinkedNoteLeaves`
- For create actions, add a small delay (50ms) before refresh to allow Obsidian to register the new leaf

### 9. State Persistence for Collapsible Sections

**Expected behavior:**
- Expanded sections remain expanded after refresh/sort operations
- Individual domain/subreddit/channel groups maintain their expanded state
- Sort buttons do NOT collapse everything

**Implementation notes:**
- Store expanded state in `WebSidecarView`: `isRecentNotesOpen`, `isDomainGroupOpen`, `isSubredditExplorerOpen`, `isYouTubeChannelExplorerOpen`, `isTwitterExplorerOpen`, `isGithubExplorerOpen`, `expandedGroupIds: Set<string>`
- Apply `details.setAttribute('open', '')` on render if state is true
- Listen to `details.addEventListener('toggle', ...)` to track state changes
- Use unique IDs like `domain:example.com` or `subreddit:r/obsidianmd` or `youtube:@ChannelName` for group tracking

### 10. Auxiliary Section Sorting

**Expected behavior:**
- Each auxiliary section (Domain, Subreddit, YouTube, Twitter, GitHub) has independent 3-way sort cycling
- Sort cycles: **alpha → count → recent → alpha**
- **Tooltip shows current state** ("Sorted by name"), NOT next action ("Sort by count")
- Sort preferences persist across vault reloads

**Implementation notes:**
- Store sort preferences in settings: `domainSortOrder`, `subredditSortOrder`, `youtubeChannelSortOrder`, `twitterSortOrder`, `githubSortOrder`
- Save settings immediately when user clicks sort button
- Initialize view sort state from settings in `onOpen()`
- Recency sort uses `file.stat.mtime` (already cached by Obsidian, no overhead)

```typescript
// Helper to get max mtime of notes in a group
const getMaxMtime = (notes: { file: TFile }[]) => {
    return Math.max(...notes.map(n => n.file.stat.mtime));
};

// Sort by recency: most recently modified note in each group
if (sortMode === 'recent') {
    return getMaxMtime(b.notes) - getMaxMtime(a.notes);
}
```

### 11. Domain/Group Quick Navigation

**Expected behavior:**
- Each domain row (e.g., `youtube.com`), subreddit row (e.g., `r/AffinityPhoto`), or channel row has:
  - **Right-click context menu** with options to open the homepage/subreddit in web viewer
  - **Link icon** (🔗) to the left of the note count, visible on hover
- Clicking the link icon opens the domain/subreddit directly in a new web viewer
- Context menu title shows specific domain: "Open youtube.com" (not "Open domain homepage")

**Implementation notes:**
- Link button uses class `web-sidecar-group-link-btn` with hover-reveal CSS
- Context menus: `GroupContextMenu.showDomainContextMenu()`, `GroupContextMenu.showSubredditContextMenu()`
- Subreddit URLs use format: `https://reddit.com/r/subredditName`

### 12. Section Cleanup Before Re-render

**Expected behavior:**
- No duplicate sections appear after refresh
- Collapsible sections are cleanly replaced, not appended

**Implementation notes:**
- Before creating a section, check for and remove existing:
```typescript
const existingSection = container.querySelector('[data-section-id="domain"]');
if (existingSection) existingSection.remove();
```
- Use `data-section-id` attributes to identify sections uniquely

---

## Experimental Features (Header Actions)

Controlled by `enableWebViewerActions` setting. These inject UI into web viewer panes.

### Header Buttons

| Button | Setting | Icon | Condition | Action |
|--------|---------|------|-----------|--------|
| New Web Viewer | `showWebViewerHeaderButton` | `plus-circle` | Always | Opens new blank web viewer |
| New Note | `showWebViewerNewNoteButton` | `file-plus` | Always | Opens CreateNoteModal for current URL |
| Open Note | `showWebViewerOpenNoteButton` | `split-square-horizontal` or `history` | **Only if linked notes exist** | Opens note to the right |

### Open Note Button (Dynamic)

**Expected behavior:**
- Button only appears when the current URL has linked notes in the vault
- If multiple notes link to the URL, show `history` icon with tooltip "Open most recent note to the right"
- Button state is refreshed during polling loop

**Implementation notes (CRITICAL):**
- Use `data-note-path` attribute to prevent button recreation when state unchanged
- Without this check, button "pulses" on every poll cycle

```typescript
// Prevent pulsing: check if button already points to correct note
if (existingBtn && existingBtn.getAttribute('data-note-path') === noteToOpen.path) {
    return; // DO NOT rebuild button
}
```

### More Options Menu Items

| Item | Setting | Condition | Action |
|------|---------|-----------|--------|
| New web view tab | `showWebViewerMenuOption` | Always | Opens new web viewer |
| Open note to the right | `showWebViewerOpenNoteOption` | **Only if linked notes exist** | Opens linked note |

---

## UI Patterns

### Display Modes

**Linked Mode** (default, `tabAppearance: 'linked-mode'`):
- Compact favicon + title display
- Expandable cards for matching notes
- "Opened web notes" for virtual tabs
- Auxiliary sections (Recent, Domain, Subreddit, YouTube, Twitter, GitHub)
- **Uses DOM reconciliation to preserve expanded state and minimize flashing**

**Notes Mode** (`tabAppearance: 'notes'`):
- Detailed cards with URL display
- Full note matching results inline
- Full re-render on each update (simpler, no reconciliation)

### DOM Reconciliation (Linked Mode)

**Expected behavior:**
- Linked mode preserves expanded/collapsed states during updates
- Only changed elements are modified; unchanged tabs are left in place
- Tab elements are keyed by `data-tab-key` attribute (`group:<url>` or `leaf:<leafId>`)

**Known limitation:**
- Favicon icons may briefly flash when new tabs are created. This is a visual artifact of DOM creation, not reconciliation failure.

```typescript
// Reconciliation loop pattern
for (const group of groups) {
    let tabEl = currentElements.get(key);
    if (tabEl) {
        this.updateTab(tabEl, firstTab, group.all); // Update in place
        tabListContainer.appendChild(tabEl);         // Preserve order
    } else {
        this.renderTab(tabListContainer, firstTab, group.all); // Create new
    }
}
// Remove stale elements
for (const [key, el] of currentElements) {
    if (!newKeys.has(key)) el.remove();
}
```

### "New Web Viewer" Button Placement (CRITICAL)

> [!CAUTION]
> This button placement has regressed 8+ times. Follow these rules EXACTLY.

**DOM Order in linked mode (top to bottom):**
1. Pinned tabs section (if enabled)
2. `web-sidecar-linked-tabs` — Tab list container (all web viewer tabs)
3. `web-sidecar-new-tab-btn` — "New web viewer" button row
4. `web-sidecar-virtual-section` — "Opened web notes" heading + virtual tabs
5. Auxiliary sections (Recent, Domain, etc.)

**Rules:**
- The "New web viewer" button MUST appear **immediately after** the last web viewer tab
- The button MUST appear **before** the "Opened web notes" heading
- If there are no web viewer tabs, the button is the topmost element (besides nav-header and pinned)
- New tabs created via this button should appear **immediately above** this button row

**Implementation:**
```typescript
// Use explicit insertBefore/after, NOT createDiv (which just appends)
tabListContainer.after(newTabBtn);  // Button after tabs
newTabBtn.after(virtualSection);    // Virtual section after button
```

### Nav-Header Buttons

The nav-header toolbar contains these buttons (left to right):

| Button | Icon | Action |
|--------|------|--------|
| New Web Viewer | `plus` | Open new blank web viewer |
| Expand/Collapse Toggle | `unfold-vertical` / `fold-vertical` | Toggle expand/collapse all tab notes |
| Sort | `clock` / `arrow-down-az` | Toggle between focus-time and alphabetical |
| Refresh | `refresh-cw` | Force rescan all web viewers |

> [!IMPORTANT]
> There are TWO "New web viewer" buttons: one in nav-header (plus icon) and one inline button below tabs. Both must always be present.

### Click Behaviors

| Area | Regular Click | Shift+Click | Cmd/Ctrl+Click |
|------|---------------|-------------|----------------|
| Tab header | Focus that web viewer | — | — |
| Note title | Open note (smart) | Force new tab | Open in popout window |
| URL snippet | Open in web viewer (or focus existing) | Force new tab | Open in popout window |

### Smart Note Opening (`openNoteSmartly`)

1. Cmd/Ctrl+Click → popout window
2. Shift+Click → force new tab
3. Check if note already open → focus existing
4. Otherwise → respect `noteOpenBehavior` setting (`split` or `tab`)

**Split behavior (important):** When `noteOpenBehavior === 'split'`, the plugin uses `getOrCreateRightLeaf()` which:
- Checks if another tab group already exists in the same window
- If found, creates a new tab in that existing group (avoids infinite splits)
- Only creates a new vertical split if no other group exists

### Paired Opening (`openPaired`)

Opens web viewer + note side-by-side. **Available ONLY via right-click context menu.**

**Logic:**
1. Reuse existing blank web viewer if available
2. If none, **find existing "Left" group (containing web viewers)** and create new tab there
3. Navigate web viewer to URL
4. Open note per `noteOpenBehavior` setting (uses `getOrCreateRightLeaf()` for split mode)
5. If both already open, just focus the note

### "Open to the Right" / Split Reuse (CRITICAL)

**Goal:** Prevent infinite right-splits. Reuse the existing right-side group if one exists.

**Implementation (`getOrCreateRightLeaf`):**
1. Identify **Source Leaf**: Prioritize finding a `webviewer` leaf in the main area.
2. Identify **Target Group**: Look for a tab group that is **different from the Source**. Prioritize groups containing `markdown` views.
3. **Action**:
   - If Target exists → create new tab in that group.
   - If no Target exists → `workspace.createLeafBySplit(sourceLeaf, 'vertical')`.

---

## Drag-and-Drop Mechanics

### 1. MIME Type Filtering (Fixes Cross-Contamination)

**Problem:** Standard `ondragover` cannot read drag data, so drop zones for different types (tabs vs sections) used to cross-illuminate.
**Solution:** Use custom MIME types for type checking during drag.

- **Tabs:** `text/tab-id`
- **Sections:** `text/section-id`
- **Standard:** `text/plain` (Always include as fallback for API compatibility)

```typescript
// Handler checks types before adding visual class
if (e.dataTransfer?.types?.includes('text/tab-id')) {
    e.preventDefault();
    element.addClass('drag-over');
}
```

### 2. "Magic" Overlay Drop Zones (End of List)

**Problem:** Users need to drop items at the very end of a list, but creating a large visible drop zone looks "janky".
**Solution:** Create an **invisible overlay** that sits between elements or at the end.

- **Visuals:** `height: 4px` (minimal gap), `background: transparent`.
- **Hit Target:** `::after` pseudo-element with `top: -12px; bottom: -12px` creating a large invisible catch area.
- **Drag Over:** On active drag, collapse to `height: 0` and show `border-top: 2px solid accent`.

### 3. Data Persistence on Drop

**Critical Rule:** Every drop handler must:
1. Update the local settings object (reorder arrays).
2. Call `void this.view.saveSettingsFn()` immediately.
3. Call `this.view.onRefresh()` to update the UI.

---

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `urlPropertyFields` | `string[]` | `['source', 'url', 'URL']` | Frontmatter properties to search for URLs |
| `primaryUrlProperty` | `string` | `'source'` | Property used when creating new notes |
| `enableTldSearch` | `boolean` | `true` | Show "Same domain" expanded matches |
| `newNoteFolderPath` | `string` | `''` | Default folder for new notes |
| `useVaultDefaultLocation` | `boolean` | `true` | Use Obsidian's default new note location |
| `recentNotesCount` | `number` | `10` | Notes shown when no web viewer is active |
| `tabSortOrder` | `'focus' \| 'title'` | `'focus'` | How to sort tracked tabs |
| `tabAppearance` | `'linked-mode' \| 'notes'` | `'linked-mode'` | UI mode |
| `noteOpenBehavior` | `'split' \| 'tab'` | `'split'` | How notes open from sidebar |
| `collapseDuplicateUrls` | `boolean` | `false` | Collapse duplicate URL tabs |
| `enablePinnedTabs` | `boolean` | `true` | Enable pinned tabs feature |
| `enableSubredditExplorer` | `boolean` | `false` | Show subreddit grouping section |
| `enableYouTubeChannelExplorer` | `boolean` | `false` | Show YouTube channel grouping section |
| `enableTwitterExplorer` | `boolean` | `false` | Show Twitter/X user grouping section |
| `enableGithubExplorer` | `boolean` | `false` | Show GitHub repo grouping section |
| `sectionOrder` | `string[]` | `['recent', 'domain', 'subreddit', 'youtube', 'twitter', 'github']` | Drag-to-reorder section order |
| `domainSortOrder` | `'alpha' \| 'count' \| 'recent'` | `'alpha'` | Domain section sort preference |
| `subredditSortOrder` | `'alpha' \| 'count' \| 'recent'` | `'alpha'` | Subreddit section sort preference |
| `youtubeChannelSortOrder` | `'alpha' \| 'count' \| 'recent'` | `'alpha'` | YouTube section sort preference |
| `twitterSortOrder` | `'alpha' \| 'count' \| 'recent'` | `'alpha'` | Twitter section sort preference |
| `githubSortOrder` | `'alpha' \| 'count' \| 'recent'` | `'alpha'` | GitHub section sort preference |

### Experimental Settings

| Setting | Description |
|---------|-------------|
| `enableWebViewerActions` | Master toggle for header injection features |
| `showWebViewerHeaderButton` | New Web Viewer button in header |
| `showWebViewerNewNoteButton` | New note button in header |
| `showWebViewerOpenNoteButton` | Open note button (dynamic, conditional) |
| `showWebViewerMenuOption` | New Web View Tab in More Options menu |
| `showWebViewerOpenNoteOption` | Open note in More Options menu (conditional) |

---

## CSS Guidelines

### Avoid Visual Clutter

- **No uppercase text** in section headers
- Use `letter-spacing: 0.2px` instead of `0.5px`
- Use 13px font size for section headers

```css
.web-sidecar-section h5 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.2px;
    /* NO text-transform: uppercase */
}
```

### Active Tab Highlighting

```css
.web-sidecar-linked-tab.is-active .web-sidecar-linked-tab-row {
    background-color: var(--background-modifier-active-hover);
    border-left: 2px solid var(--interactive-accent);
    margin-left: -2px;
}
```

### Pinned Tabs Width Consistency (CRITICAL)

Pinned tabs MUST match the width of regular tabs. Both sections use negative margins to extend edge-to-edge:

```css
.web-sidecar-linked-tabs {
    margin: 0 -8px 8px -8px;
}

.web-sidecar-pinned-section {
    margin: 0 -8px 8px -8px; /* Must match linked-tabs */
}
```

### Avoid Title Attributes

**User preference:** Do not use `title` attributes for tooltips. Use only `aria-label` for accessibility.

```typescript
// ✅ Correct
badge.setAttribute('aria-label', '3 Notes');

// ❌ Avoid
badge.setAttribute('title', '3 Notes');
```

### Tooltip Pattern: Show Current State

For sort buttons and similar state indicators, tooltips should describe the **current state**, not the next action:

```typescript
// ✅ Correct — tells user what they're looking at
attr: { 'aria-label': 'Sorted by name' }

// ❌ Avoid — confusing
attr: { 'aria-label': 'Sort by count' }
```

### Hover-Reveal Buttons

Link buttons on domain/subreddit rows appear on hover:

```css
.web-sidecar-group-link-btn {
    opacity: 0;
    transition: opacity 0.15s ease;
}

.web-sidecar-domain-row:hover .web-sidecar-group-link-btn {
    opacity: 1;
}
```

### Icon Hover Stability

SVGs inside buttons must not capture pointer events:
```css
.web-sidecar-sort-btn svg,
.web-sidecar-refresh-btn svg {
    pointer-events: none;
}
```

---

## Common Pitfalls

### ❌ Re-rendering on every poll
**Problem:** Destroys DOM, causes collapsible sections to reset, breaks hover states.
**Solution:** Implement change detection; only call `render()` when data changes.

### ❌ Button pulsing in header
**Problem:** Dynamic button (Open Note) flickers on every poll cycle.
**Solution:** Check `data-note-path` attribute before rebuilding button.

### ❌ Focus race conditions
**Problem:** Clicking sidebar steals focus from web viewer.
**Solution:** Track `isInteracting` flag, ignore self-focus events.

### ❌ Type errors with view state
**Problem:** `state.url` or `state.title` might not be strings.
**Solution:** Always type-check: `typeof state?.url === 'string'`

### ❌ Opening duplicate tabs
**Problem:** Clicking URL opens new tab even if already open.
**Solution:** Check all web viewer leaves for matching URL before creating new.

### ❌ Invalid titles displayed
**Problem:** Shows `data:text/plain,` as title.
**Solution:** Filter titles with `isValidTitle()` before display.

### ❌ Floating promises
**Problem:** Lint errors and swallowed errors.
**Solution:** Always `void` or `await` promises. See ESLint section.

---

## Context Menu Items

### Web Viewer Tab Context Menu (`WebViewerContextMenu.ts`)
- Open in new web viewer
- Open in default browser
- Open in new window
- Open to the right
- Pin web view (if enabled)
- New linked note from URL
- *(separator)*
- Close web view
- Close all linked web views
- Close all linked notes (if any)
- Close all web views + linked notes (if any)
- *(separator, if redirect detected)*
- Update linked note(s) url to current view
- *(separator)*
- Copy URL

### Note Context Menu (`NoteContextMenu.ts`)

**IMPORTANT:** Context menu must be attached to the entire `<li>` item, not just the link or URL snippet.

**Menu items:**
- Open note in new tab
- Open note in new window
- Open note to the right
- Reveal note in navigation
- Copy full path
- *(separator)*
- Close this note (if open)
- Close all linked notes
- Close linked web view (if URL open)
- Close all linked web views
- *(separator)*
- Open URL in web viewer
- Open in default browser
- **Open web view + note pair**
- Copy URL

### Virtual Tab Context Menu (`VirtualTabContextMenu.ts`)

**IMPORTANT:** Virtual tabs ("Opened web notes") MUST have a context menu.

**Menu items:**
- Open in new web viewer
- Open in default browser
- Open in new window
- Open to the right
- **Pin web view** *(if pinned tabs enabled)*
- *(separator)*
- Open web viewer + note pair
- New linked note from URL
- *(separator)*
- Copy URL
- Reveal note in navigation

### Pinned Tab Context Menu (`PinnedTabContextMenu.ts`)

**Menu items:**
- Open in new web viewer
- Open in default browser
- Open in new window
- Open to the right
- New linked note from URL
- *(separator)*
- Close web view (if open)
- Close all linked web views
- Close all linked notes (if any)
- Close all web views + linked notes (if any)
- *(separator)*
- Unpin web view
- *(separator, if redirect detected)*
- Reset to pinned URL
- Update linked notes to current URL
- Save current URL as pinned
- *(separator)*
- Copy URL
- Copy pinned URL (if different)

### Domain/Subreddit Group Context Menu (`GroupContextMenu.ts`)

**Menu items:**
- Open youtube.com / Open r/AffinityPhoto (dynamic)
- Open in new window
- Open to the right
- *(separator)*
- Copy URL

---

## Testing Checklist

- [ ] Open multiple web viewer tabs → all appear in sidebar
- [ ] Navigate within a tab → URL updates without user action
- [ ] Click tab header → focuses correct web viewer
- [ ] Click "Same domain" → expands and stays expanded
- [ ] Hover sort/refresh buttons → stable hover, no flicker
- [ ] Click URL snippet → opens or focuses existing tab
- [ ] Click note title + Cmd → opens in popout window
- [ ] Virtual tabs display for open notes with URLs
- [ ] Open Note header button appears only when linked notes exist
- [ ] Open Note button does NOT pulse while hovering
- [ ] Paired opening via context menu works correctly
- [ ] Active tab is highlighted in sidebar
- [ ] No uppercase text in section headers
- [ ] Auxiliary section sort buttons cycle through alpha → count → recent
- [ ] Sort preferences persist after vault reload
- [ ] Domain row link icon appears on hover, opens domain in web viewer
- [ ] Right-click domain row shows context menu with "Open youtube.com"
- [ ] Pinned tabs appear above regular tabs
- [ ] Clicking pinned tab focuses or opens associated web viewer
- [ ] Pinned tab redirect detection works correctly

---

## Future Considerations

1. **New tab interception** — User requested intercepting Cmd+T when web viewer focused. Not feasible with current Obsidian API.

2. **Favicon caching** — Currently uses Google's favicon service. Consider caching locally for offline/privacy.

3. **Tag-based filtering** — Show only notes with specific tags matching current domain.

4. **Icon flashing fix** — The default globe icon flashes when tabs are created/updated. A more granular update strategy could help.

---

## Code Quality Standards

- **No verbose comments.** If a comment requires multiple paragraphs, consider whether the code itself can be clearer.
- **Use `onclick` over `addEventListener`** for elements that may be updated in place. Easier to overwrite handlers.
- **Always test click behavior** after render logic changes. Focus races and destroyed-DOM issues are common.
- **Respect user interaction state.** Never re-render while `isInteracting` is true unless explicitly forced.
- **Every action that modifies leaves must trigger a refresh.** This is the most common source of "stale UI" bugs.
- **Test sort and refresh buttons** with expanded sections. They must not collapse.
- **Run `npm run lint` before committing.** Zero tolerance for lint errors.
