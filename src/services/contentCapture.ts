
import { WorkspaceLeaf, App, htmlToMarkdown } from 'obsidian';
import Defuddle from 'defuddle';
import { getLeafId } from './obsidianHelpers';

/**
 * Capture the content of a web viewer's page as HTML.
 * Desktop-only: uses Electron's executeJavaScript on webview element.
 * 
 * @param leaf - The workspace leaf containing the web viewer
 * @returns The page HTML content, or null if capture failed (e.g., not desktop, webview not found)
 */
export async function captureWebViewContent(leaf: WorkspaceLeaf): Promise<string | null> {
    try {
        // Find the webview element in the leaf's container
        const webviewEl = leaf.view.containerEl.querySelector('webview');
        if (!webviewEl) {
            console.warn('Web Sidecar: No webview element found in leaf');
            return null;
        }

        // Check if executeJavaScript is available (desktop only)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (webviewEl as any).executeJavaScript !== 'function') {
            console.warn('Web Sidecar: executeJavaScript not available (mobile or unsupported)');
            return null;
        }

        // Execute JavaScript in the webview context to get the FULL document HTML
        // We need document.documentElement.outerHTML for Defuddle to work properly
        // SECURITY NOTE: This is a READ operation from an isolated webview context.
        // The extracted HTML is sanitized by Defuddle and converted to Markdown text,
        // never directly injected into Obsidian's DOM.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const html = await (webviewEl as any).executeJavaScript('document.documentElement.outerHTML');

        if (typeof html !== 'string' || !html.trim()) {
            console.warn('Web Sidecar: Empty content returned from webview');
            return null;
        }

        return html;
    } catch (error) {
        console.error('Web Sidecar: Failed to capture webview content:', error);
        return null;
    }
}

/**
 * Extract main content from HTML using Defuddle.
 * Defuddle removes navigation, ads, sidebars, and other cruft,
 * leaving only the primary article content.
 * 
 * @param html - Full HTML document string
 * @returns Clean HTML content, or null if extraction fails
 */
export function extractMainContent(html: string): string | null {
    try {
        if (!html || typeof html !== 'string') {
            return null;
        }

        // Parse the HTML string into a DOM
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Use Defuddle to extract main content
        const defuddle = new Defuddle(doc);
        const result = defuddle.parse();

        if (!result.content) {
            console.warn('Web Sidecar: Defuddle returned empty content');
            return null;
        }

        return result.content;
    } catch (error) {
        console.error('Web Sidecar: Failed to extract main content with Defuddle:', error);
        return null;
    }
}

/**
 * Convert HTML to Markdown using Obsidian's built-in htmlToMarkdown function.
 * This function wraps the API with error handling.
 * 
 * @param html - HTML string to convert
 * @returns Markdown string, or empty string if conversion fails
 */
export function htmlToMarkdownSafe(html: string): string {
    try {
        if (!html || typeof html !== 'string') {
            return '';
        }

        return htmlToMarkdown(html);
    } catch (error) {
        console.error('Web Sidecar: Failed to convert HTML to Markdown:', error);
        return '';
    }
}

/**
 * Capture web page content and convert it to clean Markdown.
 * Uses Defuddle to extract main content before converting to Markdown.
 * 
 * @param leaf - The workspace leaf containing the web viewer
 * @returns Clean Markdown content, or null if capture/conversion failed
 */
export async function capturePageAsMarkdown(leaf: WorkspaceLeaf): Promise<string | null> {
    // Get the full page HTML
    const fullHtml = await captureWebViewContent(leaf);
    if (!fullHtml) {
        return null;
    }

    // Extract main content with Defuddle (removes nav, ads, sidebars, etc.)
    const cleanHtml = extractMainContent(fullHtml);
    if (!cleanHtml) {
        // Fallback to raw conversion if Defuddle fails
        console.warn('Web Sidecar: Defuddle extraction failed, falling back to raw HTML');
        const fallbackMarkdown = htmlToMarkdownSafe(fullHtml);
        return fallbackMarkdown.trim() || null;
    }

    // Convert clean HTML to Markdown
    const markdown = htmlToMarkdownSafe(cleanHtml);
    if (!markdown.trim()) {
        return null;
    }

    return markdown;
}

/**
 * Find a web viewer leaf by its ID.
 * 
 * @param app - Obsidian App instance
 * @param leafId - The leaf ID to search for
 * @returns The matching leaf, or null if not found
 */
export function findWebViewerLeafById(app: App, leafId: string): WorkspaceLeaf | null {
    const webViewerLeaves = app.workspace.getLeavesOfType('webviewer')
        .concat(app.workspace.getLeavesOfType('surfing-view'));

    for (const leaf of webViewerLeaves) {
        // Use type-safe helper for leaf ID access
        const id = getLeafId(leaf);
        if (id === leafId) {
            return leaf;
        }
    }

    return null;
}
