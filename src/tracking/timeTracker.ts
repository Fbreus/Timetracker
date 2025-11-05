import * as vscode from 'vscode';
import { TimeTrackerDatabase, Project, TimeEntry } from '../database/database';
import { ActivityDetector, ActivityEvent } from './activityDetector';

export enum TrackingState {
    STOPPED = 'stopped',
    TRACKING = 'tracking',
    PAUSED = 'paused'
}

export interface TrackingStatus {
    state: TrackingState;
    currentProject?: Project;
    currentEntry?: TimeEntry;
    sessionDuration: number; // in seconds
    todayTotal: number; // in seconds
}

export class TimeTracker {
    private db: TimeTrackerDatabase;
    private activityDetector: ActivityDetector;
    private state: TrackingState = TrackingState.STOPPED;
    private currentProject?: Project;
    private currentEntry?: TimeEntry;
    private statusUpdateCallbacks: Array<(status: TrackingStatus) => void> = [];
    private updateInterval?: NodeJS.Timeout;

    constructor(db: TimeTrackerDatabase, idleTimeoutMinutes: number = 5) {
        this.db = db;
        this.activityDetector = new ActivityDetector(idleTimeoutMinutes);
    }

    public start(): void {
        this.activityDetector.start(
            (event: ActivityEvent) => this.handleActivity(event),
            () => this.handleIdle()
        );

        // Update status every second when tracking
        this.updateInterval = setInterval(() => {
            if (this.state === TrackingState.TRACKING) {
                this.notifyStatusUpdate();
            }
        }, 1000);
    }

    public stop(): void {
        this.activityDetector.stop();

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }

        if (this.state === TrackingState.TRACKING) {
            this.stopTracking();
        }
    }

    public async startTrackingProject(projectPath: string, projectName: string): Promise<void> {
        // Check if project is excluded
        const config = vscode.workspace.getConfiguration('timetracker');
        const excludedProjects = config.get<string[]>('excludedProjects', []);

        if (excludedProjects.some(excluded =>
            projectPath.includes(excluded) || projectName.includes(excluded)
        )) {
            return;
        }

        // Get or create project
        let project = this.db.getProjectByPath(projectPath);
        if (!project) {
            const projectId = this.db.createProject({
                name: projectName,
                path: projectPath
            });
            project = this.db.getProjectById(projectId);
        }

        if (!project) {
            throw new Error('Failed to create or retrieve project');
        }

        // Check if there's already an active entry for this project
        const activeEntry = this.db.getActiveTimeEntry(project.id!);
        if (activeEntry) {
            // Resume existing entry
            this.currentProject = project;
            this.currentEntry = activeEntry;
            this.state = TrackingState.TRACKING;
            this.notifyStatusUpdate();
            return;
        }

        // Stop any current tracking
        if (this.state === TrackingState.TRACKING && this.currentEntry) {
            await this.stopTracking();
        }

        // Create new time entry
        const entryId = this.db.createTimeEntry({
            project_id: project.id!,
            start_time: new Date().toISOString(),
            is_manual: false,
            is_billable: false
        });

        this.currentEntry = this.db.getTimeEntry(entryId);
        this.currentProject = project;
        this.state = TrackingState.TRACKING;

        // Log activity
        this.db.createActivityLog({
            time_entry_id: entryId,
            activity_type: 'start',
            timestamp: new Date().toISOString()
        });

        this.notifyStatusUpdate();
    }

    public async stopTracking(): Promise<void> {
        if (!this.currentEntry || !this.currentProject) {
            return;
        }

        const endTime = new Date();
        const startTime = new Date(this.currentEntry.start_time);
        const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

        // Check minimum session duration
        const config = vscode.workspace.getConfiguration('timetracker');
        const minDuration = config.get<number>('minSessionDuration', 1) * 60; // Convert to seconds

        if (durationSeconds >= minDuration) {
            // Update time entry
            this.db.updateTimeEntry(this.currentEntry.id!, {
                end_time: endTime.toISOString(),
                duration: durationSeconds
            });

            // Log activity
            this.db.createActivityLog({
                time_entry_id: this.currentEntry.id!,
                activity_type: 'stop',
                timestamp: endTime.toISOString()
            });

            // Update daily summary
            const dateStr = endTime.toISOString().split('T')[0];
            this.db.upsertDailySummary({
                project_id: this.currentProject.id!,
                date: dateStr,
                total_duration: durationSeconds,
                session_count: 1
            });
        } else {
            // Session too short, delete the entry
            this.db.deleteTimeEntry(this.currentEntry.id!);
        }

        this.currentEntry = undefined;
        this.currentProject = undefined;
        this.state = TrackingState.STOPPED;
        this.notifyStatusUpdate();
    }

    public async pauseTracking(): Promise<void> {
        if (this.state !== TrackingState.TRACKING || !this.currentEntry) {
            return;
        }

        this.state = TrackingState.PAUSED;

        // Log pause activity
        this.db.createActivityLog({
            time_entry_id: this.currentEntry.id!,
            activity_type: 'pause',
            timestamp: new Date().toISOString()
        });

        this.notifyStatusUpdate();
    }

    public async resumeTracking(): Promise<void> {
        if (this.state !== TrackingState.PAUSED || !this.currentEntry) {
            return;
        }

        this.state = TrackingState.TRACKING;
        this.activityDetector.resetIdle();

        // Log resume activity
        this.db.createActivityLog({
            time_entry_id: this.currentEntry.id!,
            activity_type: 'resume',
            timestamp: new Date().toISOString()
        });

        this.notifyStatusUpdate();
    }

    private handleActivity(event: ActivityEvent): void {
        // If we were paused and got activity, resume
        if (this.state === TrackingState.PAUSED) {
            this.resumeTracking();
        }
    }

    private handleIdle(): void {
        // Pause tracking when idle is detected
        if (this.state === TrackingState.TRACKING && this.currentEntry) {
            this.db.createActivityLog({
                time_entry_id: this.currentEntry.id!,
                activity_type: 'idle_detected',
                timestamp: new Date().toISOString()
            });

            this.pauseTracking();
        }
    }

    public getStatus(): TrackingStatus {
        let sessionDuration = 0;
        let todayTotal = 0;

        if (this.currentEntry && this.state === TrackingState.TRACKING) {
            const startTime = new Date(this.currentEntry.start_time);
            const now = new Date();
            sessionDuration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        }

        if (this.currentProject) {
            const today = new Date().toISOString().split('T')[0];
            const summary = this.db.getDailySummary(this.currentProject.id!, today);
            todayTotal = summary?.total_duration || 0;

            // Add current session if tracking
            if (sessionDuration > 0) {
                todayTotal += sessionDuration;
            }
        }

        return {
            state: this.state,
            currentProject: this.currentProject,
            currentEntry: this.currentEntry,
            sessionDuration,
            todayTotal
        };
    }

    public onStatusUpdate(callback: (status: TrackingStatus) => void): void {
        this.statusUpdateCallbacks.push(callback);
    }

    private notifyStatusUpdate(): void {
        const status = this.getStatus();
        this.statusUpdateCallbacks.forEach(callback => callback(status));
    }

    public async addManualEntry(
        projectPath: string,
        projectName: string,
        startTime: Date,
        endTime: Date,
        notes?: string,
        isBillable: boolean = false
    ): Promise<void> {
        // Get or create project
        let project = this.db.getProjectByPath(projectPath);
        if (!project) {
            const projectId = this.db.createProject({
                name: projectName,
                path: projectPath
            });
            project = this.db.getProjectById(projectId);
        }

        if (!project) {
            throw new Error('Failed to create or retrieve project');
        }

        const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

        // Create time entry
        const entryId = this.db.createTimeEntry({
            project_id: project.id!,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            duration: durationSeconds,
            is_manual: true,
            notes,
            is_billable: isBillable
        });

        // Update daily summary
        const dateStr = startTime.toISOString().split('T')[0];
        this.db.upsertDailySummary({
            project_id: project.id!,
            date: dateStr,
            total_duration: durationSeconds,
            session_count: 1
        });
    }

    public getCurrentProject(): Project | undefined {
        return this.currentProject;
    }

    public getTrackingState(): TrackingState {
        return this.state;
    }

    public setIdleTimeout(minutes: number): void {
        this.activityDetector.setIdleTimeout(minutes);
    }

    public dispose(): void {
        this.stop();
        this.activityDetector.dispose();
    }
}
