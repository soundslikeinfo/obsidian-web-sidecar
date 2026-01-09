/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

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
 * getFaviconUrl('github.com', 32) // Uses faviconV2 with https:// target
 */
export function getFaviconUrl(domain: string, size: 16 | 32 = 32): string {
    // Use faviconV2 directly with forced HTTPS to avoid 404s from HTTP fallback
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=${size}`;
}
