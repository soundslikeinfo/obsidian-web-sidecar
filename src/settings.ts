import { App, PluginSettingTab, Setting } from 'obsidian';
import type WebSidecarPlugin from './main';
import { DEFAULT_SETTINGS } from './types';

/**
 * Settings tab for Web Sidecar plugin
 */
export class WebSidecarSettingTab extends PluginSettingTab {
	plugin: WebSidecarPlugin;

	constructor(app: App, plugin: WebSidecarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Web Sidecar Settings' });

		// URL Property Fields
		new Setting(containerEl)
			.setName('URL property fields')
			.setDesc('Comma-separated list of frontmatter property names to search for URLs (e.g., source, url, URL)')
			.addText(text => text
				.setPlaceholder('source, url, URL')
				.setValue(this.plugin.settings.urlPropertyFields.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.urlPropertyFields = value
						.split(',')
						.map(s => s.trim())
						.filter(s => s.length > 0);
					await this.plugin.saveSettings();
				}));

		// Primary URL Property
		new Setting(containerEl)
			.setName('Primary URL property')
			.setDesc('Property name used when creating new notes with URL')
			.addText(text => text
				.setPlaceholder('source')
				.setValue(this.plugin.settings.primaryUrlProperty)
				.onChange(async (value) => {
					this.plugin.settings.primaryUrlProperty = value.trim() || DEFAULT_SETTINGS.primaryUrlProperty;
					await this.plugin.saveSettings();
				}));

		// Enable TLD Search
		new Setting(containerEl)
			.setName('Enable domain search')
			.setDesc('Show expanded section with notes from the same domain')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTldSearch)
				.onChange(async (value) => {
					this.plugin.settings.enableTldSearch = value;
					await this.plugin.saveSettings();
				}));

		// New Note Folder Path
		new Setting(containerEl)
			.setName('New note folder')
			.setDesc('Default folder for new notes created from this plugin (leave empty for vault root)')
			.addText(text => text
				.setPlaceholder('Folder/Subfolder')
				.setValue(this.plugin.settings.newNoteFolderPath)
				.onChange(async (value) => {
					this.plugin.settings.newNoteFolderPath = value.trim();
					await this.plugin.saveSettings();
				}));

		// Recent Notes Count
		new Setting(containerEl)
			.setName('Recent notes count')
			.setDesc('Number of recent notes with URLs to show when no web viewer is active')
			.addSlider(slider => slider
				.setLimits(5, 20, 1)
				.setValue(this.plugin.settings.recentNotesCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.recentNotesCount = value;
					await this.plugin.saveSettings();
				}));
	}
}
