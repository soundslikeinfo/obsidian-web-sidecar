/**
 * URL utility functions for normalizing and comparing URLs
 */

/**
 * Normalize a URL for comparison:
 * - Lowercase
 * - Strip protocol (http:// or https://)
 * - Strip www. prefix
 * - Strip trailing slashes
 * - Strip hash fragments
 */
export function normalizeUrl(url: string): string {
    if (!url || typeof url !== 'string') return '';

    let normalized = url.toLowerCase().trim();

    // Remove protocol
    normalized = normalized.replace(/^https?:\/\//, '');

    // Remove www. prefix
    normalized = normalized.replace(/^www\./, '');

    // Remove trailing slashes
    normalized = normalized.replace(/\/+$/, '');

    // Remove hash fragments
    normalized = normalized.replace(/#.*$/, '');

    return normalized;
}

/**
 * Extract the top-level domain (hostname) from a URL
 * e.g., "https://www.example.com/page" -> "example.com"
 */
export function extractDomain(url: string): string | null {
    if (!url || typeof url !== 'string') return null;

    try {
        // Ensure URL has a protocol for parsing
        let urlWithProtocol = url;
        if (!url.match(/^https?:\/\//)) {
            urlWithProtocol = 'https://' + url;
        }

        const parsed = new URL(urlWithProtocol);
        let hostname = parsed.hostname.toLowerCase();

        // Remove www. prefix
        hostname = hostname.replace(/^www\./, '');

        return hostname;
    } catch {
        // If URL parsing fails, try manual extraction
        const normalized = normalizeUrl(url);
        const match = normalized.match(/^([^/]+)/);
        return match ? match[1] ?? null : null;
    }
}

/**
 * Check if two URLs match after normalization
 */
export function urlsMatch(url1: string, url2: string): boolean {
    return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Check if two URLs share the same domain
 */
export function isSameDomain(url1: string, url2: string): boolean {
    const domain1 = extractDomain(url1);
    const domain2 = extractDomain(url2);

    if (!domain1 || !domain2) return false;

    return domain1 === domain2;
}

/**
 * Check if a string looks like a valid URL
 */
export function isValidUrl(str: string): boolean {
    if (!str || typeof str !== 'string') return false;

    // Check for common URL patterns
    const urlPattern = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i;
    return urlPattern.test(str.trim());
}
