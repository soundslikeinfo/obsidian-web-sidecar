/**
 * Obsidian API Type Helpers
 * 
 * Provides type-safe accessors for internal Obsidian APIs that aren't
 * exposed in the public type definitions.
 */

import { WorkspaceLeaf, View, MarkdownView, TFile } from 'obsidian';

/**
 * Get the internal leaf ID from a WorkspaceLeaf
 * 
 * Note: `leaf.id` is an internal property not in public types.
 * This helper provides a type-safe way to access it.
 * 
 * @param leaf - The workspace leaf
 * @returns The leaf ID string, or undefined if not available
 */
export function getLeafId(leaf: WorkspaceLeaf): string | undefined {
    // @ts-expect-error - Internal API: leaf.id is not in public types
    return leaf.id as string | undefined;
}

/**
 * Get the file associated with a view, if it's a file-based view
 * 
 * Uses instanceof check for MarkdownView to properly type the file access.
 * For other view types, falls back to checking the file property.
 * 
 * @param view - The view to get the file from
 * @returns The TFile if the view has one, undefined otherwise
 */
export function getViewFile(view: View): TFile | null {
    if (view instanceof MarkdownView) {
        return view.file;
    }
    // For other FileView types (like PDFView), check if file property exists
    if ('file' in view && view.file instanceof TFile) {
        return view.file;
    }
    return null;
}

/**
 * Check if a view has a file and get its path
 * 
 * @param view - The view to check
 * @returns The file path if the view has a file, undefined otherwise
 */
export function getViewFilePath(view: View): string | undefined {
    const file = getViewFile(view);
    return file?.path;
}

/**
 * Check if a leaf's view is showing a specific file path
 * 
 * @param leaf - The workspace leaf to check
 * @param filePath - The file path to match
 * @returns True if the leaf's view is showing the specified file
 */
export function leafHasFile(leaf: WorkspaceLeaf, filePath: string): boolean {
    const viewPath = getViewFilePath(leaf.view);
    return viewPath === filePath;
}
