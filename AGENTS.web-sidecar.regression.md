# Active Tab Highlighting & Sidecar Focus Regression

This document details the recurring regression regarding **Active Tab Highlighting** in the Web Sidecar and the specific architectural fixes required to prevent it.

---

## Tab Clickable Area Regression

**Symptom:** The bottom portion of tab rows (below the title text) is not clickable. Users expect to click anywhere on the tab row to select it, like in a normal browser.

**Cause:** `.web-sidecar-tab-drop-zone-end::after` pseudo-element had `z-index: 10` and extended `-12px` above and below the drop zone to create a large drag target. It always blocked clicks on the tabs above it - even when not dragging.

**Fix (2026-01-05):**
1. Replaced the `::after` pseudo-element approach with **padding** on the drop zone itself
2. Using `background-clip: content-box` to keep visual appearance minimal while having large hit area
3. Added `min-height: 28px` to both `.web-sidecar-browser-tab-row` and `.web-sidecar-pinned-tab-row`

```css
.web-sidecar-tab-drop-zone-end {
  height: 4px;
  padding: 10px 0;  /* Large padding creates hit area for drag */
  background-clip: content-box;  /* Only show background in content area */
}
```

**Why padding works:** Padding is part of the element's hit area for drag events, but doesn't block clicks on elements above/below like an absolutely-positioned pseudo-element with z-index does.

**Checklist:**
- [ ] Is the `::after` pseudo-element removed from drop zone?
- [ ] Does drop zone use padding for larger hit area?
- [ ] Can you click anywhere on the tab row to select it?
- [ ] Can you drag tabs to the bottommost position?

---

## Pinned Tabs Setting Toggle Regression

**Symptom:** When disabling pinned tabs in settings, the pinned tabs section stays visible. When re-enabling, tabs don't move back to the pinned section.

**Cause:** Two issues:
1. `PinnedTabRenderer.render()` returned early when disabled but didn't clean up the existing DOM
2. `TabStateService.getTrackedTabs()` filtered out pinned tab URLs regardless of whether the feature was enabled

**Fix (2026-01-04):**
1. `PinnedTabRenderer.render()` now removes the `.web-sidecar-pinned-section` element when disabled
2. `TabStateService.getTrackedTabs()` only filters out pinned tabs when `enablePinnedTabs` is `true`
3. `TabStateService.getVirtualTabs()` only excludes pinned URLs when `enablePinnedTabs` is `true`

**Checklist:**
- [ ] Does `PinnedTabRenderer.render()` remove the pinned section when disabled?
- [ ] Does `getTrackedTabs()` check `enablePinnedTabs` before filtering?
- [ ] Does `getVirtualTabs()` check `enablePinnedTabs` before filtering?

---

## The Problem
The active tab indicator in the sidecar frequently breaks due to the complex interaction between Obsidian's focus management, DOM events, and the Sidecar's own update logic.

## Key Challenges & Solutions

### 1. Focus Stealing (Race Condition)
**Symptom:** Clicking a tab in the sidecar fails to highlight it, or it highlights briefly and then reverts.
**Cause:** Clicking the sidecar gives focus to the Sidecar view. The command to focus the *Web Tab* runs, but if the Sidecar's focus event happens slightly later (or battles it), the Sidecar wins, making `activeLeaf` equal to Sidecar.
**Fix:** Wrap the `focusTab` command in a `setTimeout(..., 50)`.
```typescript
// BrowserTabItemRenderer.ts
setTimeout(() => {
    this.view.focusTab(tab);
}, 50);
```
This ensures the Sidecar's click/focus processing is complete before we attempt to switch focus.

### 2. Interaction Blocking
**Symptom:** Active tab doesn't update when clicking inside the sidecar, but works when clicking elsewhere.
**Cause:** `WebSidecarView.render()` has a check `if (this.isInteracting) return;` to prevent jank during hover/scroll. Clicking implies hovering, so `render` was blocked during clicks.
**Fix:** Pass `force: boolean` to `render()`.
```typescript
// WebSidecarView.ts
render(force?: boolean): void {
    if (this.isInteracting && !force) return;
    // ...
}
```

### 3. DOM Destruction on Click (The "Double Click" Bug)
**Symptom:** User must click twice to trigger an action.
**Cause:**
1. MouseDown on Sidecar -> Focus Sidecar.
2. `active-leaf-change` fires.
3. Listener calls `render(true)`.
4. DOM is destroyed and rebuilt *before* MouseUp/Click fires.
5. The click hits a dead element.
**Fix:** Ignore `active-leaf-change` if the new leaf is the Sidecar itself.
```typescript
// WebSidecarView.ts
this.app.workspace.on('active-leaf-change', (leaf) => {
    if (leaf === this.leaf) return; // Don't destroy DOM on self-focus
    this.render(true);
});
```

### 4. Persistence During Sidecar Interaction
**Symptom:** Clicking "Sort" or "Refresh" in the header clears the active tab highlight.
**Cause:** Interacting with header buttons focuses the Sidecar, making `activeLeaf` = Sidecar. The active check `activeLeaf === tab.leaf` fails for all tabs.
**Fix:** Track `lastActiveLeaf` in the view and use it as a fallback.
```typescript
// WebSidecarView.ts
if (leaf && leaf !== this.leaf) {
    this.lastActiveLeaf = leaf;
}

// BrowserTabItemRenderer.ts
if (activeLeaf === this.view.leaf && this.view.lastActiveLeaf) {
    activeLeaf = this.view.lastActiveLeaf;
}
```

### 5. Robust Active Check
**Symptom:** `activeLeaf === tab.leaf` checks fail intermittently due to reference changes.
**Fix:** Prefer ID-based comparison.
```typescript
const activeLeafId = (activeLeaf as any).id;
if (activeLeafId && tab.leafId === activeLeafId) {
    isActive = true;
}
```

## Checklist for Regressions
If this breaks again, verify:
- [ ] Is `setTimeout` still present in click handlers?
- [ ] Is `active-leaf-change` forcing a render?
- [ ] Is `active-leaf-change` IGNORED when `leaf === this.leaf`?
- [ ] Is `lastActiveLeaf` fallback logic in place?

---

## "New Web Viewer" Button Placement Regression

This has regressed **8+ times**. The button keeps moving above the tabs instead of below.

### The Problem
The "New web viewer" button row must appear:
- **AFTER** all web viewer tabs
- **BEFORE** the "Opened web notes" virtual section

### Why It Regresses
Using `container.createDiv()` just appends elements, causing incorrect order when elements are created in different sequence across code paths.

### The Fix
Use explicit DOM insertion order with `element.after()`:

```typescript
// BrowserTabRenderer.ts - renderBrowserModeTabList()
// CRITICAL: Enforce exact DOM order

// 1. Tab list container exists/created first
tabListContainer.after(newTabBtn);       // Button immediately after tabs
newTabBtn.after(virtualSection);         // Virtual section after button
```

### Checklist
- [ ] Is `tabListContainer.after(newTabBtn)` being called?
- [ ] Is `newTabBtn.after(virtualSection)` being called?
- [ ] Are we NOT using `container.createDiv()` for these elements?

---

## Tab Sync Delay Regression (Virtual Tabs & Aux Links)

New tabs (specifically from virtual tabs, domain links, or subreddit links) don't appear immediately in the sidecar after creation.

### The Problem
When clicking a virtual tab or "New web viewer", the UI doesn't show the new tab until clicking again or waiting for a poll cycle.

### Why It Happens
Obsidian's workspace doesn't immediately register new leaves. A single refresh call happens before the leaf exists or is fully registered.
Additionally, manual `setViewState` calls in event handlers (in `BrowserTabItemRenderer` or `SectionRenderer`) bypassed the centralized refresh logic.

### The Fix
1.  **Use `openUrlSmartly`**: Always use the service method instead of manually creating leaves in click handlers.
    *   Virtual Tabs (`BrowserTabItemRenderer`)
    *   Domain/Subreddit Links (`SectionRenderer`)
2.  **Dual Refresh Pattern**: Use immediate refresh + delayed refresh.

```typescript
// NavigationService.ts
async openUrlSmartly(url: string, e: MouseEvent): Promise<void> {
    // ... open logic ...
    
    // CRITICAL: Immediate refresh
    this.isManualRefreshCallback(true);
    this.onRefreshCallback();

    // Delayed refresh to catch late registration
    await new Promise(resolve => setTimeout(resolve, 100));
    this.isManualRefreshCallback(true);
    this.onRefreshCallback();
}
```

### Checklist
- [ ] Are click handlers calling `openUrlSmartly` instead of `setViewState` directly?
- [ ] Is `setActiveLeaf` being called after reveal?
- [ ] Is there an immediate refresh BEFORE the delay?
- [ ] Is there a second refresh AFTER a 100ms delay?
- [ ] Is `isManualRefreshCallback(true)` set before EACH refresh call?

---

## Nav-Header Plus Button

The nav-header must have a plus icon button for creating new web viewers.

### The Fix
```typescript
// webSidecarView.ts - createNavHeader()
// New Web Viewer button (leftmost)
const newViewerBtn = buttonContainer.createEl('div', {
    cls: 'clickable-icon nav-action-button',
    attr: { 'aria-label': 'New web viewer' }
});
setIcon(newViewerBtn, 'plus');
newViewerBtn.onclick = () => this.openNewWebViewer();
```

### Checklist
- [ ] Is the plus button being created in `createNavHeader()`?
- [ ] Is it positioned BEFORE (leftmost) the expand/collapse button?
- [ ] Does clicking it call `openNewWebViewer()`?

---

## Missing Auxiliary Sections on Reload

**Symptom:** Auxiliary sections (Recent, Domains, etc.) are empty/missing when Obsidian first loads, but appear if you modify a file or manually refresh.

**Cause:** `UrlIndex` initializes synchronously in code but `getAllFilesWithUrls()` returns empty because initialization depends on scanning the vault which might happen after the view's first render. The view `onOpen` runs before the index is populated.

**Fix:**
1. `UrlIndex` must be an event emitter (`extends Events`).
2. `UrlIndex` must emit an event (e.g., `'index-updated'`) when it finishes its initial scan and whenever files update.
3. The main `WebSidecarPlugin` must listen for this event and trigger `refreshState()`.

```typescript
// services/UrlIndex.ts
updateFileIndex(...) {
   // ... update logic
   if (hasChanges && !suppressEvent) this.trigger('index-updated');
}
rebuildIndex() {
   // ... loop
   this.trigger('index-updated');
}

// main.ts
this.urlIndex.on('index-updated', () => {
     this.tabStateService.refreshState();
});
```

> [!NOTE]
> **2026-01-03**: Fixed - `SectionRenderer.renderEmptyState()` was only calling `renderRecentWebNotesSection()`. Changed to call `renderAuxiliarySections()` which renders all sections (recent, domain, subreddit, tags).

---

## Infinite Refresh Loop (Expand/Collapse & Toggle)

**Symptom:** Clicking "Expand All", toggling a section, or sorting causes the UI to flicker, revert state (expand -> collapse -> expand), or hang the browser (Violation: handler took 400ms+).

**Cause:**
1. State setters (e.g. `setDomainGroupOpen`) called `this.saveSettings()`.
2. `saveSettings()` in `main.ts` was implemented to call `await this.saveData(...)` AND THEN `this.urlIndex.rebuildIndex()` AND `this.tabStateService.refreshState()`.
3. This creates a cycle: specific interaction -> save -> GLOBAL REBUILD -> refresh -> re-render.
4. The global rebuild is expensive and unnecessary for valid UI state changes (which don't change data).
5. The re-render destroys the DOM element that triggered the event, confusing the browser or causing double-invocations.

**Fix:**
Pass a lightweight save callback to the View that *only* writes to disk, avoiding the heavy rebuild/refresh cycle for pure UI state changes.

```typescript
// main.ts
this.view = new WebSidecarView(
    // ...
    async () => { await this.saveData(this.settings); } // LIGHTWEIGHT CALLBACK
);
```

**Checklist:**
- [ ] Does `WebSidecarView` use a lightweight save callback?
- [ ] Are `onRefresh()` calls removed from simple toggle setters (letting CSS/details element handle it)?

---

## Split Direction Logic Inversion

**Symptom:** "Open to the right" sometimes opens the note to the LEFT of the Web Viewer.
**Cause:** `getOrCreateRightLeaf` defaulted to using the first leaf in the main area as the "Source" reference. Obsidian often sorts Markdown leaves before WebViewer leaves in its internal tracking, so the Markdown note became the "Source". The Web Viewer was then identified as the "Target" (different group), so the new note opened *next to* the Web Viewer, effectively appearing on the Left.
**Fix:** Explicitly prioritize finding a `webviewer` leaf to use as the Source reference.
```typescript
// NavigationService.ts
const webViewerLeaf = mainLeaves.find(l => l.view.getViewType() === 'webviewer');
sourceLeaf = webViewerLeaf || mainLeaves[0]!;
```

---

## Inconsistent Pair Opening ("The Toggle Bug")

**Symptom:** Opening sequential Web+Note pairs results in alternating layouts (Web|Note → Note|Web → Web|Note).
**Cause:** `openPaired` created the new Web Viewer in the *currently active* leaf. If the user just focused a Note in the Right group, the new Web Viewer appeared in the Right group. Then `getOrCreateRightLeaf` correctly found the Left group as "Different", putting the new Note there.
**Fix:** Strictly enforce that new Web Viewers are created in the "Left" (Web Viewer) group if it exists.
```typescript
// NavigationService.ts
if (mainLeaves.length > 0) {
     const webGroupLeaf = mainLeaves.find(l => l.view.getViewType() === 'webviewer');
     if (webGroupLeaf) {
         parentLeaf = webGroupLeaf; // FORCE Left group
     }
}
webLeaf = this.app.workspace.createLeafInParent(parentLeaf.parent, -1);
```

---

## Duplicate Refresh Icons

**Symptom:** Refresh icons appear in multiple places (empty states, section headers) AND the main nav-header.
**Fix:** Removed all localized refresh buttons. The nav-header refresh button is the single source of truth.

---

## Drag-and-Drop Cross-Contamination

**Symptom:** Dragging a Web Viewer tab highlights Auxiliary Section drop zones (and vice versa).
**Cause:** HTML5 `ondragover` cannot access `dataTransfer.getData()`, so generic drop zones couldn't verify the item type.
**Fix:** Use distinctive MIME types in `setData` during `dragstart`.
*   Tabs: `text/tab-id`
*   Sections: `text/section-id`
*   `ondragover` checks `e.dataTransfer.types.includes('text/tab-id')`.

---

## Drop Zone Usability (End of List)

**Symptom:** Hard to drop items at the very end of the list; UI looks "janky" with large visible gaps.
**Fix:** Implemented "Magic Overlay" drop zones.
*   **Visual:** `height: 4px`, `background: transparent` (looks like standard gap).
*   **Interaction:** `::after` pseudo-element with `top: -12px; bottom: -12px` creates a large invisible hit target.
*   **Feedback:** collapsing to `height: 0` + `border-top` on drag-over mimics standard insertion line.

---

## New Web Viewer Ignores Homepage Setting

**Symptom:** Creating a new web viewer tab always loads `about:blank` instead of the homepage configured in Obsidian's Web Viewer settings.
**Cause:** Multiple places in the codebase hardcoded `about:blank` when creating new web viewers.
**Fix:** Created `webViewerUtils.ts` with `getWebViewerHomepage(app)` function that reads the homepage from Obsidian's internal webviewer plugin settings (`app.internalPlugins.getPluginById('webviewer').options.homepage`).

**Files updated:**
*   `NavigationService.ts` - `openNewWebViewer()`
*   `ButtonInjector.ts` - `openNewWebViewer()`
*   `MenuInjector.ts` - `openNewWebViewer()`
*   `WebViewerManager.ts` - `addMenuItems()`

**Code pattern:**
```typescript
import { getWebViewerHomepage } from '../services/webViewerUtils';

// Instead of:
state: { url: 'about:blank', navigate: true }

// Use:
const homepage = getWebViewerHomepage(this.app);
state: { url: homepage, navigate: true }
```

### Checklist
- [ ] Is `getWebViewerHomepage()` being called before creating new web viewers?
- [ ] Did you check all four files where `openNewWebViewer` or similar functions exist?
- [ ] Falls back to `about:blank` if homepage setting is unavailable?

