
import { App } from 'obsidian';

/**
 * Get the homepage URL from Obsidian's Web Viewer core plugin settings.
 * Falls back to 'about:blank' if the setting is not available.
 */
export function getWebViewerHomepage(app: App): string {
    try {
        // Access the internal webviewer plugin settings
        const internalPlugins = (app as any).internalPlugins;
        if (!internalPlugins) {
            return 'about:blank';
        }

        const webviewerPlugin = internalPlugins.getPluginById?.('webviewer') 
            || internalPlugins.plugins?.['webviewer'];
        
        if (!webviewerPlugin) {
            return 'about:blank';
        }

        // The settings are stored in the plugin's options
        // Can be accessed via plugin.options or plugin.instance?.options
        const options = webviewerPlugin.options 
            || webviewerPlugin.instance?.options 
            || {};
        
        const homepage = options.homepage;
        
        if (typeof homepage === 'string' && homepage.trim()) {
            return homepage.trim();
        }

        return 'about:blank';
    } catch (e) {
        console.warn('Web Sidecar: Could not read webviewer homepage setting', e);
        return 'about:blank';
    }
}
