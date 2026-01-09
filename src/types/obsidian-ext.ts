/*
 * Web Sidecar
 * Copyright (c) 2025 soundslikeinfo
 * SPDX-License-Identifier: GPL-3.0-only
 */

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
