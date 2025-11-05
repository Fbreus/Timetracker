import * as fs from 'fs';
import { TimeTrackerDatabase, TimeEntry, Project } from '../database/database';
import { formatDuration, formatDateTime } from './formatters';

export class DataExporter {
    constructor(private db: TimeTrackerDatabase) {}

    exportToCSV(filePath: string, startDate?: string, endDate?: string): void {
        const entries = this.db.getAllTimeEntries(startDate, endDate);
        const projects = new Map<number, Project>();

        // Load all projects
        this.db.getAllProjects().forEach(p => {
            if (p.id) {
                projects.set(p.id, p);
            }
        });

        // CSV header
        let csv = 'Project Name,Project Path,Start Time,End Time,Duration (seconds),Duration (formatted),Notes,Is Manual,Is Billable\n';

        // CSV rows
        for (const entry of entries) {
            const project = projects.get(entry.project_id);
            const projectName = project ? project.name.replace(/"/g, '""') : 'Unknown';
            const projectPath = project ? project.path.replace(/"/g, '""') : 'Unknown';
            const startTime = entry.start_time;
            const endTime = entry.end_time || '';
            const duration = entry.duration || 0;
            const durationFormatted = formatDuration(duration);
            const notes = (entry.notes || '').replace(/"/g, '""');
            const isManual = entry.is_manual ? 'Yes' : 'No';
            const isBillable = entry.is_billable ? 'Yes' : 'No';

            csv += `"${projectName}","${projectPath}","${startTime}","${endTime}",${duration},"${durationFormatted}","${notes}","${isManual}","${isBillable}"\n`;
        }

        fs.writeFileSync(filePath, csv, 'utf8');
    }

    exportToJSON(filePath: string, startDate?: string, endDate?: string): void {
        const entries = this.db.getAllTimeEntries(startDate, endDate);
        const projects = new Map<number, Project>();

        // Load all projects
        this.db.getAllProjects().forEach(p => {
            if (p.id) {
                projects.set(p.id, p);
            }
        });

        // Build JSON structure
        const data = {
            exportDate: new Date().toISOString(),
            dateRange: {
                start: startDate || 'all',
                end: endDate || 'all'
            },
            entries: entries.map(entry => ({
                id: entry.id,
                project: {
                    id: entry.project_id,
                    name: projects.get(entry.project_id)?.name || 'Unknown',
                    path: projects.get(entry.project_id)?.path || 'Unknown'
                },
                startTime: entry.start_time,
                endTime: entry.end_time,
                duration: entry.duration,
                durationFormatted: formatDuration(entry.duration || 0),
                notes: entry.notes,
                isManual: entry.is_manual,
                isBillable: entry.is_billable,
                createdAt: entry.created_at,
                updatedAt: entry.updated_at
            })),
            summary: this.generateSummary(entries, projects)
        };

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    exportSummaryToCSV(filePath: string, startDate?: string, endDate?: string): void {
        const entries = this.db.getAllTimeEntries(startDate, endDate);
        const projects = new Map<number, Project>();
        const projectTotals = new Map<number, { duration: number; sessions: number }>();

        // Load all projects
        this.db.getAllProjects().forEach(p => {
            if (p.id) {
                projects.set(p.id, p);
            }
        });

        // Calculate totals per project
        for (const entry of entries) {
            if (!entry.duration) {
                continue;
            }

            const current = projectTotals.get(entry.project_id) || { duration: 0, sessions: 0 };
            current.duration += entry.duration;
            current.sessions += 1;
            projectTotals.set(entry.project_id, current);
        }

        // CSV header
        let csv = 'Project Name,Project Path,Total Duration (seconds),Total Duration (formatted),Number of Sessions,Average Session Duration\n';

        // CSV rows
        for (const [projectId, totals] of projectTotals.entries()) {
            const project = projects.get(projectId);
            const projectName = project ? project.name.replace(/"/g, '""') : 'Unknown';
            const projectPath = project ? project.path.replace(/"/g, '""') : 'Unknown';
            const avgDuration = Math.round(totals.duration / totals.sessions);

            csv += `"${projectName}","${projectPath}",${totals.duration},"${formatDuration(totals.duration)}",${totals.sessions},"${formatDuration(avgDuration)}"\n`;
        }

        fs.writeFileSync(filePath, csv, 'utf8');
    }

    private generateSummary(entries: TimeEntry[], projects: Map<number, Project>): any {
        const projectTotals = new Map<number, { duration: number; sessions: number }>();

        for (const entry of entries) {
            if (!entry.duration) {
                continue;
            }

            const current = projectTotals.get(entry.project_id) || { duration: 0, sessions: 0 };
            current.duration += entry.duration;
            current.sessions += 1;
            projectTotals.set(entry.project_id, current);
        }

        const projectSummaries = [];
        let totalDuration = 0;
        let totalSessions = 0;

        for (const [projectId, totals] of projectTotals.entries()) {
            const project = projects.get(projectId);
            projectSummaries.push({
                projectId,
                projectName: project?.name || 'Unknown',
                projectPath: project?.path || 'Unknown',
                totalDuration: totals.duration,
                totalDurationFormatted: formatDuration(totals.duration),
                sessionCount: totals.sessions,
                averageSessionDuration: Math.round(totals.duration / totals.sessions)
            });

            totalDuration += totals.duration;
            totalSessions += totals.sessions;
        }

        // Sort by duration descending
        projectSummaries.sort((a, b) => b.totalDuration - a.totalDuration);

        return {
            totalDuration,
            totalDurationFormatted: formatDuration(totalDuration),
            totalSessions,
            projects: projectSummaries
        };
    }

    generateReport(startDate?: string, endDate?: string): string {
        const entries = this.db.getAllTimeEntries(startDate, endDate);
        const projects = new Map<number, Project>();

        // Load all projects
        this.db.getAllProjects().forEach(p => {
            if (p.id) {
                projects.set(p.id, p);
            }
        });

        const summary = this.generateSummary(entries, projects);

        let report = '═══════════════════════════════════════════════════════\n';
        report += '           TIME TRACKER REPORT\n';
        report += '═══════════════════════════════════════════════════════\n\n';

        if (startDate || endDate) {
            report += `Period: ${startDate || 'Start'} to ${endDate || 'End'}\n\n`;
        }

        report += `Total Time Tracked: ${summary.totalDurationFormatted}\n`;
        report += `Total Sessions: ${summary.totalSessions}\n\n`;

        report += '───────────────────────────────────────────────────────\n';
        report += 'PROJECT BREAKDOWN\n';
        report += '───────────────────────────────────────────────────────\n\n';

        for (const project of summary.projects) {
            report += `${project.projectName}\n`;
            report += `  Total: ${project.totalDurationFormatted}\n`;
            report += `  Sessions: ${project.sessionCount}\n`;
            report += `  Average: ${formatDuration(project.averageSessionDuration)}\n`;
            report += `  Path: ${project.projectPath}\n\n`;
        }

        report += '═══════════════════════════════════════════════════════\n';

        return report;
    }
}
