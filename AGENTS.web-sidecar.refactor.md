# Web Sidecar Refactor Log

## Goal
Split large files (> 300 lines) into smaller, single-responsibility modules to improve maintainability and comply with guidelines.

## `ContextMenus.ts` Refactor
- Split 880-line file into:
    - `ContextMenuHelpers.ts`
    - `WebViewerContextMenu.ts`
    - `NoteContextMenu.ts`
    - `VirtualTabContextMenu.ts`
    - `PinnedTabContextMenu.ts`
    - `GroupContextMenu.ts`
- This makes context menu logic much easier to find and modify.

## `SectionRenderer.ts` Refactor
- **Status**: In Progress
- **Current Size**: 997 lines
- **Strategy**: Break down by logical section type (Recent, Domain, Subreddit, Tags).
- **Files created**:
    - `src/views/components/sections/SectionHelpers.ts` (Shared drag/drop/sort logic)
    - `src/views/components/sections/RecentNotesSection.ts`
    - `src/views/components/sections/DomainSection.ts`
    - `src/views/components/sections/SubredditSection.ts`
    - `src/views/components/sections/TagSection.ts`
    - `src/views/components/sections/YouTubeSection.ts`
- **Result**: `SectionRenderer.ts` will become an orchestrator/coordinator, managing the order and instantiation of these sub-renderers.
