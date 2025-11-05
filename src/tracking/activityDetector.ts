import * as vscode from 'vscode';

export interface ActivityEvent {
    type: 'textChange' | 'selection' | 'fileOpen' | 'fileClose' | 'debug' | 'terminal';
    timestamp: Date;
}

export class ActivityDetector {
    private lastActivityTime: Date;
    private activityListeners: vscode.Disposable[] = [];
    private idleCheckInterval: NodeJS.Timeout | undefined;
    private onActivityCallback: ((event: ActivityEvent) => void) | undefined;
    private onIdleCallback: (() => void) | undefined;
    private idleTimeoutMinutes: number;
    private isIdle: boolean = false;

    constructor(idleTimeoutMinutes: number = 5) {
        this.lastActivityTime = new Date();
        this.idleTimeoutMinutes = idleTimeoutMinutes;
    }

    public start(
        onActivity: (event: ActivityEvent) => void,
        onIdle: () => void
    ): void {
        this.onActivityCallback = onActivity;
        this.onIdleCallback = onIdle;
        this.registerActivityListeners();
        this.startIdleCheck();
    }

    public stop(): void {
        this.activityListeners.forEach(listener => listener.dispose());
        this.activityListeners = [];

        if (this.idleCheckInterval) {
            clearInterval(this.idleCheckInterval);
            this.idleCheckInterval = undefined;
        }
    }

    public getLastActivityTime(): Date {
        return this.lastActivityTime;
    }

    public setIdleTimeout(minutes: number): void {
        this.idleTimeoutMinutes = minutes;
    }

    public isCurrentlyIdle(): boolean {
        return this.isIdle;
    }

    public resetIdle(): void {
        this.isIdle = false;
        this.lastActivityTime = new Date();
    }

    private registerActivityListeners(): void {
        // Text document changes
        this.activityListeners.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.contentChanges.length > 0) {
                    this.recordActivity({ type: 'textChange', timestamp: new Date() });
                }
            })
        );

        // Selection changes (cursor movement)
        this.activityListeners.push(
            vscode.window.onDidChangeTextEditorSelection(() => {
                this.recordActivity({ type: 'selection', timestamp: new Date() });
            })
        );

        // File opened
        this.activityListeners.push(
            vscode.workspace.onDidOpenTextDocument(() => {
                this.recordActivity({ type: 'fileOpen', timestamp: new Date() });
            })
        );

        // File closed
        this.activityListeners.push(
            vscode.workspace.onDidCloseTextDocument(() => {
                this.recordActivity({ type: 'fileClose', timestamp: new Date() });
            })
        );

        // Debug session started/stopped
        this.activityListeners.push(
            vscode.debug.onDidStartDebugSession(() => {
                this.recordActivity({ type: 'debug', timestamp: new Date() });
            })
        );

        this.activityListeners.push(
            vscode.debug.onDidTerminateDebugSession(() => {
                this.recordActivity({ type: 'debug', timestamp: new Date() });
            })
        );

        // Terminal activity
        this.activityListeners.push(
            vscode.window.onDidOpenTerminal(() => {
                this.recordActivity({ type: 'terminal', timestamp: new Date() });
            })
        );

        this.activityListeners.push(
            vscode.window.onDidCloseTerminal(() => {
                this.recordActivity({ type: 'terminal', timestamp: new Date() });
            })
        );
    }

    private recordActivity(event: ActivityEvent): void {
        const wasIdle = this.isIdle;
        this.lastActivityTime = event.timestamp;
        this.isIdle = false;

        if (this.onActivityCallback) {
            this.onActivityCallback(event);
        }

        // If we were idle and now have activity, this is a resume event
        if (wasIdle && this.onActivityCallback) {
            // The callback will handle the resume logic
        }
    }

    private startIdleCheck(): void {
        // Check for idle state every 30 seconds
        this.idleCheckInterval = setInterval(() => {
            const now = new Date();
            const minutesSinceActivity =
                (now.getTime() - this.lastActivityTime.getTime()) / (1000 * 60);

            if (!this.isIdle && minutesSinceActivity >= this.idleTimeoutMinutes) {
                this.isIdle = true;
                if (this.onIdleCallback) {
                    this.onIdleCallback();
                }
            }
        }, 30000); // Check every 30 seconds
    }

    public dispose(): void {
        this.stop();
    }
}
