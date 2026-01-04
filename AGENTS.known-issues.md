# Web Sidecar — Known Issues

This document tracks known issues, edge cases, and planned improvements for the Web Sidecar plugin. Reference this when debugging or planning future work.

> **See also:** `AGENTS.web-sidecar.md` for expected behavior, `AGENTS.web-sidecar.regression.md` for historical regressions and fixes.

---

## Active Issues

### 1. Perplexity.ai Auto-Redirect Breaks Note Association

**Status:** 🔴 Open — Deferred until other features complete

**Symptoms:**
- Opening a Perplexity.ai URL from a linked note causes immediate redirect
- Despite redirect detection implementation, note may still detach from viewer
- The `originalUrl` may not be captured correctly due to rapid redirect timing

**Root Cause (suspected):**
- Perplexity.ai performs JavaScript-based redirects that may occur during or before `setViewState` completes
- The pending URL mechanism relies on the tab being registered in `scanAllWebViewers` after `setViewState`
- If redirect happens synchronously during page load, `info.url` may already be the new URL when scan runs

**Affected Code:**
- `TabStateService.setPendingOriginalUrl()`
- `TabStateService.scanAllWebViewers()` — new tab creation block
- `BrowserTabItemRenderer.renderVirtualTab()` — virtual tab click handler

**Potential Solutions (for future investigation):**
1. **Double-capture approach**: Set `originalUrl` both via pending mechanism AND via direct `setTabOriginalUrl()` with increasing delays
2. **URL history tracking**: Track multiple URLs per tab to handle rapid redirect chains
3. **Site-specific handling**: Detect problematic domains (Perplexity, etc.) and apply aggressive retry logic
4. **Pre-redirect interception**: Investigate if Obsidian's webviewer exposes navigation events before redirect

**Workaround:**
- After redirect, right-click the web viewer → "Update linked note(s) url to current view"
- This updates the note's frontmatter to the new URL

**Related Sites with Similar Issues:**
- Perplexity.ai — confirmed
- Other SPA sites with hash-based routing — suspected

---

### 2. Fast Consecutive Redirects (Redirect Chains)

**Status:** 🟡 Partially Addressed

**Symptoms:**
- Some sites redirect multiple times rapidly (e.g., auth → content → final page)
- Plugin may capture intermediate URL instead of final destination

**Current Behavior:**
- Only the URL at the time of first `scanAllWebViewers` detection is captured as `originalUrl`
- Subsequent URL changes are tracked but original remains fixed

**Future Improvement:**
- Consider adding "last known good URL" tracking alongside `originalUrl`
- Allow user to manually reset `originalUrl` to current URL without updating notes

---

## Resolved Issues (Reference)

### Pinned Tab `currentUrl` Not Auto-Syncing

**Status:** ✅ Fixed (2026-01-04)

**Problem:** Pinned tabs weren't detecting when their web viewer navigated to a new URL.

**Fix:** Added `syncPinnedTabCurrentUrl()` called from `scanAllWebViewers()` whenever a tracked tab's URL changes.

---

### Virtual Tabs Appearing for Pinned URLs

**Status:** ✅ Fixed (2026-01-04)

**Problem:** Notes linked to pinned tab URLs were appearing as virtual tabs in "Opened web notes" section.

**Fix:** Added filter in `getVirtualTabs()` to exclude URLs that match any pinned tab's `url` or `currentUrl`.

---

### Note Link Clicks Under Pinned Tabs Opening Web Viewer

**Status:** ✅ Fixed (2026-01-04)

**Problem:** Clicking a note link under an expanded pinned tab would open the web viewer instead of the note.

**Root Cause:** Click event bubbled up to pinned tab wrapper which had `handlePinClick` handler.

**Fix:** Added `e.stopPropagation()` to note link click handlers in `PinnedTabRenderer.renderPinnedNotes()`.

---

## Testing Notes

When testing redirect detection:

1. **Good test URLs:**
   - Deleted Reddit posts — redirect to "deleted by user" page
   - URL shorteners (bit.ly, etc.) — immediate redirect
   
2. **Problematic test URLs:**
   - Perplexity.ai — SPA with complex routing
   - Sites with JavaScript-based auth redirects

3. **What to verify:**
   - After redirect, right-click menu shows "Update linked note(s) url to current view"
   - After clicking update, note's frontmatter URL is changed
   - Note remains associated with web viewer (not split into virtual tab + orphan viewer)

---

## How to Add New Issues

Use this template:

```markdown
### [Brief Issue Title]

**Status:** 🔴 Open | 🟡 Partial | 🟢 Fixed

**Symptoms:**
- What the user sees

**Root Cause:**
- Technical explanation

**Affected Code:**
- List of files/functions

**Potential Solutions:**
1. Idea one
2. Idea two
```
