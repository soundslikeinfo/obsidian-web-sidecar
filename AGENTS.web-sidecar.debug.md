# Debug Logging Reference

This file documents debug logging that was removed for plugin guideline compliance, but may be useful to re-enable during development.

## Removed Debug Statements

### `findWebViewerLeafById()` in `contentCapture.ts`

**Location:** `src/services/contentCapture.ts` - `findWebViewerLeafById()` function

**Original code:**
```typescript
console.debug('Web Sidecar: Could not find leaf with ID:', leafId,
    'Available IDs:', webViewerLeaves.map(l => getLeafId(l)));
```

**Purpose:** Logs when a web viewer leaf cannot be found by ID, along with all available leaf IDs for debugging.

**When to re-enable:** Useful when debugging issues with:
- Content capture failing silently
- Leaf ID mismatches between TabStateService and actual leaves
- Web viewer detection issues

---

## Console.warn Statements (Kept)

The following `console.warn` statements were kept as they indicate actual error conditions:

| File | Line | Message |
|------|------|---------|
| `webViewerUtils.ts` | 37 | Could not read webviewer homepage setting |
| `webSidecarView.ts` | 275 | Command "Show history" not found |
| `webSidecarView.ts` | 313 | Command "Search the web" not found |
| `contentCapture.ts` | 18 | No webview element found in leaf |
| `contentCapture.ts` | 24 | executeJavaScript not available |
| `contentCapture.ts` | 36 | Empty content returned from webview |
| `contentCapture.ts` | 70 | Defuddle returned empty content |
| `contentCapture.ts` | 119 | Defuddle extraction failed |
