/**
 * Favicon Utility Functions
 * Centralized Google Favicon API access for consistent usage across the plugin
 */

/**
 * Generate a Google Favicon API URL for a given domain
 * 
 * @param domain - The domain to fetch favicon for (e.g., "example.com")
 * @param size - Icon size (16 or 32 pixels)
 * @returns The Google Favicon API URL
 * 
 * @example
 * getFaviconUrl('github.com', 32) // "https://www.google.com/s2/favicons?domain=github.com&sz=32"
 */
export function getFaviconUrl(domain: string, size: 16 | 32 = 32): string {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}
