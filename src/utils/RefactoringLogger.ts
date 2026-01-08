export class RefactoringLogger {
    private static logs: string[] = [];
    private static startTime: number = Date.now();

    static log(action: string, details: unknown = {}) {
        const timestamp = Date.now() - this.logs.length === 0 ? 0 : Date.now() - this.startTime;
        this.startTime = this.logs.length === 0 ? Date.now() : this.startTime;

        const entry = `[${timestamp}ms] ${action}: ${JSON.stringify(details)}`;
        this.logs.push(entry);
        console.debug(`[RefactorLog] ${entry}`);
    }

    static getLogs(): string {
        return this.logs.join('\n');
    }

    static clear() {
        this.logs = [];
        this.startTime = Date.now();
        console.debug('[RefactorLog] Cleared');
    }

    static downloadLogs() {
        const element = document.createElement('a');
        const file = new Blob([this.getLogs()], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = 'refactoring-trace.txt';
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    }
}
