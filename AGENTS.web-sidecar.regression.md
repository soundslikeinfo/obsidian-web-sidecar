# Active Tab Highlighting & Sidecar Focus Regression

This document details the recurring regression regarding **Active Tab Highlighting** in the Web Sidecar and the specific architectural fixes required to prevent it.

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

## Tab Sync Delay Regression

New tabs don't appear immediately in the sidecar after creation.

### The Problem
When clicking "New web viewer", the UI doesn't show the new tab until clicking again.

### Why It Happens
Obsidian's workspace doesn't immediately register new leaves. A single refresh call happens before the leaf exists.

### The Fix
Use dual refresh pattern:

```typescript
// NavigationService.ts - openNewWebViewer()
async openNewWebViewer(): Promise<void> {
    this.isManualRefreshCallback(true);
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: 'webviewer', state: { url: 'about:blank', navigate: true } });
    this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    
    // CRITICAL: Immediate refresh THEN delayed refresh
    this.isManualRefreshCallback(true);
    this.onRefreshCallback();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    this.isManualRefreshCallback(true);
    this.onRefreshCallback();
}
```

### Checklist
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
