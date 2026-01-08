
import { App } from 'obsidian';

export interface ObsidianCommand {
    id: string;
    name: string;
}

export interface AppWithCommands extends App {
    commands: {
        commands: Record<string, ObsidianCommand>;
        executeCommandById(id: string): void;
    };
}
