import path from 'node:path';

// dist/src/*.js -> project root is two levels up
export const ROOT = path.resolve(__dirname, '..', '..');

export interface RunPaths {
    logDir: string;
    historyFile: string;
    diagnosticsDir: string;
}

export function defaultPaths(): RunPaths {
    return {
        logDir: path.join(ROOT, 'logs'),
        historyFile: path.join(ROOT, 'logs', 'history.json'),
        diagnosticsDir: path.join(ROOT, 'diagnostics')
    };
}
