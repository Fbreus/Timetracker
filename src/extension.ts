import * as vscode from 'vscode';
import * as path from 'path';
import { TimeTrackerDatabase } from './database/database';
import { TimeTracker, TrackingState } from './tracking/timeTracker';
import { SidebarProvider } from './views/sidebarProvider';
import { DataExporter } from './utils/exporter';
import { parseTimeString } from './utils/formatters';
import { SynergyAuthService } from './services/synergyAuth';
import { SynergySyncService } from './services/synergySync';
import { SynergyService } from './services/synergyService';
import { SynergyIntegration } from './services/synergyIntegration';
import { SynergyApiService } from './services/synergyApiService';

let db: TimeTrackerDatabase;
let timeTracker: TimeTracker;
let sidebarProvider: SidebarProvider;
let exporter: DataExporter;
let synergyAuth: SynergyAuthService;
let synergySync: SynergySyncService;
let synergyService: SynergyService;
let synergyIntegration: SynergyIntegration;
let synergyApi: SynergyApiService;

export function activate(context: vscode.ExtensionContext) {
    console.log('Time Tracker extension is activating...');

    // Register sidebar provider immediately (synchronously)
    // This prevents "no data provider" error
    sidebarProvider = new SidebarProvider(context.extensionUri);
    const registration = vscode.window.registerWebviewViewProvider('timetracker.sidebar', sidebarProvider, {
        webviewOptions: {
            retainContextWhenHidden: true
        }
    });
    context.subscriptions.push(registration);
    console.log('Sidebar provider registered with ID: timetracker.sidebar');

    // Initialize asynchronously
    initializeExtension(context).catch(error => {
        console.error('Failed to initialize Time Tracker:', error);
        vscode.window.showErrorMessage(`Time Tracker failed to initialize: ${error}`);
    });
}

async function initializeExtension(context: vscode.ExtensionContext) {
    try {
        // Initialize database
        console.log('Initializing database...');
        db = new TimeTrackerDatabase(context.globalStorageUri.fsPath);
        await db.initialize();
        console.log('Database initialized successfully');

        // Get configuration
        const config = vscode.workspace.getConfiguration('timetracker');
        const idleTimeout = config.get<number>('idleTimeout', 5);

        // Initialize time tracker
        console.log('Initializing time tracker...');
        timeTracker = new TimeTracker(db, idleTimeout);
        timeTracker.start();
        console.log('Time tracker initialized successfully');

        // Initialize exporter
        console.log('Initializing exporter...');
        exporter = new DataExporter(db);
        console.log('Exporter initialized successfully');

        // Initialize Synergy services
        console.log('Initializing Synergy services...');
        synergyAuth = new SynergyAuthService();
        synergySync = new SynergySyncService(db, synergyAuth);
        synergyService = new SynergyService();
        synergyIntegration = new SynergyIntegration(db);
        synergyApi = new SynergyApiService();

        // Configure Synergy API from settings
        const synergyTokenEndpoint = config.get<string>('synergy.tokenEndpoint');
        const synergyCustomerEndpoint = config.get<string>('synergy.customerEndpoint');
        if (synergyTokenEndpoint && synergyCustomerEndpoint) {
            synergyApi.updateConfig({
                tokenEndpoint: synergyTokenEndpoint,
                customerEndpoint: synergyCustomerEndpoint
            });
        }
        console.log('Synergy services initialized successfully');

        // Set dependencies on sidebar provider
        console.log('Setting sidebar provider dependencies...');
        sidebarProvider.setDependencies(timeTracker, db);
        console.log('Sidebar provider fully initialized');

        // Register commands
        console.log('Registering commands...');
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

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.switchToProject', async (projectId: number) => {
                await switchToProject(projectId);
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.viewTimeEntries', async () => {
                await viewTimeEntries(context);
            })
        );

        // Synergy commands - Direct API sync
        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.synergy.testConnection', async () => {
                await testSynergyConnection();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.synergy.syncNow', async () => {
                await syncToSynergyNow();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.synergy.viewSyncStatus', async () => {
                await viewSynergySyncStatus();
            })
        );

        // Synergy commands - PSA submission
        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.submitToSynergy', async () => {
                await submitToSynergy();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.testSynergyConnection', async () => {
                await testSynergyConnectionPSA();
            })
        );

        // Synergy commands - Project sync
        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.syncSynergyProjects', async () => {
                await syncSynergyProjects();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.selectSynergyProject', async () => {
                await selectSynergyProject();
            })
        );

        // Synergy commands - Customer sync
        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.syncCustomers', async () => {
                await syncCustomersFromSynergy();
            })
        );

        console.log('Commands registered successfully');

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('timetracker.idleTimeout')) {
                    const newTimeout = vscode.workspace.getConfiguration('timetracker').get<number>('idleTimeout', 5);
                    timeTracker.setIdleTimeout(newTimeout);
                }
                if (e.affectsConfiguration('timetracker.synergy')) {
                    synergyService.reloadConfig();
                    synergyIntegration.refreshConfig();
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
                if (timeTracker) {
                    timeTracker.stop();
                }
                if (db) {
                    db.close();
                }
            }
        });

        console.log('Time Tracker extension activated successfully!');
    } catch (error) {
        console.error('Failed to activate Time Tracker extension:', error);
        vscode.window.showErrorMessage(`Time Tracker failed to activate: ${error}`);
        throw error;
    }
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

async function switchToProject(projectId: number): Promise<void> {
    try {
        const project = db.getProjectById(projectId);
        if (!project) {
            vscode.window.showErrorMessage('Project not found');
            return;
        }

        // Stop current tracking if any
        if (timeTracker.getTrackingState() !== TrackingState.STOPPED) {
            await timeTracker.stopTracking();
        }

        // Start tracking the selected project
        await timeTracker.startTrackingProject(project.path, project.name);
        vscode.window.showInformationMessage(`Switched to: ${project.name}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to switch project: ${error}`);
    }
}

async function viewTimeEntries(context: vscode.ExtensionContext): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
        'timetrackerEntries',
        'Time Entries',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [context.extensionUri]
        }
    );

    panel.webview.html = getTimeEntriesHtml();

    // Handle messages from webview
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'getData':
                    sendTimeEntriesData(panel);
                    break;
                case 'editEntry':
                    await editTimeEntry(message.entryId);
                    sendTimeEntriesData(panel); // Refresh
                    break;
                case 'deleteEntry':
                    await deleteTimeEntry(message.entryId);
                    sendTimeEntriesData(panel); // Refresh
                    break;
                case 'submitToSynergy':
                    await handleSynergySubmission(message.data);
                    break;
            }
        }
    );

    // Send initial data
    sendTimeEntriesData(panel);
}

function sendTimeEntriesData(panel: vscode.WebviewPanel): void {
    // Get last 30 days of entries
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const entries = db.getAllTimeEntries(startDate.toISOString(), endDate.toISOString());
    const projects = new Map<number, string>();

    // Get project names
    db.getAllProjects().forEach(p => {
        if (p.id) {
            projects.set(p.id, p.name);
        }
    });

    panel.webview.postMessage({
        command: 'updateData',
        entries: entries.map(e => ({
            ...e,
            projectName: projects.get(e.project_id) || 'Unknown'
        }))
    });
}

async function editTimeEntry(entryId: number): Promise<void> {
    const entry = db.getTimeEntry(entryId);
    if (!entry) {
        vscode.window.showErrorMessage('Entry not found');
        return;
    }

    // Get new start time
    const startTime = await vscode.window.showInputBox({
        prompt: 'Enter start time (HH:MM)',
        value: new Date(entry.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    });

    if (!startTime) {
        return;
    }

    // Get new end time
    const endTime = await vscode.window.showInputBox({
        prompt: 'Enter end time (HH:MM)',
        value: entry.end_time ? new Date(entry.end_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
    });

    if (!endTime) {
        return;
    }

    // Get notes
    const notes = await vscode.window.showInputBox({
        prompt: 'Enter notes (optional)',
        value: entry.notes || ''
    });

    // Parse times
    const startDate = new Date(entry.start_time);
    const [startHour, startMin] = startTime.split(':').map(Number);
    startDate.setHours(startHour, startMin, 0, 0);

    const endDate = new Date(entry.start_time);
    const [endHour, endMin] = endTime.split(':').map(Number);
    endDate.setHours(endHour, endMin, 0, 0);

    const duration = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);

    // Update entry
    db.updateTimeEntry(entryId, {
        end_time: endDate.toISOString(),
        duration: duration,
        notes: notes || undefined
    });

    vscode.window.showInformationMessage('Time entry updated');
}

async function deleteTimeEntry(entryId: number): Promise<void> {
    const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: 'Are you sure you want to delete this entry?'
    });

    if (confirm === 'Yes') {
        db.deleteTimeEntry(entryId);
        vscode.window.showInformationMessage('Time entry deleted');
    }
}

function getTimeEntriesHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Time Entries</title>
    <style>
        body {
            padding: 20px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        h1 {
            font-size: 24px;
            margin: 0;
        }

        .submit-synergy-btn {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        }

        .submit-synergy-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }

        th {
            text-align: left;
            padding: 8px;
            background: var(--vscode-editor-background);
            border-bottom: 2px solid var(--vscode-panel-border);
            font-weight: 600;
        }

        td {
            padding: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        tr:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .actions {
            display: flex;
            gap: 10px;
        }

        button {
            padding: 4px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        button.delete {
            background: var(--vscode-errorForeground);
            color: white;
        }

        .no-entries {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
        }

        /* Synergy Modal Styles */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal-overlay.active {
            display: flex;
        }

        .synergy-card {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 24px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }

        .synergy-card h2 {
            margin: 0 0 20px 0;
            font-size: 18px;
            font-weight: 600;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            margin-bottom: 6px;
            font-size: 13px;
            font-weight: 500;
        }

        .form-group select,
        .form-group input,
        .form-group textarea {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            box-sizing: border-box;
        }

        .form-group textarea {
            min-height: 80px;
            resize: vertical;
        }

        .form-group select:focus,
        .form-group input:focus,
        .form-group textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .form-group .help-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .entry-preview {
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
            padding: 12px;
            margin-top: 8px;
            border-radius: 3px;
        }

        .entry-preview-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
            font-size: 12px;
        }

        .entry-preview-label {
            color: var(--vscode-descriptionForeground);
        }

        .entry-preview-value {
            font-weight: 500;
        }

        .form-actions {
            display: flex;
            gap: 10px;
            margin-top: 24px;
            justify-content: flex-end;
        }

        .form-actions button {
            padding: 8px 16px;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Time Entries (Last 30 Days)</h1>
        <button class="submit-synergy-btn" onclick="openSynergyModal()">Submit to Synergy</button>
    </div>
    <div id="content">
        <div class="no-entries">Loading...</div>
    </div>

    <!-- Synergy Submission Modal -->
    <div id="synergyModal" class="modal-overlay" onclick="closeSynergyModalOnOverlay(event)">
        <div class="synergy-card" onclick="event.stopPropagation()">
            <h2>Submit to Synergy</h2>

            <form id="synergyForm" onsubmit="submitToSynergy(event)">
                <div class="form-group">
                    <label for="entrySelect">Select Time Entry *</label>
                    <select id="entrySelect" required onchange="updateEntryPreview()">
                        <option value="">-- Select an entry --</option>
                    </select>
                    <div id="entryPreview"></div>
                </div>

                <div class="form-group">
                    <label for="synergyDate">Date *</label>
                    <input type="date" id="synergyDate" required>
                    <div class="help-text">Date for Synergy submission</div>
                </div>

                <div class="form-group">
                    <label for="synergyHours">Hours *</label>
                    <input type="number" id="synergyHours" step="0.25" min="0" max="24" required>
                    <div class="help-text">Number of hours to submit (will be auto-filled from entry)</div>
                </div>

                <div class="form-group">
                    <label for="synergyProjectCode">Project Code</label>
                    <input type="text" id="synergyProjectCode" placeholder="e.g., PROJ-123">
                    <div class="help-text">Project or task code in Synergy</div>
                </div>

                <div class="form-group">
                    <label for="synergyActivityType">Activity Type</label>
                    <input type="text" id="synergyActivityType" placeholder="e.g., Development, Testing, Meeting">
                    <div class="help-text">Type of work performed</div>
                </div>

                <div class="form-group">
                    <label for="synergyClient">Client</label>
                    <input type="text" id="synergyClient" placeholder="Client name">
                    <div class="help-text">Client name if applicable</div>
                </div>

                <div class="form-group">
                    <label for="synergyDescription">Description *</label>
                    <textarea id="synergyDescription" required placeholder="Describe the work performed..."></textarea>
                    <div class="help-text">Detailed description of work performed</div>
                </div>

                <div class="form-group">
                    <label for="synergyBillable">Billable</label>
                    <select id="synergyBillable">
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                    </select>
                </div>

                <div class="form-actions">
                    <button type="button" class="btn-secondary" onclick="closeSynergyModal()">Cancel</button>
                    <button type="submit" class="btn-primary">Submit to Synergy</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let allEntries = [];

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
                allEntries = message.entries;
                renderEntries(message.entries);
            }
        });

        function renderEntries(entries) {
            const content = document.getElementById('content');

            if (entries.length === 0) {
                content.innerHTML = '<div class="no-entries">No time entries found</div>';
                return;
            }

            content.innerHTML = \`
                <table>
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Start Time</th>
                            <th>End Time</th>
                            <th>Duration</th>
                            <th>Notes</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${entries.map(entry => \`
                            <tr>
                                <td>\${entry.projectName}</td>
                                <td>\${formatDateTime(entry.start_time)}</td>
                                <td>\${entry.end_time ? formatDateTime(entry.end_time) : 'In progress'}</td>
                                <td>\${formatDuration(entry.duration || 0)}</td>
                                <td>\${entry.notes || '-'}</td>
                                <td>
                                    <div class="actions">
                                        <button onclick="editEntry(\${entry.id})">Edit</button>
                                        <button class="delete" onclick="deleteEntry(\${entry.id})">Delete</button>
                                    </div>
                                </td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
        }

        function openSynergyModal() {
            // Populate the entry dropdown
            const entrySelect = document.getElementById('entrySelect');
            entrySelect.innerHTML = '<option value="">-- Select an entry --</option>';

            allEntries.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.id;
                option.textContent = \`\${entry.projectName} - \${formatDateTime(entry.start_time)} (\${formatDuration(entry.duration || 0)})\`;
                entrySelect.appendChild(option);
            });

            // Show modal
            document.getElementById('synergyModal').classList.add('active');
        }

        function closeSynergyModal() {
            document.getElementById('synergyModal').classList.remove('active');
            document.getElementById('synergyForm').reset();
            document.getElementById('entryPreview').innerHTML = '';
        }

        function closeSynergyModalOnOverlay(event) {
            if (event.target.id === 'synergyModal') {
                closeSynergyModal();
            }
        }

        function updateEntryPreview() {
            const entryId = parseInt(document.getElementById('entrySelect').value);
            const previewDiv = document.getElementById('entryPreview');

            if (!entryId) {
                previewDiv.innerHTML = '';
                return;
            }

            const entry = allEntries.find(e => e.id === entryId);
            if (!entry) {
                previewDiv.innerHTML = '';
                return;
            }

            // Auto-fill form fields
            const startDate = new Date(entry.start_time);
            document.getElementById('synergyDate').value = startDate.toISOString().split('T')[0];

            const hours = (entry.duration || 0) / 3600;
            document.getElementById('synergyHours').value = hours.toFixed(2);

            if (entry.notes) {
                document.getElementById('synergyDescription').value = entry.notes;
            }

            document.getElementById('synergyBillable').value = entry.is_billable ? 'yes' : 'no';

            // Show preview
            previewDiv.innerHTML = \`
                <div class="entry-preview">
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Project:</span>
                        <span class="entry-preview-value">\${entry.projectName}</span>
                    </div>
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Start:</span>
                        <span class="entry-preview-value">\${formatDateTime(entry.start_time)}</span>
                    </div>
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">End:</span>
                        <span class="entry-preview-value">\${entry.end_time ? formatDateTime(entry.end_time) : 'In progress'}</span>
                    </div>
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Duration:</span>
                        <span class="entry-preview-value">\${formatDuration(entry.duration || 0)}</span>
                    </div>
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Billable:</span>
                        <span class="entry-preview-value">\${entry.is_billable ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            \`;
        }

        function submitToSynergy(event) {
            event.preventDefault();

            const formData = {
                entryId: parseInt(document.getElementById('entrySelect').value),
                date: document.getElementById('synergyDate').value,
                hours: parseFloat(document.getElementById('synergyHours').value),
                projectCode: document.getElementById('synergyProjectCode').value,
                activityType: document.getElementById('synergyActivityType').value,
                client: document.getElementById('synergyClient').value,
                description: document.getElementById('synergyDescription').value,
                billable: document.getElementById('synergyBillable').value === 'yes'
            };

            // Send to VS Code extension
            vscode.postMessage({
                command: 'submitToSynergy',
                data: formData
            });

            closeSynergyModal();
        }

        function formatDateTime(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }

        function formatDuration(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return \`\${hours}h \${minutes}m\`;
        }

        function editEntry(entryId) {
            vscode.postMessage({ command: 'editEntry', entryId: entryId });
        }

        function deleteEntry(entryId) {
            vscode.postMessage({ command: 'deleteEntry', entryId: entryId });
        }

        // Request initial data
        vscode.postMessage({ command: 'getData' });
    </script>
</body>
</html>`;
}

// Synergy command handlers - Direct API Sync
async function testSynergyConnection(): Promise<void> {
    try {
        vscode.window.showInformationMessage('Testing Synergy connection...');
        const result = await synergyAuth.testConnection();

        if (result.success) {
            vscode.window.showInformationMessage(`✓ ${result.message}`);
        } else {
            vscode.window.showErrorMessage(`✗ Synergy connection failed: ${result.message}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to test connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function syncToSynergyNow(): Promise<void> {
    if (!synergyAuth.isEnabled()) {
        vscode.window.showWarningMessage('Synergy integration is not enabled. Please configure it in settings.');
        return;
    }

    try {
        // Get unsynced entries count first
        const status = synergySync.getSyncStatus();

        if (status.pending === 0) {
            vscode.window.showInformationMessage('All time entries are already synced to Synergy!');
            return;
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Syncing ${status.pending} time entries to Synergy...`,
            cancellable: false
        }, async (progress) => {
            const result = await synergySync.syncAllUnsyncedEntries();

            if (result.success) {
                vscode.window.showInformationMessage(
                    `✓ Successfully synced ${result.entriesSynced} of ${result.entriesProcessed} time entries to Synergy`
                );
            } else {
                let errorMessage = `Sync completed with errors: ${result.entriesSynced} succeeded, ${result.entriesFailed} failed`;

                if (result.errors.length > 0) {
                    errorMessage += `\n\nFirst error: ${result.errors[0].error}`;
                }

                vscode.window.showWarningMessage(errorMessage);
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function viewSynergySyncStatus(): Promise<void> {
    try {
        const status = synergySync.getSyncStatus();
        const enabled = synergyAuth.isEnabled();

        const statusLines = [
            `Synergy Integration Status:`,
            ``,
            `Enabled: ${enabled ? '✓ Yes' : '✗ No'}`,
            `Total Time Entries: ${status.total}`,
            `Synced to Synergy: ${status.synced}`,
            `Pending Sync: ${status.pending}`,
        ];

        if (!enabled) {
            statusLines.push('');
            statusLines.push('⚠ To enable Synergy integration, configure your credentials in settings.');
        } else if (status.pending > 0) {
            statusLines.push('');
            statusLines.push('💡 Run "Time Tracker: Sync to Synergy Now" to sync pending entries.');
        }

        vscode.window.showInformationMessage(statusLines.join('\n'), { modal: true });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to get sync status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Synergy command handlers - PSA Submission
async function submitToSynergy(): Promise<void> {
    if (!synergyService.isEnabled()) {
        const enable = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Synergy integration is not enabled. Enable it now?'
        });

        if (enable === 'Yes') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'timetracker.synergy');
        }
        return;
    }

    // Check if resource ID is configured
    const config = vscode.workspace.getConfiguration('timetracker.synergy');
    const resourceId = config.get<number>('resourceId');
    if (!resourceId) {
        const configure = await vscode.window.showWarningMessage(
            'Resource ID is not configured. This is required to submit time entries to Synergy.',
            'Open Settings',
            'Cancel'
        );

        if (configure === 'Open Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'timetracker.synergy.resourceId');
        }
        return;
    }

    // Get unsubmitted entries
    const unsubmittedEntries = db.getUnsubmittedTimeEntries();

    if (unsubmittedEntries.length === 0) {
        vscode.window.showInformationMessage('No time entries to submit to Synergy');
        return;
    }

    // Show selection of entries to submit
    const items = unsubmittedEntries.map(entry => {
        const project = db.getProjectById(entry.project_id);
        const startTime = new Date(entry.start_time);
        const hours = (entry.duration || 0) / 3600;

        return {
            label: `${project?.name || 'Unknown'} - ${hours.toFixed(2)}h`,
            description: startTime.toLocaleDateString(),
            detail: entry.notes || 'No description',
            entry: entry
        };
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select time entry to submit to Synergy',
        canPickMany: false
    });

    if (!selected) {
        return;
    }

    // Get description
    const description = await vscode.window.showInputBox({
        prompt: 'Enter description for Synergy',
        value: selected.entry.notes || '',
        placeHolder: 'Work description'
    });

    if (!description) {
        return;
    }

    // Get internal remarks
    const internalRemarks = await vscode.window.showInputBox({
        prompt: 'Enter internal remarks (optional)',
        placeHolder: 'Internal notes'
    });

    // Get external remarks
    const externalRemarks = await vscode.window.showInputBox({
        prompt: 'Enter external remarks (optional)',
        placeHolder: 'Customer-facing notes'
    });

    // Get project/customer (optional)
    const useCustomProject = await vscode.window.showQuickPick(['Use Default', 'Specify Project'], {
        placeHolder: 'Use default project or specify?'
    });

    let projectNo: string | undefined;
    let customerId: string | undefined;

    if (useCustomProject === 'Specify Project') {
        const projectInput = await vscode.window.showInputBox({
            prompt: 'Enter project number (or ProjectNo|CustomerID)',
            placeHolder: 'PROJECT-001 or PROJECT-001|customer-guid'
        });

        if (projectInput) {
            projectNo = projectInput;
        }
    }

    try {
        vscode.window.showInformationMessage('Submitting to Synergy...');

        const hours = (selected.entry.duration || 0) / 3600;
        const startTime = new Date(selected.entry.start_time);

        const result = await synergyService.submitTimeEntry(
            startTime,
            hours,
            description,
            {
                projectNo,
                customerId,
                internalRemarks,
                externalRemarks
            }
        );

        if (result.success) {
            // Mark as submitted in database
            db.markSynergySubmitted(
                selected.entry.id!,
                customerId || '',
                projectNo || '',
                JSON.stringify(result.data)
            );

            vscode.window.showInformationMessage('Successfully submitted to Synergy PSA');

            // Refresh sidebar
            sidebarProvider.refresh();
        } else {
            vscode.window.showErrorMessage(`Failed to submit to Synergy: ${result.error}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Error submitting to Synergy: ${error}`);
    }
}

async function testSynergyConnectionPSA(): Promise<void> {
    if (!synergyService.isEnabled()) {
        vscode.window.showWarningMessage('Synergy integration is not enabled. Please enable it in settings.');
        return;
    }

    vscode.window.showInformationMessage('Testing Synergy PSA connection...');

    try {
        const result = await synergyService.testConnection();

        if (result.success) {
            vscode.window.showInformationMessage(result.message);
        } else {
            vscode.window.showErrorMessage(result.message);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Connection test failed: ${error}`);
    }
}

// Synergy command handlers - Project Integration
async function syncSynergyProjects(): Promise<void> {
    if (!synergyIntegration.isEnabled()) {
        vscode.window.showWarningMessage(
            'Synergy integration is not enabled. Please configure it in settings.',
            'Open Settings'
        ).then(selection => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'timetracker.synergy');
            }
        });
        return;
    }

    try {
        vscode.window.showInformationMessage('Syncing projects from Synergy...');
        const syncedCount = await synergyIntegration.syncProjects();

        vscode.window.showInformationMessage(
            `Successfully synced ${syncedCount} new projects from Synergy`
        );

        // Refresh sidebar
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to sync Synergy projects: ${error}`);
    }
}

async function syncCustomersFromSynergy(): Promise<void> {
    try {
        // Get ResID from configuration
        const config = vscode.workspace.getConfiguration('timetracker');
        const resId = config.get<number>('synergy.resId');

        if (!resId) {
            const input = await vscode.window.showInputBox({
                prompt: 'Enter Synergy Resource ID (ResID)',
                placeHolder: 'e.g., 12345',
                validateInput: (value) => {
                    const num = parseInt(value);
                    return isNaN(num) ? 'Please enter a valid number' : null;
                }
            });

            if (!input) {
                return; // User cancelled
            }

            const inputResId = parseInt(input);

            // Ask if they want to save it
            const saveConfig = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Save this ResID to settings for future use?'
            });

            if (saveConfig === 'Yes') {
                await config.update('synergy.resId', inputResId, vscode.ConfigurationTarget.Global);
            }

            // Fetch customers with the provided ResID
            await fetchAndStoreCustomers(inputResId);
        } else {
            // Use saved ResID
            await fetchAndStoreCustomers(resId);
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to sync customers: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function fetchAndStoreCustomers(resId: number): Promise<void> {
    try {
        vscode.window.showInformationMessage('Syncing customers from Synergy...');

        // Fetch customers from Synergy API
        const customers = await synergyApi.getCustomers(resId);

        if (customers.length === 0) {
            vscode.window.showWarningMessage('No customers found for the given ResID');
            return;
        }

        // Transform and store in database
        const syncedCount = db.syncCustomers(
            customers.map(c => ({
                account_id: c.AccountID,
                account_name: c.AccountName
            })),
            resId
        );

        vscode.window.showInformationMessage(`Successfully synced ${syncedCount} customers from Synergy`);

        // Refresh sidebar to show updated customer list
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    } catch (error) {
        throw error; // Let the caller handle the error
    }
}

async function selectSynergyProject(): Promise<void> {
    if (!synergyIntegration.isEnabled()) {
        vscode.window.showWarningMessage(
            'Synergy integration is not enabled. Please configure it in settings.',
            'Open Settings'
        ).then(selection => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'timetracker.synergy');
            }
        });
        return;
    }

    try {
        const project = await synergyIntegration.selectAndTrackSynergyProject();

        if (!project) {
            return; // User cancelled
        }

        // Stop current tracking if any
        if (timeTracker.getTrackingState() !== TrackingState.STOPPED) {
            await timeTracker.stopTracking();
        }

        // Start tracking the selected Synergy project
        await timeTracker.startTrackingProject(project.path, project.name);
        vscode.window.showInformationMessage(`Started tracking: ${project.name}`);

        // Refresh sidebar
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to select Synergy project: ${error}`);
    }
}

export function deactivate() {
    if (timeTracker) {
        timeTracker.stop();
    }
    if (db) {
        db.close();
    }
}
