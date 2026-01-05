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

## Plugin Overview

**Web Sidecar** is a sidebar companion for Obsidian's web viewers. It:
- Tracks all open web viewer tabs (native `webviewer` and Surfing plugin `surfing-view`)
- Displays matching notes from the vault for each tracked URL
- Shows "Virtual Tabs" for open notes with URL properties (but no active web viewer)
- Provides quick actions: create notes, open URLs, focus tabs, open paired view
- Injects experimental header buttons and menu items into web viewer panes

---

## Architecture

```
src/
├── main.ts                       # Plugin lifecycle, event registration
├── types.ts                      # Interfaces (TrackedWebViewer, IWebSidecarView, Settings)
├── views/
│   ├── webSidecarView.ts         # Main ItemView sidebar (implements IWebSidecarView)
│   └── components/
│       ├── ContextMenus.ts       # All context menu definitions
│       ├── NoteRenderer.ts       # Renders note items in lists
│       ├── SectionRenderer.ts    # Renders collapsible sections (Recent, Domain groups)
│       └── tabs/
│           ├── TabListRenderer.ts    # "Notes mode" tab list rendering
│           └── BrowserTabRenderer.ts # "Browser mode" compact tab rendering
├── services/
│   ├── TabStateService.ts        # Tracks all web viewer tabs with focus timestamps
│   ├── NavigationService.ts      # Handles opening notes/URLs, paired opening, focus
│   ├── UrlIndex.ts               # Fast URL-to-note lookup index
│   ├── noteMatcher.ts            # Searches vault metadata for URL matches
│   └── urlUtils.ts               # URL normalization, domain extraction
├── experimental/
│   └── WebViewerManager.ts       # Injects header buttons and menu items into web viewers
├── modals/                       # Modal dialogs (CreateNoteModal, etc.)
└── settings/                     # Settings tab and configuration
```

---

## Core Behaviors

### 1. Tab Tracking

**Expected behavior:**
- All open `webviewer` and `surfing-view` leaves are tracked
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

### 2a. Content Capture with Defuddle

**Purpose:** When creating new linked notes from web pages, extract and include clean page content as Markdown.

**Implementation:**
- Uses [Defuddle](https://github.com/kepano/defuddle) — the same content extraction library used by Obsidian's "Save to vault" feature
- Defuddle removes navigation, ads, sidebars, footers, and other cruft
- Only the main article content is extracted and converted to Markdown

**Flow:**
1. Capture full page HTML via `document.documentElement.outerHTML`
2. Parse HTML into DOM using `DOMParser`
3. Run Defuddle to extract main content: `new Defuddle(doc).parse().content`
4. Convert clean HTML to Markdown using Obsidian's `htmlToMarkdown()`
5. Include Markdown in newly created note

**Entry points:**
- Header button: `file-plus` icon in web viewer action row
- Context menu: Right-click tab → "New linked note from URL"
- Virtual tab menu: Right-click → "New linked note from URL"

**Setting:** `capturePageContent` (default: true, desktop-only)

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

### 5. Sidebar Focus Bug Prevention

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

### 6. Active Tab Highlighting

**Expected behavior:**
- The currently focused web viewer tab is visually highlighted in the sidebar
- Highlighting uses `is-active` class with accent border and bolder text

**Key fixes:**
- Track `lastActiveLeaf` as a fallback when sidebar gains focus
- Ignore `active-leaf-change` events where `leaf === this.leaf` (sidebar itself)

### 6a. Note Focus Indicator (Blue Dot)

**Expected behavior:**
- When a note (linked to a web viewer URL) is focused in the editor, a blue dot appears to its left in the sidecar
- Only shows for exact-match notes in the expanded notes list
- Uses `is-focused` class with CSS `::before` pseudo-element

**Implementation notes:**
- In `renderBrowserTabNotes()`, check if each note's file path matches the active leaf's file
- Uses `lastActiveLeaf` fallback when sidecar itself is focused
- CSS: `.web-sidecar-browser-note-list li.is-focused::before` with accent-colored dot

### 6b. Note Tab Cycling

**Expected behavior:**
- When clicking a note that has multiple open tabs, cycling through each instance
- Similar pattern to `focusNextInstance` for web viewer tabs
- First click focuses first instance, subsequent clicks cycle to next

**Implementation notes:**
- `NavigationService.focusNextNoteInstance(filePath: string)` handles cycling
- Uses `noteCycleIndex: Map<string, number>` to track position
- If only one instance exists, just focuses it (no cycling)

### 7. Immediate UI Refresh After Actions

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

### 8. State Persistence for Collapsible Sections

**Expected behavior:**
- Expanded sections remain expanded after refresh/sort operations
- Individual domain/subreddit groups maintain their expanded state
- Sort buttons do NOT collapse everything

**Implementation notes:**
- Store expanded state in `WebSidecarView`: `isRecentNotesOpen`, `isDomainGroupOpen`, `isSubredditExplorerOpen`, `expandedGroupIds: Set<string>`
- Apply `details.setAttribute('open', '')` on render if state is true
- Listen to `details.addEventListener('toggle', ...)` to track state changes
- Use unique IDs like `domain:example.com` or `subreddit:r/obsidianmd` for group tracking

### 9. Auxiliary Section Sorting

**Expected behavior:**
- Domain groups and subreddit groups each have independent 3-way sort cycling
- Sort cycles: **alpha → count → recent → alpha**
- **Tooltip shows current state** ("Sorted by name"), NOT next action ("Sort by count")
- Sort preferences persist across vault reloads

**Implementation notes:**
- Store sort preferences in settings: `domainSortOrder`, `subredditSortOrder`
- Save settings immediately when user clicks sort button
- Initialize view sort state from settings in `onOpen()`
- Recency sort uses `file.stat.mtime` (already cached by Obsidian, no overhead)

```typescript
// Helper to get max mtime of notes in a group
const getMaxMtime = (notes: MatchedNote[]) => {
    return Math.max(...notes.map(n => n.file.stat.mtime));
};

// Sort by recency: most recently modified note in each group
if (sortMode === 'recent') {
    return getMaxMtime(b.notes) - getMaxMtime(a.notes);
}
```

### 10. Domain/Subreddit Quick Navigation

**Expected behavior:**
- Each domain row (e.g., `youtube.com`) and subreddit row (e.g., `r/AffinityPhoto`) has:
  - **Right-click context menu** with options to open the homepage/subreddit in web viewer
  - **Link icon** (🔗) to the left of the note count, visible on hover
- Clicking the link icon opens the domain/subreddit directly in a new web viewer
- Context menu title shows specific domain: "Open youtube.com" (not "Open domain homepage")

**Implementation notes:**
- Link button uses class `web-sidecar-group-link-btn` with hover-reveal CSS
- Context menus: `ContextMenus.showDomainContextMenu()`, `ContextMenus.showSubredditContextMenu()`
- Subreddit URLs use format: `https://reddit.com/r/subredditName`

### 11. Section Cleanup Before Re-render

**Expected behavior:**
- No duplicate sections appear after refresh
- Collapsible sections are cleanly replaced, not appended

**Implementation notes:**
- Before creating a section, check for and remove existing:
```typescript
const existingSection = container.querySelector('[data-section-type="domain-groups"]');
if (existingSection) existingSection.remove();
```
- Use `data-section-type` attributes to identify sections uniquely

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

**Basic Tabs Mode** (default, `tabAppearance: 'basic'`):
- Vertical tabs only (favicon + title)
- No note expansion, no virtual tabs section
- No note counts, new note buttons, or expand chevrons
- Auxiliary sections still render normally (controlled by separate settings)
- Uses same renderer as Browser Mode with `isBasicMode` flag

**Browser Mode** (`tabAppearance: 'browser'`):
- Compact favicon + title display
- Expandable cards for matching notes
- "More web notes" collapsible sections
- **Uses DOM reconciliation to preserve expanded state and minimize flashing**

**Notes Mode** (`tabAppearance: 'notes'`):
> [!NOTE] Developer Only
> This mode is currently hidden unless a `.hotreload` file is present in the plugin directory.
- Detailed cards with URL display
- Full note matching results inline
- Full re-render on each update (simpler, no reconciliation)

### DOM Reconciliation (Browser Mode)

**Expected behavior:**
- Browser mode preserves expanded/collapsed states during updates
- Only changed elements are modified; unchanged tabs are left in place
- Tab elements are keyed by `data-tab-key` attribute (`group:<url>` or `leaf:<leafId>`)

**Known limitation:**
- Favicon icons may briefly flash when new tabs are created. This is a visual artifact of DOM creation, not reconciliation failure.
- TODO exists in `BrowserTabRenderer.ts` for future optimization.

```typescript
// Reconciliation loop pattern
for (const group of groups) {
    let tabEl = currentElements.get(key);
    if (tabEl) {
        this.updateBrowserTab(tabEl, firstTab, group.all); // Update in place
        tabListContainer.appendChild(tabEl);               // Preserve order
    } else {
        this.renderBrowserTab(tabListContainer, firstTab, group.all); // Create new
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

**DOM Order in browser mode (top to bottom):**
1. `web-sidecar-browser-tabs` — Tab list container (all web viewer tabs)
2. `web-sidecar-new-tab-btn` — "New web viewer" button row
3. `web-sidecar-virtual-section` — "Opened web notes" heading + virtual tabs
4. `web-sidecar-recent-section` — Recent web notes section

**Rules:**
- The "New web viewer" button MUST appear **immediately after** the last web viewer tab
- The button MUST appear **before** the "Opened web notes" heading
- If there are no web viewer tabs, the button is the topmost element (besides nav-header)
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

### Header Controls

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
2. If none, **find existing "Left" group (containing web viewers)** and create new tab there (active focus might be on the "Right", so we must explicitly target the Left group)
3. Navigate web viewer to URL
4. Open note per `noteOpenBehavior` setting (uses `getOrCreateRightLeaf()` for split mode, passing the web viewer as source)
5. If both already open, just focus the note

### "Open to the Right" / Split Reuse (CRITICAL)

**Goal:** Prevent infinite right-splits. Reuse the existing right-side group if one exists.

**Implementation (`getOrCreateRightLeaf`):**
1. Identify **Source Leaf**:
   - Explicitly prioritize finding a `webviewer` leaf in the main area.
   - Do NOT default to `mainLeaves[0]` unconditionally, as markdown notes often appear first in the DOM sort order, causing the "Right" direction to be miscalculated as "Left".
2. Identify **Target Group**:
   - Look for a tab group that is **different from the Source**.
   - Prioritize groups containing `markdown` views (these are the likely "Right" group).
3. **Action**:
   - If Target exists → create new tab in that group.
   - If no Target exists → `workspace.createLeafBySplit(sourceLeaf, 'vertical')`. Explicitly splitting the *source* guarantees correct right-direction placement.

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

**Problem:** Users need to drop items at the very end of a list, but creating a large visible drop zone looks "janky" and wastes UI space.
**Solution:** Create an **invisible overlay** that sits between elements or at the end.

- **Visuals:** `height: 4px` (minimal gap), `background: transparent`.
- **Hit Target:** `::after` pseudo-element with `top: -12px; bottom: -12px` creating a large invisible catch area.
- **Drag Over:** On active drag, collapse to `height: 0` and show `border-top: 2px solid accent` to mimic a standard insertion line.

```css
.web-sidecar-drop-zone-end::after {
  content: '';  position: absolute;
  top: -12px; bottom: -12px; left: 0; right: 0;
  z-index: 10;
}
```

### 3. Data Persistence on Drop

**Critical Rule:** Every drop handler must:
1. Update the local settings object (reorder arrays).
2. Call `this.view.saveSettingsFn()` immediately.
3. Call `this.view.onRefresh()` to update the UI.
Without explicit save, the order reverts on reload (or sometimes instantly).

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `urlPropertyFields` | `string[]` | `['source', 'url', 'URL']` | Frontmatter properties to search for URLs |
| `primaryUrlProperty` | `string` | `'source'` | Property used when creating new notes |
| `enableTldSearch` | `boolean` | `true` | Show "Same domain" expanded matches |
| `newNoteFolderPath` | `string` | `''` | Default folder for new notes |
| `recentNotesCount` | `number` | `10` | Notes shown when no web viewer is active |
| `tabSortOrder` | `'focus' \| 'title'` | `'focus'` | How to sort tracked tabs |
| `tabAppearance` | `'browser' \| 'notes'` | `'browser'` | UI mode |
| `noteOpenBehavior` | `'split' \| 'tab'` | `'split'` | How notes open from sidebar |
| `collapseDuplicateUrls` | `boolean` | `false` | Collapse duplicate URL tabs |
| `enableSubredditFilter` | `boolean` | `false` | Filter domain matches by subreddit |
| `enableSubredditExplorer` | `boolean` | `false` | Show subreddit grouping section |
| `sectionOrder` | `string[]` | `['recent', 'domain', 'subreddit']` | Drag-to-reorder section order |
| `domainSortOrder` | `'alpha' \| 'count' \| 'recent'` | `'alpha'` | Domain section sort preference |
| `subredditSortOrder` | `'alpha' \| 'count' \| 'recent'` | `'alpha'` | Subreddit section sort preference |

### Experimental Settings

| Setting | Description |
|---------|-------------|
| `enableWebViewerActions` | Master toggle for header injection features |
| `showWebViewerHeaderButton` | New Web Viewer button in header |
| `showWebViewerNewNoteButton` | New Note button in header |
| `showWebViewerOpenNoteButton` | Open Note button (dynamic, conditional) |
| `showWebViewerMenuOption` | New Web View Tab in More Options menu |
| `showWebViewerOpenNoteOption` | Open Note in More Options menu (conditional) |

---

## CSS Guidelines

### Avoid Visual Clutter

- **No uppercase text** in section headers (user feedback: remove `text-transform: uppercase`)
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
.web-sidecar-browser-tab.is-active .web-sidecar-browser-tab-row {
    background-color: var(--background-modifier-active-hover);
    border-left: 2px solid var(--interactive-accent);
    margin-left: -2px;
}
```

### Pinned Tabs Width Consistency (CRITICAL)

Pinned tabs MUST match the width of regular browser tabs. Both sections use negative margins to extend edge-to-edge:

```css
/* Both browser tabs and pinned section use same margin for consistent width */
.web-sidecar-browser-tabs {
    margin: 0 -8px 8px -8px;
}

.web-sidecar-pinned-section {
    margin: 0 -8px 8px -8px; /* Must match browser-tabs */
}

/* Pinned notes container matches browser notes container */
.web-sidecar-pinned-notes {
    padding-left: 24px; /* Same as .web-sidecar-browser-notes */
    padding-bottom: 4px;
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

// ❌ Avoid — confusing, requires clicking to discover current state
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

---

## Context Menu Items

### Web Viewer Tab Context Menu
- Open in new web viewer
- Open in new window
- Open to the right
- Close web view
- Close all linked web views
- Copy URL

### Note Context Menu

**IMPORTANT:** Context menu must be attached to the entire `<li>` item, not just the link or URL snippet. This ensures consistent right-click behavior everywhere on the row.

```typescript
li.addEventListener('contextmenu', (e) => this.contextMenus.showNoteContextMenu(e, file, url));
```

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
- Open in web viewer
- **Open web viewer + note pair** ← Paired opening
- Copy URL

### Virtual Tab Context Menu

**IMPORTANT:** Virtual tabs ("Opened web notes") MUST have a context menu. It differs from the regular tab menu by excluding "close tab" options (no tab exists).

**Menu items:**
- Open in new web viewer
- Open in new window
- Open to the right
- **Pin web view** *(if pinned tabs enabled)* — Creates a pinned tab from this note's URL
- Open web viewer + note pair
- Copy URL
- Reveal note in navigation

**Implementation:** `ContextMenus.showVirtualTabContextMenu(event, url, file)`

### Domain Group Context Menu

**Menu items:**
- Open youtube.com (dynamic, shows actual domain)
- Open in new window
- Open to the right
- Copy URL

**Implementation:** `ContextMenus.showDomainContextMenu(event, domain)`

### Subreddit Group Context Menu

**Menu items:**
- Open r/AffinityPhoto (dynamic, shows actual subreddit)
- Open in new window
- Open to the right
- Copy URL

**Implementation:** `ContextMenus.showSubredditContextMenu(event, subreddit)`

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
- [ ] Domain/subreddit sort button cycles through alpha → count → recent
- [ ] Domain/subreddit sort preference persists after vault reload
- [ ] Domain row link icon appears on hover, opens domain in web viewer
- [ ] Right-click domain row shows context menu with "Open youtube.com"

---

## Future Considerations

1. **New tab interception** — User requested intercepting Cmd+T when web viewer focused. Not feasible with current Obsidian API without monkey-patching.

2. **Favicon caching** — Currently uses Google's favicon service. Consider caching locally for offline/privacy.

3. **Tag-based filtering** — Show only notes with specific tags matching current domain.

4. **Subreddit expansion** — Full subreddit note explorer with grouping by r/subreddit. *(Implemented)*

5. **Icon flashing fix** — The default globe icon flashes when tabs are created/updated. The current DOM reconciliation reduces but doesn't eliminate this. A more granular update strategy for the favicon container could help.

---

## Code Quality Standards

- **No verbose comments.** If a comment requires multiple paragraphs, consider whether the code itself can be clearer.
- **Use `onclick` over `addEventListener`** for elements that may be updated in place. Easier to overwrite handlers.
- **Always test click behavior** after render logic changes. Focus races and destroyed-DOM issues are common.
- **Respect user interaction state.** Never re-render while `isInteracting` is true unless explicitly forced.
- **Every action that modifies leaves must trigger a refresh.** This is the most common source of "stale UI" bugs.
- **Test sort and refresh buttons** with expanded sections. They must not collapse.
