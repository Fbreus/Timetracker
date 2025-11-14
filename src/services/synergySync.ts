import * as vscode from 'vscode';
import { TimeTrackerDatabase, TimeEntry, Project } from '../database/database';
import { SynergyAuthService } from './synergyAuth';
import {
    SynergyTimeRegistration,
    SynergyRegistrationResponse,
    SynergySyncResult
} from './synergyTypes';

/**
 * Manages synchronization of time entries to Synergy
 */
export class SynergySyncService {
    private db: TimeTrackerDatabase;
    private authService: SynergyAuthService;
    private isSyncing: boolean = false;

    constructor(db: TimeTrackerDatabase, authService: SynergyAuthService) {
        this.db = db;
        this.authService = authService;
    }

    /**
     * Check if auto-sync is enabled
     */
    public isAutoSyncEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('timetracker.synergy');
        return config.get<boolean>('autoSync', false) && this.authService.isEnabled();
    }

    /**
     * Sync a single time entry to Synergy
     */
    public async syncTimeEntry(entry: TimeEntry): Promise<SynergyRegistrationResponse> {
        if (!this.authService.isEnabled()) {
            throw new Error('Synergy integration is not enabled or configured');
        }

        try {
            // Get access token
            const token = await this.authService.getAccessToken();

            // Get project details
            const project = this.db.getProjectById(entry.project_id);
            if (!project) {
                throw new Error(`Project not found for entry ${entry.id}`);
            }

            // Convert time entry to Synergy format
            const registration = this.convertToSynergyRegistration(entry, project);

            // Send to Synergy API
            const result = await this.sendRegistrationToSynergy(token, registration);

            // Mark as synced if successful
            if (result.success && entry.id) {
                this.db.markTimeEntrySynced(entry.id, result.id);
            }

            return result;
        } catch (error) {
            console.error('Error syncing time entry:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Sync all unsynced time entries
     */
    public async syncAllUnsyncedEntries(): Promise<SynergySyncResult> {
        if (this.isSyncing) {
            throw new Error('Sync already in progress');
        }

        if (!this.authService.isEnabled()) {
            throw new Error('Synergy integration is not enabled or configured');
        }

        this.isSyncing = true;

        const result: SynergySyncResult = {
            success: true,
            entriesProcessed: 0,
            entriesSynced: 0,
            entriesFailed: 0,
            errors: []
        };

        try {
            // Get all unsynced entries
            const unsyncedEntries = this.db.getUnsyncedTimeEntries();
            result.entriesProcessed = unsyncedEntries.length;

            if (unsyncedEntries.length === 0) {
                return result;
            }

            // Sync each entry
            for (const entry of unsyncedEntries) {
                try {
                    const syncResult = await this.syncTimeEntry(entry);

                    if (syncResult.success) {
                        result.entriesSynced++;
                    } else {
                        result.entriesFailed++;
                        result.errors.push({
                            entryId: entry.id!,
                            error: syncResult.error || 'Unknown error'
                        });
                    }
                } catch (error) {
                    result.entriesFailed++;
                    result.errors.push({
                        entryId: entry.id!,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }

                // Add a small delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            result.success = result.entriesFailed === 0;
        } catch (error) {
            console.error('Error during sync:', error);
            result.success = false;
        } finally {
            this.isSyncing = false;
        }

        return result;
    }

    /**
     * Convert a TimeEntry to Synergy registration format
     * NOTE: This is a placeholder implementation. You'll need to adjust this
     * based on the actual Synergy API requirements for time registrations.
     */
    private convertToSynergyRegistration(entry: TimeEntry, project: Project): SynergyTimeRegistration {
        // Calculate duration in minutes (Synergy might use minutes or hours)
        const durationMinutes = entry.duration ? Math.round(entry.duration / 60) : 0;

        return {
            projectId: project.name, // Adjust based on how Synergy identifies projects
            description: entry.notes || `Time tracking for ${project.name}`,
            startTime: entry.start_time,
            endTime: entry.end_time || new Date().toISOString(),
            duration: durationMinutes,
            notes: entry.notes
        };
    }

    /**
     * Send a time registration to Synergy API
     * NOTE: This is a placeholder implementation. You'll need to adjust the endpoint
     * and payload structure based on the actual Synergy API documentation.
     */
    private async sendRegistrationToSynergy(
        token: string,
        registration: SynergyTimeRegistration
    ): Promise<SynergyRegistrationResponse> {
        try {
            const config = vscode.workspace.getConfiguration('timetracker.synergy');
            const apiUrl = config.get<string>('apiUrl');

            // TODO: Update this endpoint based on actual Synergy API documentation
            // This is a placeholder - you'll need to adjust the endpoint path
            const endpoint = `${apiUrl}/TimeRegistration`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(registration)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json() as any;

            return {
                success: true,
                id: data.id || data.registrationId, // Adjust based on actual response
                message: 'Registration created successfully'
            };
        } catch (error) {
            console.error('Error sending registration to Synergy:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Auto-sync completed time entry if auto-sync is enabled
     */
    public async autoSyncIfEnabled(entry: TimeEntry): Promise<void> {
        if (!this.isAutoSyncEnabled()) {
            return;
        }

        // Only sync completed entries
        if (!entry.end_time || entry.synergy_synced) {
            return;
        }

        try {
            await this.syncTimeEntry(entry);
        } catch (error) {
            // Log error but don't throw - auto-sync failures shouldn't break the app
            console.error('Auto-sync failed:', error);
            vscode.window.showWarningMessage(
                `Failed to auto-sync time entry to Synergy: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Get sync status summary
     */
    public getSyncStatus(): { total: number; synced: number; pending: number } {
        const unsyncedEntries = this.db.getUnsyncedTimeEntries();
        const allEntries = this.db.getAllTimeEntries();

        return {
            total: allEntries.length,
            synced: allEntries.length - unsyncedEntries.length,
            pending: unsyncedEntries.length
        };
    }
}
