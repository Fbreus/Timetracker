import * as vscode from 'vscode';
import { Project } from '../database/database';

export interface RecentProject {
    project: Project;
    lastAccessed: Date;
    accessCount: number;
}

export class RecentProjectsManager {
    private recentProjects: Map<number, RecentProject> = new Map();
    private maxRecent: number = 7;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, maxRecent: number = 7) {
        this.context = context;
        this.maxRecent = maxRecent;
        this.loadFromStorage();
    }

    public addProject(project: Project): void {
        if (!project.id) {
            return;
        }

        const existing = this.recentProjects.get(project.id);

        if (existing) {
            // Update existing
            existing.lastAccessed = new Date();
            existing.accessCount++;
            existing.project = project; // Update project info
        } else {
            // Add new
            this.recentProjects.set(project.id, {
                project,
                lastAccessed: new Date(),
                accessCount: 1
            });
        }

        // Trim to max size
        this.trimToMax();

        // Persist
        this.saveToStorage();
    }

    public getRecentProjects(): Project[] {
        // Sort by last accessed (most recent first)
        const sorted = Array.from(this.recentProjects.values())
            .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());

        return sorted.map(rp => rp.project);
    }

    public getMostUsedProjects(): Project[] {
        // Sort by access count (most used first)
        const sorted = Array.from(this.recentProjects.values())
            .sort((a, b) => b.accessCount - a.accessCount);

        return sorted.map(rp => rp.project);
    }

    public clear(): void {
        this.recentProjects.clear();
        this.saveToStorage();
    }

    private trimToMax(): void {
        if (this.recentProjects.size <= this.maxRecent) {
            return;
        }

        // Remove least recently accessed projects
        const sorted = Array.from(this.recentProjects.values())
            .sort((a, b) => a.lastAccessed.getTime() - b.lastAccessed.getTime());

        const toRemove = sorted.slice(0, this.recentProjects.size - this.maxRecent);
        toRemove.forEach(rp => {
            if (rp.project.id) {
                this.recentProjects.delete(rp.project.id);
            }
        });
    }

    private loadFromStorage(): void {
        const stored = this.context.globalState.get<any[]>('recentProjects', []);

        stored.forEach(item => {
            if (item.project && item.project.id) {
                this.recentProjects.set(item.project.id, {
                    project: item.project,
                    lastAccessed: new Date(item.lastAccessed),
                    accessCount: item.accessCount || 1
                });
            }
        });
    }

    private saveToStorage(): void {
        const toStore = Array.from(this.recentProjects.values()).map(rp => ({
            project: rp.project,
            lastAccessed: rp.lastAccessed.toISOString(),
            accessCount: rp.accessCount
        }));

        this.context.globalState.update('recentProjects', toStore);
    }
}
