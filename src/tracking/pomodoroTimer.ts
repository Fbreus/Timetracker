import * as vscode from 'vscode';

export enum PomodoroPhase {
    WORK = 'work',
    SHORT_BREAK = 'short_break',
    LONG_BREAK = 'long_break',
    STOPPED = 'stopped'
}

export interface PomodoroStatus {
    phase: PomodoroPhase;
    remainingSeconds: number;
    totalSeconds: number;
    cycleCount: number;
    isActive: boolean;
}

export class PomodoroTimer {
    private phase: PomodoroPhase = PomodoroPhase.STOPPED;
    private remainingSeconds: number = 0;
    private totalSeconds: number = 0;
    private cycleCount: number = 0;
    private isActive: boolean = false;
    private interval?: NodeJS.Timeout;
    private statusUpdateCallbacks: Array<(status: PomodoroStatus) => void> = [];
    private phaseCompleteCallbacks: Array<(phase: PomodoroPhase) => void> = [];
    private phaseStartCallbacks: Array<(phase: PomodoroPhase, durationSeconds: number) => void> = [];

    // Default durations in seconds
    private workDuration: number = 25 * 60; // 25 minutes
    private shortBreakDuration: number = 5 * 60; // 5 minutes
    private longBreakDuration: number = 15 * 60; // 15 minutes
    private cyclesBeforeLongBreak: number = 4;

    constructor(
        workMinutes: number = 25,
        shortBreakMinutes: number = 5,
        longBreakMinutes: number = 15,
        cyclesBeforeLongBreak: number = 4
    ) {
        this.workDuration = workMinutes * 60;
        this.shortBreakDuration = shortBreakMinutes * 60;
        this.longBreakDuration = longBreakMinutes * 60;
        this.cyclesBeforeLongBreak = cyclesBeforeLongBreak;
    }

    public startWork(): void {
        this.startPhase(PomodoroPhase.WORK, this.workDuration);
    }

    public startShortBreak(): void {
        this.startPhase(PomodoroPhase.SHORT_BREAK, this.shortBreakDuration);
    }

    public startLongBreak(): void {
        this.startPhase(PomodoroPhase.LONG_BREAK, this.longBreakDuration);
    }

    public startNextPhase(): void {
        if (this.phase === PomodoroPhase.WORK) {
            this.cycleCount++;
            if (this.cycleCount % this.cyclesBeforeLongBreak === 0) {
                this.startLongBreak();
                vscode.window.showInformationMessage('🎉 Time for a long break! You completed 4 pomodoros!', 'Start Break').then(selection => {
                    if (selection === 'Start Break') {
                        this.resume();
                    }
                });
            } else {
                this.startShortBreak();
                vscode.window.showInformationMessage('☕ Work session complete! Time for a short break.', 'Start Break').then(selection => {
                    if (selection === 'Start Break') {
                        this.resume();
                    }
                });
            }
        } else {
            this.startWork();
            vscode.window.showInformationMessage('💪 Break is over! Ready to focus?', 'Start Work').then(selection => {
                if (selection === 'Start Work') {
                    this.resume();
                }
            });
        }
    }

    private startPhase(phase: PomodoroPhase, duration: number): void {
        this.phase = phase;
        this.totalSeconds = duration;
        this.remainingSeconds = duration;
        this.isActive = true;

        // Clear any existing interval
        if (this.interval) {
            clearInterval(this.interval);
        }

        // Notify phase start (for Teams integration, etc.)
        this.notifyPhaseStart(phase, duration);

        // Start countdown
        this.interval = setInterval(() => {
            if (this.isActive && this.remainingSeconds > 0) {
                this.remainingSeconds--;
                this.notifyStatusUpdate();

                if (this.remainingSeconds === 0) {
                    this.handlePhaseComplete();
                }
            }
        }, 1000);

        this.notifyStatusUpdate();
    }

    private handlePhaseComplete(): void {
        this.isActive = false;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }

        // Notify callbacks
        this.phaseCompleteCallbacks.forEach(callback => callback(this.phase));

        // Play system notification sound
        const phaseMessages: Record<PomodoroPhase, string> = {
            [PomodoroPhase.WORK]: '🔔 Work session complete!',
            [PomodoroPhase.SHORT_BREAK]: '🔔 Short break complete!',
            [PomodoroPhase.LONG_BREAK]: '🔔 Long break complete!',
            [PomodoroPhase.STOPPED]: ''
        };

        const message = phaseMessages[this.phase];
        if (message) {
            vscode.window.showInformationMessage(message, 'Continue').then(selection => {
                if (selection === 'Continue') {
                    this.startNextPhase();
                }
            });
        }
    }

    public pause(): void {
        this.isActive = false;
        this.notifyStatusUpdate();
    }

    public resume(): void {
        if (this.phase !== PomodoroPhase.STOPPED && this.remainingSeconds > 0) {
            this.isActive = true;
            this.notifyStatusUpdate();
        }
    }

    public stop(): void {
        this.isActive = false;
        this.phase = PomodoroPhase.STOPPED;
        this.remainingSeconds = 0;
        this.totalSeconds = 0;

        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }

        this.notifyStatusUpdate();
    }

    public skip(): void {
        this.remainingSeconds = 0;
        this.handlePhaseComplete();
    }

    public getStatus(): PomodoroStatus {
        return {
            phase: this.phase,
            remainingSeconds: this.remainingSeconds,
            totalSeconds: this.totalSeconds,
            cycleCount: this.cycleCount,
            isActive: this.isActive
        };
    }

    public onStatusUpdate(callback: (status: PomodoroStatus) => void): void {
        this.statusUpdateCallbacks.push(callback);
    }

    public onPhaseComplete(callback: (phase: PomodoroPhase) => void): void {
        this.phaseCompleteCallbacks.push(callback);
    }

    public onPhaseStart(callback: (phase: PomodoroPhase, durationSeconds: number) => void): void {
        this.phaseStartCallbacks.push(callback);
    }

    private notifyStatusUpdate(): void {
        const status = this.getStatus();
        this.statusUpdateCallbacks.forEach(callback => callback(status));
    }

    private notifyPhaseStart(phase: PomodoroPhase, durationSeconds: number): void {
        this.phaseStartCallbacks.forEach(callback => callback(phase, durationSeconds));
    }

    public updateSettings(
        workMinutes: number,
        shortBreakMinutes: number,
        longBreakMinutes: number,
        cyclesBeforeLongBreak: number
    ): void {
        this.workDuration = workMinutes * 60;
        this.shortBreakDuration = shortBreakMinutes * 60;
        this.longBreakDuration = longBreakMinutes * 60;
        this.cyclesBeforeLongBreak = cyclesBeforeLongBreak;
    }

    public dispose(): void {
        this.stop();
    }
}
