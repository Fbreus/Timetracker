import * as vscode from 'vscode';
import { TimeTrackerDatabase, Project } from '../database/database';
import { SynergyApiService, SynergyApiConfig, SynergyProject, DEFAULT_SYNERGY_PROJECTS_ENDPOINT, DEFAULT_SYNERGY_RESID_ENDPOINT } from './synergyApi';
import { ProjectMapper } from './projectMapper';

/**
 * Manages the integration between Synergy API and the local database
 */
export class SynergyIntegration {
    private apiService: SynergyApiService | null = null;
    private db: TimeTrackerDatabase;
    private config: vscode.WorkspaceConfiguration;

    constructor(db: TimeTrackerDatabase) {
        this.db = db;
        this.config = vscode.workspace.getConfiguration('timetracker.synergy');
        this.initializeApiService();
    }

    /**
     * Initializes the API service based on configuration
     */
    private initializeApiService(): void {
        const enabled = this.config.get<boolean>('enabled', false);

        if (!enabled) {
            this.apiService = null;
            return;
        }

        const email = this.config.get<string>('email', '');
        const employeeId = this.config.get<string>('employeeId', '');
        const projectsEndpointUrl = this.config.get<string>('projectsEndpointUrl', DEFAULT_SYNERGY_PROJECTS_ENDPOINT);
        const resIdEndpointUrl = this.config.get<string>('resIdEndpointUrl', DEFAULT_SYNERGY_RESID_ENDPOINT);

        if (!email && !employeeId) {
            console.warn('Synergy integration is enabled but no email or employeeId is configured');
            this.apiService = null;
            return;
        }

        const apiConfig: SynergyApiConfig = {
            projectsEndpointUrl,
            resIdEndpointUrl,
            email,
            employeeId
        };

        this.apiService = new SynergyApiService(apiConfig);
    }

    /**
     * Checks if Synergy integration is enabled and configured
     */
    isEnabled(): boolean {
        return this.apiService !== null;
    }

    /**
     * Fetches projects from Synergy and syncs them to the local database
     * @returns Number of projects synced
     */
    async syncProjects(): Promise<number> {
        if (!this.apiService) {
            throw new Error('Synergy integration is not enabled or configured');
        }

        try {
            // Fetch projects from Synergy
            let synergyProjects: SynergyProject[];

            const email = this.config.get<string>('email', '');
            const employeeId = this.config.get<string>('employeeId', '');

            if (email) {
                // Use email-based lookup
                synergyProjects = await this.apiService.getProjectsByEmail(email);
            } else if (employeeId) {
                // Use direct ResID lookup
                synergyProjects = await this.apiService.getProjectsByResId(employeeId);
            } else {
                throw new Error('No email or employeeId configured');
            }

            // Convert to local project format
            const localProjects = ProjectMapper.synergyArrayToLocal(synergyProjects);

            // Sync with database
            let syncedCount = 0;
            for (const project of localProjects) {
                // Check if project already exists by path
                const existing = this.db.getProjectByPath(project.path);

                if (existing) {
                    // Update existing project if needed
                    this.db.updateProject(existing.id!, {
                        name: project.name,
                        category: project.category,
                        tags: project.tags
                    });
                } else {
                    // Create new project
                    this.db.createProject(project);
                    syncedCount++;
                }
            }

            console.log(`Synced ${syncedCount} new projects from Synergy (${localProjects.length} total)`);
            return syncedCount;
        } catch (error) {
            console.error('Failed to sync Synergy projects:', error);
            throw error;
        }
    }

    /**
     * Gets all Synergy projects from the local database
     */
    getSynergyProjects(): Project[] {
        const allProjects = this.db.getAllProjects();
        return allProjects.filter(p => ProjectMapper.isSynergyProject(p));
    }

    /**
     * Gets a single Synergy project by ProjectNr
     */
    getSynergyProjectByNr(projectNr: string): Project | undefined {
        const allProjects = this.db.getAllProjects();
        const synergyPath = `synergy://${projectNr}`;
        return this.db.getProjectByPath(synergyPath);
    }

    /**
     * Refreshes configuration when settings change
     */
    refreshConfig(): void {
        this.config = vscode.workspace.getConfiguration('timetracker.synergy');
        this.initializeApiService();
    }

    /**
     * Shows a picker to select a Synergy project and starts tracking it
     * @returns The selected project or null if cancelled
     */
    async selectAndTrackSynergyProject(): Promise<Project | null> {
        if (!this.isEnabled()) {
            throw new Error('Synergy integration is not enabled');
        }

        // Sync projects first
        try {
            await this.syncProjects();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to sync Synergy projects: ${error}`);
            return null;
        }

        // Get all Synergy projects
        const synergyProjects = this.getSynergyProjects();

        if (synergyProjects.length === 0) {
            vscode.window.showInformationMessage('No Synergy projects found');
            return null;
        }

        // Show quick pick
        const items = synergyProjects.map(p => ({
            label: p.name,
            description: p.category,
            detail: p.path,
            project: p
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a Synergy project to track'
        });

        if (!selected) {
            return null;
        }

        return selected.project;
    }
}
