import tseslint from 'typescript-eslint';
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json'
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	// Optional project overrides
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: { project: "./tsconfig.json" },
		},
		rules: {
			"obsidianmd/settings-tab/no-problematic-settings-headings": "off",
			"obsidianmd/ui/sentence-case": [
				"off",
				// {
				// 	brands: ["Web Sidecar", "URL", "URLs"],
				// 	acronyms: ["WS", "URL", "HTTP", "HTTPS", "URLs"],
				// 	enforceCamelCaseLower: true,
				// },
			],
		}
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
