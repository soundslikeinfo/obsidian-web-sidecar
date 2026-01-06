import WebSidecarPlugin from './main';

export function registerCommands(plugin: WebSidecarPlugin): void {
    // Ribbon Icon
    plugin.addRibbonIcon('globe', 'Open Web Sidecar', () => {
        void plugin.activateView();
    });

    // Open Command
    plugin.addCommand({
        id: 'open-pane',
        name: 'Open navigation pane to the right sidebar',
        callback: () => {
            void plugin.activateView();
        },
    });

    // Refresh Command
    plugin.addCommand({
        id: 'refresh-opened-links',
        name: 'Refresh active and opened links',
        callback: () => {
            plugin.tabStateService.refreshState();
        },
    });
}
