import * as vscode from 'vscode';
import * as path from 'path';
import { TimeTrackerDatabase } from './database/database';
import { TimeTracker, TrackingState } from './tracking/timeTracker';
import { SidebarProvider } from './views/sidebarProvider';
import { DataExporter } from './utils/exporter';
import { parseTimeString } from './utils/formatters';

let db: TimeTrackerDatabase;
let timeTracker: TimeTracker;
let sidebarProvider: SidebarProvider;
let exporter: DataExporter;

export function activate(context: vscode.ExtensionContext) {
    console.log('Time Tracker extension is now active');

    // Initialize database
    db = new TimeTrackerDatabase(context.globalStorageUri.fsPath);

    // Get configuration
    const config = vscode.workspace.getConfiguration('timetracker');
    const idleTimeout = config.get<number>('idleTimeout', 5);

    // Initialize time tracker
    timeTracker = new TimeTracker(db, idleTimeout);
    timeTracker.start();

    // Initialize exporter
    exporter = new DataExporter(db);

    // Register sidebar provider
    sidebarProvider = new SidebarProvider(context.extensionUri, timeTracker, db);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('timetracker.sidebar', sidebarProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.startTracking', async () => {
            await startTracking();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.stopTracking', async () => {
            await timeTracker.stopTracking();
            vscode.window.showInformationMessage('Time tracking stopped');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.pauseTracking', async () => {
            await timeTracker.pauseTracking();
            vscode.window.showInformationMessage('Time tracking paused');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.resumeTracking', async () => {
            await timeTracker.resumeTracking();
            vscode.window.showInformationMessage('Time tracking resumed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.showDashboard', async () => {
            await showDashboard(context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.addManualEntry', async () => {
            await addManualEntry();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.exportData', async () => {
            await exportData();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('timetracker.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'timetracker');
        })
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('timetracker.idleTimeout')) {
                const newTimeout = vscode.workspace.getConfiguration('timetracker').get<number>('idleTimeout', 5);
                timeTracker.setIdleTimeout(newTimeout);
            }
        })
    );

    // Auto-start tracking if enabled
    const autoStart = config.get<boolean>('autoStart', true);
    if (autoStart && vscode.workspace.workspaceFolders) {
        startTracking();
    }

    // Watch for workspace changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
            if (e.added.length > 0 && autoStart) {
                await startTracking();
            }
        })
    );

    // Cleanup on deactivation
    context.subscriptions.push({
        dispose: () => {
            timeTracker.stop();
            db.close();
        }
    });
}

async function startTracking(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open to track');
        return;
    }

    // Use the first workspace folder
    const folder = workspaceFolders[0];
    const projectPath = folder.uri.fsPath;
    const projectName = folder.name;

    try {
        await timeTracker.startTrackingProject(projectPath, projectName);
        vscode.window.showInformationMessage(`Started tracking: ${projectName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start tracking: ${error}`);
    }
}

async function addManualEntry(): Promise<void> {
    // Get project
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open');
        return;
    }

    const folder = workspaceFolders[0];
    const projectPath = folder.uri.fsPath;
    const projectName = folder.name;

    // Get date
    const dateStr = await vscode.window.showInputBox({
        prompt: 'Enter date (YYYY-MM-DD) or leave empty for today',
        placeHolder: new Date().toISOString().split('T')[0]
    });

    if (dateStr === undefined) {
        return; // User cancelled
    }

    const date = dateStr ? new Date(dateStr) : new Date();

    // Get start time
    const startTimeStr = await vscode.window.showInputBox({
        prompt: 'Enter start time (HH:MM or HH:MM AM/PM)',
        placeHolder: '09:00'
    });

    if (!startTimeStr) {
        return;
    }

    const startTime = parseTimeString(startTimeStr);
    if (!startTime) {
        vscode.window.showErrorMessage('Invalid start time format');
        return;
    }

    startTime.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

    // Get end time
    const endTimeStr = await vscode.window.showInputBox({
        prompt: 'Enter end time (HH:MM or HH:MM AM/PM)',
        placeHolder: '17:00'
    });

    if (!endTimeStr) {
        return;
    }

    const endTime = parseTimeString(endTimeStr);
    if (!endTime) {
        vscode.window.showErrorMessage('Invalid end time format');
        return;
    }

    endTime.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

    // Validate times
    if (endTime <= startTime) {
        vscode.window.showErrorMessage('End time must be after start time');
        return;
    }

    // Get notes
    const notes = await vscode.window.showInputBox({
        prompt: 'Enter notes (optional)',
        placeHolder: 'What did you work on?'
    });

    // Get billable status
    const isBillable = await vscode.window.showQuickPick(['No', 'Yes'], {
        placeHolder: 'Is this time billable?'
    });

    if (isBillable === undefined) {
        return;
    }

    try {
        await timeTracker.addManualEntry(
            projectPath,
            projectName,
            startTime,
            endTime,
            notes,
            isBillable === 'Yes'
        );

        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000 / 60);
        vscode.window.showInformationMessage(`Added ${duration} minutes to ${projectName}`);

        // Refresh sidebar
        sidebarProvider.refresh();
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to add manual entry: ${error}`);
    }
}

async function exportData(): Promise<void> {
    // Ask for export type
    const exportType = await vscode.window.showQuickPick(
        ['CSV - Detailed', 'CSV - Summary', 'JSON', 'Text Report'],
        { placeHolder: 'Select export format' }
    );

    if (!exportType) {
        return;
    }

    // Ask for date range
    const rangeOption = await vscode.window.showQuickPick(
        ['All Time', 'Today', 'This Week', 'This Month', 'Custom Range'],
        { placeHolder: 'Select date range' }
    );

    if (!rangeOption) {
        return;
    }

    let startDate: string | undefined;
    let endDate: string | undefined;

    const now = new Date();

    switch (rangeOption) {
        case 'Today':
            startDate = now.toISOString().split('T')[0];
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            endDate = tomorrow.toISOString().split('T')[0];
            break;

        case 'This Week':
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            startDate = weekStart.toISOString().split('T')[0];
            endDate = now.toISOString().split('T')[0];
            break;

        case 'This Month':
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate = monthStart.toISOString().split('T')[0];
            endDate = now.toISOString().split('T')[0];
            break;

        case 'Custom Range':
            const startDateStr = await vscode.window.showInputBox({
                prompt: 'Enter start date (YYYY-MM-DD)',
                placeHolder: '2024-01-01'
            });

            if (!startDateStr) {
                return;
            }

            const endDateStr = await vscode.window.showInputBox({
                prompt: 'Enter end date (YYYY-MM-DD)',
                placeHolder: now.toISOString().split('T')[0]
            });

            if (!endDateStr) {
                return;
            }

            startDate = startDateStr;
            endDate = endDateStr;
            break;
    }

    // Get save location
    const defaultFileName = `timetracker-export-${now.toISOString().split('T')[0]}`;
    let defaultExt = '.csv';

    if (exportType === 'JSON') {
        defaultExt = '.json';
    } else if (exportType === 'Text Report') {
        defaultExt = '.txt';
    }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultFileName + defaultExt),
        filters: exportType === 'JSON'
            ? { 'JSON': ['json'] }
            : exportType === 'Text Report'
            ? { 'Text': ['txt'] }
            : { 'CSV': ['csv'] }
    });

    if (!uri) {
        return;
    }

    try {
        if (exportType === 'CSV - Detailed') {
            exporter.exportToCSV(uri.fsPath, startDate, endDate);
        } else if (exportType === 'CSV - Summary') {
            exporter.exportSummaryToCSV(uri.fsPath, startDate, endDate);
        } else if (exportType === 'JSON') {
            exporter.exportToJSON(uri.fsPath, startDate, endDate);
        } else if (exportType === 'Text Report') {
            const report = exporter.generateReport(startDate, endDate);
            require('fs').writeFileSync(uri.fsPath, report, 'utf8');
        }

        vscode.window.showInformationMessage(`Data exported to ${uri.fsPath}`);

        // Ask if user wants to open the file
        const openFile = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Open exported file?'
        });

        if (openFile === 'Yes') {
            vscode.commands.executeCommand('vscode.open', uri);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Export failed: ${error}`);
    }
}

async function showDashboard(context: vscode.ExtensionContext): Promise<void> {
    // Create and show dashboard webview panel
    const panel = vscode.window.createWebviewPanel(
        'timetrackerDashboard',
        'Time Tracker Dashboard',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [context.extensionUri]
        }
    );

    panel.webview.html = getDashboardHtml();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        message => {
            switch (message.command) {
                case 'getData':
                    sendDashboardData(panel);
                    break;
            }
        }
    );

    // Send initial data
    sendDashboardData(panel);
}

function sendDashboardData(panel: vscode.WebviewPanel): void {
    // Get all projects
    const projects = db.getAllProjects();

    // Get today's summaries
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const todaySummaries = db.getDailySummariesForRange(today, tomorrowStr);

    // Get this week's summaries
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];

    const weekSummaries = db.getDailySummariesForRange(weekStartStr, tomorrowStr);

    // Get all-time totals
    const allTimeTotals = db.getTotalTimeForAllProjects();

    panel.webview.postMessage({
        command: 'updateData',
        data: {
            projects,
            todaySummaries,
            weekSummaries,
            allTimeTotals
        }
    });
}

function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Time Tracker Dashboard</title>
    <style>
        body {
            padding: 20px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        h1 {
            font-size: 24px;
            margin-bottom: 20px;
        }

        h2 {
            font-size: 18px;
            margin: 30px 0 15px 0;
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 5px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 5px;
            border: 1px solid var(--vscode-panel-border);
        }

        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }

        .project-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .project-item {
            background: var(--vscode-editor-background);
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 5px;
            border: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .project-name {
            font-weight: 600;
            font-size: 14px;
        }

        .project-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 3px;
        }

        .project-time {
            font-size: 18px;
            font-weight: 700;
            color: var(--vscode-terminal-ansiGreen);
        }

        .no-data {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 20px;
            text-align: center;
        }
    </style>
</head>
<body>
    <h1>Time Tracker Dashboard</h1>

    <h2>Today's Summary</h2>
    <div class="stats-grid" id="todayStats">
        <div class="stat-card">
            <div class="stat-label">Total Time</div>
            <div class="stat-value" id="todayTotal">0h 0m</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Projects Worked On</div>
            <div class="stat-value" id="todayProjects">0</div>
        </div>
    </div>

    <h2>This Week</h2>
    <div class="stats-grid" id="weekStats">
        <div class="stat-card">
            <div class="stat-label">Total Time</div>
            <div class="stat-value" id="weekTotal">0h 0m</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Projects Worked On</div>
            <div class="stat-value" id="weekProjects">0</div>
        </div>
    </div>

    <h2>All Time - Projects</h2>
    <ul class="project-list" id="allTimeProjects">
        <li class="no-data">No data available</li>
    </ul>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
                updateDashboard(message.data);
            }
        });

        function updateDashboard(data) {
            // Update today's stats
            let todayTotal = 0;
            data.todaySummaries.forEach(s => todayTotal += s.total_duration);
            document.getElementById('todayTotal').textContent = formatDuration(todayTotal);
            document.getElementById('todayProjects').textContent = data.todaySummaries.length;

            // Update week's stats
            const weekProjects = new Set();
            let weekTotal = 0;
            data.weekSummaries.forEach(s => {
                weekTotal += s.total_duration;
                weekProjects.add(s.project_id);
            });
            document.getElementById('weekTotal').textContent = formatDuration(weekTotal);
            document.getElementById('weekProjects').textContent = weekProjects.size;

            // Update all-time projects
            const projectList = document.getElementById('allTimeProjects');
            if (data.allTimeTotals.length === 0) {
                projectList.innerHTML = '<li class="no-data">No data available</li>';
            } else {
                projectList.innerHTML = data.allTimeTotals.map(p => \`
                    <li class="project-item">
                        <div>
                            <div class="project-name">\${p.project_name}</div>
                            <div class="project-path">\${data.projects.find(proj => proj.id === p.project_id)?.path || ''}</div>
                        </div>
                        <div class="project-time">\${formatDuration(p.total_duration)}</div>
                    </li>
                \`).join('');
            }
        }

        function formatDuration(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);

            if (hours > 0) {
                return hours + 'h ' + minutes + 'm';
            } else {
                return minutes + 'm';
            }
        }

        // Request initial data
        vscode.postMessage({ command: 'getData' });
    </script>
</body>
</html>`;
}

export function deactivate() {
    if (timeTracker) {
        timeTracker.stop();
    }
    if (db) {
        db.close();
    }
}
