import * as vscode from 'vscode';
import * as path from 'path';
import { TimeTrackerDatabase } from './database/database';
import { TimeTracker, TrackingState } from './tracking/timeTracker';
import { SidebarProvider } from './views/sidebarProvider';
import { DataExporter } from './utils/exporter';
import { parseTimeString, parseDurationString } from './utils/formatters';
import { SynergyAuthService } from './services/synergyAuth';
import { SynergySyncService } from './services/synergySync';
import { SynergyService } from './services/synergyService';
import { SynergyIntegration } from './services/synergyIntegration';
import { SynergyApiService } from './services/synergyApiService';
import { PomodoroTimer, PomodoroPhase } from './tracking/pomodoroTimer';
import { RecentProjectsManager } from './tracking/recentProjects';
import { ProjectMapper } from './services/projectMapper';

let db: TimeTrackerDatabase;
let timeTracker: TimeTracker;
let sidebarProvider: SidebarProvider;
let exporter: DataExporter;
let statusBarItem: vscode.StatusBarItem;
let pomodoroStatusBarItem: vscode.StatusBarItem;
let synergyAuth: SynergyAuthService;
let synergySync: SynergySyncService;
let synergyService: SynergyService;
let synergyIntegration: SynergyIntegration;
let synergyApi: SynergyApiService;
let pomodoroTimer: PomodoroTimer;
let recentProjectsManager: RecentProjectsManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Time Tracker extension is activating...');

    // Create status bar items
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'timetracker.showDashboard';
    statusBarItem.tooltip = 'Click to open Time Tracker Dashboard';
    context.subscriptions.push(statusBarItem);
    statusBarItem.show();
    updateStatusBar({ state: 'stopped', sessionDuration: 0, todayTotal: 0 });

    // Create Pomodoro status bar item
    pomodoroStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    pomodoroStatusBarItem.command = 'timetracker.pomodoro.toggle';
    pomodoroStatusBarItem.tooltip = 'Click to start Pomodoro timer';
    context.subscriptions.push(pomodoroStatusBarItem);
    pomodoroStatusBarItem.text = '🍅 Pomodoro';
    pomodoroStatusBarItem.show();

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

        // Initialize Pomodoro timer
        console.log('Initializing Pomodoro timer...');
        const pomodoroWorkMinutes = config.get<number>('pomodoro.workDuration', 25);
        const pomodoroShortBreak = config.get<number>('pomodoro.shortBreakDuration', 5);
        const pomodoroLongBreak = config.get<number>('pomodoro.longBreakDuration', 15);
        const pomodoroCyclesBeforeLongBreak = config.get<number>('pomodoro.cyclesBeforeLongBreak', 4);
        pomodoroTimer = new PomodoroTimer(pomodoroWorkMinutes, pomodoroShortBreak, pomodoroLongBreak, pomodoroCyclesBeforeLongBreak);
        pomodoroTimer.onStatusUpdate((status) => {
            updatePomodoroStatusBar(status);
        });
        pomodoroTimer.onPhaseComplete((phase) => {
            handlePomodoroPhaseComplete(phase);
        });
        console.log('Pomodoro timer initialized successfully');

        // Initialize recent projects manager
        console.log('Initializing recent projects manager...');
        recentProjectsManager = new RecentProjectsManager(context);
        console.log('Recent projects manager initialized successfully');

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

        // Listen to time tracker status updates for status bar
        timeTracker.onStatusUpdate((status) => {
            updateStatusBar(status);
        });

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
            vscode.commands.registerCommand('timetracker.showCalendar', async () => {
                await showCalendar(context);
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

        // Synergy commands - Configure Employee ID
        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.configureEmployeeId', async () => {
                await configureEmployeeId();
            })
        );

        // Quick Switch commands
        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.quickSwitch', async () => {
                await showQuickSwitch();
            })
        );

        // Pomodoro commands
        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.pomodoro.toggle', async () => {
                await togglePomodoro();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.pomodoro.start', async () => {
                pomodoroTimer.startWork();
                vscode.window.showInformationMessage('🍅 Pomodoro work session started (25 min)');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.pomodoro.pause', async () => {
                pomodoroTimer.pause();
                vscode.window.showInformationMessage('⏸️ Pomodoro paused');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.pomodoro.resume', async () => {
                pomodoroTimer.resume();
                vscode.window.showInformationMessage('▶️ Pomodoro resumed');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.pomodoro.stop', async () => {
                pomodoroTimer.stop();
                vscode.window.showInformationMessage('⏹️ Pomodoro stopped');
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('timetracker.pomodoro.skip', async () => {
                pomodoroTimer.skip();
                vscode.window.showInformationMessage('⏭️ Pomodoro phase skipped');
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

        // Add to recent projects
        const project = timeTracker.getCurrentProject();
        if (project && recentProjectsManager) {
            recentProjectsManager.addProject(project);
        }

        vscode.window.showInformationMessage(`Started tracking: ${projectName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start tracking: ${error}`);
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

    // Get Synergy projects for dropdown
    const synergyProjects = synergyIntegration.getSynergyProjects().map(p => {
        const metadata = ProjectMapper.extractSynergyMetadata(p);
        return {
            projectNr: metadata?.projectNr || '',
            name: p.name,
            customerName: p.category || ''
        };
    });

    panel.webview.postMessage({
        command: 'updateData',
        entries: entries.map(e => ({
            ...e,
            projectName: projects.get(e.project_id) || 'Unknown'
        })),
        synergyProjects: synergyProjects
    });
}

async function addManualEntry(): Promise<void> {
    try {
        // Step 1: Select project
        const allProjects = db.getAllProjects();
        if (allProjects.length === 0) {
            vscode.window.showWarningMessage('No projects found. Please start tracking a project first.');
            return;
        }

        const projectItems = allProjects.map(p => ({
            label: p.name,
            description: p.path,
            project: p
        }));

        const selectedProject = await vscode.window.showQuickPick(projectItems, {
            placeHolder: 'Select a project for this entry',
            matchOnDescription: true
        });

        if (!selectedProject) {
            return; // User cancelled
        }

        // Step 2: Select date
        const dateInput = await vscode.window.showInputBox({
            prompt: 'Enter date (YYYY-MM-DD)',
            placeHolder: new Date().toISOString().split('T')[0],
            value: new Date().toISOString().split('T')[0],
            validateInput: (value) => {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(value)) {
                    return 'Please enter a valid date in YYYY-MM-DD format';
                }
                return null;
            }
        });

        if (!dateInput) {
            return; // User cancelled
        }

        // Step 3: Select start time
        const startTimeInput = await vscode.window.showInputBox({
            prompt: 'Enter start time (HH:MM)',
            placeHolder: '09:00',
            validateInput: (value) => {
                const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
                if (!timeRegex.test(value)) {
                    return 'Please enter a valid time in HH:MM format (24-hour)';
                }
                return null;
            }
        });

        if (!startTimeInput) {
            return; // User cancelled
        }

        // Step 4: Select duration or end time
        const durationChoice = await vscode.window.showQuickPick([
            { label: 'Enter duration', value: 'duration' },
            { label: 'Enter end time', value: 'endtime' }
        ], {
            placeHolder: 'How would you like to specify the time?'
        });

        if (!durationChoice) {
            return; // User cancelled
        }

        let durationSeconds = 0;
        let endTime = '';

        if (durationChoice.value === 'duration') {
            const durationInput = await vscode.window.showInputBox({
                prompt: 'Enter duration (e.g., "2h 30m" or "1.5h" or "90m")',
                placeHolder: '1h 30m',
                validateInput: (value) => {
                    try {
                        parseDurationString(value);
                        return null;
                    } catch (e) {
                        return 'Invalid duration format. Use formats like: 2h 30m, 1.5h, or 90m';
                    }
                }
            });

            if (!durationInput) {
                return; // User cancelled
            }

            durationSeconds = parseDurationString(durationInput);
        } else {
            const endTimeInput = await vscode.window.showInputBox({
                prompt: 'Enter end time (HH:MM)',
                placeHolder: '17:30',
                validateInput: (value) => {
                    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
                    if (!timeRegex.test(value)) {
                        return 'Please enter a valid time in HH:MM format (24-hour)';
                    }
                    return null;
                }
            });

            if (!endTimeInput) {
                return; // User cancelled
            }

            endTime = endTimeInput;

            // Calculate duration
            const [startHour, startMin] = startTimeInput.split(':').map(Number);
            const [endHour, endMin] = endTimeInput.split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            durationSeconds = (endMinutes - startMinutes) * 60;

            if (durationSeconds <= 0) {
                vscode.window.showErrorMessage('End time must be after start time');
                return;
            }
        }

        // Step 5: Add notes (optional)
        const notes = await vscode.window.showInputBox({
            prompt: 'Enter notes (optional)',
            placeHolder: 'Description of work performed...'
        });

        // Step 6: Billable?
        const billable = await vscode.window.showQuickPick([
            { label: 'Billable', value: true },
            { label: 'Non-billable', value: false }
        ], {
            placeHolder: 'Is this entry billable?'
        });

        if (!billable) {
            return; // User cancelled
        }

        // Create the time entry
        const startDateTime = new Date(`${dateInput}T${startTimeInput}:00`);
        const endDateTime = endTime ? new Date(`${dateInput}T${endTime}:00`) : null;

        db.createTimeEntry({
            project_id: selectedProject.project.id!,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime ? endDateTime.toISOString() : undefined,
            duration: durationSeconds,
            notes: notes || undefined,
            is_billable: billable.value,
            is_manual: true,
            synergy_synced: false
        });

        vscode.window.showInformationMessage(
            `✓ Manual entry added: ${selectedProject.project.name} - ${Math.floor(durationSeconds / 3600)}h ${Math.floor((durationSeconds % 3600) / 60)}m`
        );

        // Refresh sidebar if available
        if (sidebarProvider) {
            sidebarProvider.refresh();
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create manual entry: ${error}`);
    }
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

        /* Group/Detail Row Styles */
        .group-row {
            cursor: pointer;
            font-weight: 500;
        }

        .group-row:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .detail-row {
            background: var(--vscode-editor-background);
        }

        .detail-row:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .expand-icon {
            font-size: 10px;
            display: inline-block;
            width: 12px;
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
    </div>
    <div id="content">
        <div class="no-entries">Loading...</div>
    </div>

    <!-- Synergy Submission Modal -->
    <div id="synergyModal" class="modal-overlay" onclick="closeSynergyModalOnOverlay(event)">
        <div class="synergy-card" onclick="event.stopPropagation()">
            <h2>Submit to Synergy</h2>

            <form id="synergyForm" onsubmit="submitToSynergy(event)">
                <input type="hidden" id="selectedEntryId" value="">

                <div class="form-group">
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
                    <label for="synergyProjectCode">Project Code *</label>
                    <select id="synergyProjectCode" required>
                        <option value="">-- Select a project --</option>
                    </select>
                    <div class="help-text">Project or task code in Synergy</div>
                </div>

                <div class="form-group">
                    <label for="synergyActivityType">Activity Type</label>
                    <input type="text" id="synergyActivityType" value="Development" placeholder="e.g., Development, Testing, Meeting">
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
        let synergyProjects = [];
        let expandedGroups = new Set();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
                allEntries = message.entries;
                synergyProjects = message.synergyProjects || [];
                renderEntries(message.entries);
                populateProjectDropdown();
            }
        });

        function populateProjectDropdown() {
            const projectSelect = document.getElementById('synergyProjectCode');

            // Clear existing options except the first one
            projectSelect.innerHTML = '<option value="">-- Select a project --</option>';

            // Add Synergy projects to dropdown
            synergyProjects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.projectNr;
                option.textContent = \`\${project.projectNr} - \${project.name}\`;
                projectSelect.appendChild(option);
            });
        }

        function populateProjectDropdownSmart(entryProjectName) {
            const projectSelect = document.getElementById('synergyProjectCode');

            // Clear existing options
            projectSelect.innerHTML = '<option value="">-- Select a project --</option>';

            if (synergyProjects.length === 0) {
                return;
            }

            // Log for debugging
            console.log('Entry project name:', entryProjectName);

            // Normalize the entry name for better matching (remove special chars)
            const normalizedEntry = entryProjectName.toLowerCase().replace(/[\\s\\-_\\.\\/\\\\]+/g, '');
            const entryLower = entryProjectName.toLowerCase();

            // Extract keywords from entry project name (split by space, dash, underscore, etc.)
            const keywords = entryProjectName
                .toLowerCase()
                .split(/[\\s\\-_\\.\\/\\\\]+/)
                .filter(word => word.length > 0); // Keep all non-empty words (including single letters)

            console.log('Normalized entry:', normalizedEntry);
            console.log('Keywords:', keywords);

            // Score each project based on keyword matches
            const scoredProjects = synergyProjects.map(project => {
                // Create the full display text as it will appear in dropdown
                const displayText = \`\${project.projectNr} - \${project.name}\`;
                const projectText = displayText.toLowerCase();
                const normalizedProject = projectText.replace(/[\\s\\-_\\.\\/\\\\]+/g, '');
                let score = 0;

                // Check for exact match in normalized form (ignoring separators like spaces, dashes)
                if (normalizedProject.includes(normalizedEntry)) {
                    score += 100;
                }

                // Check for exact match with separators preserved
                if (projectText.includes(entryLower)) {
                    score += 50;
                }

                // Check for keyword matches
                keywords.forEach(keyword => {
                    // Exact substring match
                    if (projectText.includes(keyword)) {
                        score += 10;
                    }
                });

                if (score > 0) {
                    console.log('Match found:', displayText, 'Score:', score);
                }

                return { ...project, score, displayText };
            });

            // Sort by score (highest first), then alphabetically
            scoredProjects.sort((a, b) => {
                if (b.score !== a.score) {
                    return b.score - a.score;
                }
                return a.name.localeCompare(b.name);
            });

            // Add projects to dropdown
            scoredProjects.forEach((project, index) => {
                const option = document.createElement('option');
                option.value = project.projectNr;

                // Add visual separator after matched projects
                if (index === 0 && project.score > 0) {
                    option.textContent = \`⭐ \${project.projectNr} - \${project.name}\`;
                } else if (index > 0 && scoredProjects[index - 1].score > 0 && project.score === 0) {
                    // Add separator option
                    const separator = document.createElement('option');
                    separator.disabled = true;
                    separator.textContent = '─────────────────────';
                    projectSelect.appendChild(separator);
                    option.textContent = \`\${project.projectNr} - \${project.name}\`;
                } else if (project.score > 0) {
                    option.textContent = \`⭐ \${project.projectNr} - \${project.name}\`;
                } else {
                    option.textContent = \`\${project.projectNr} - \${project.name}\`;
                }

                projectSelect.appendChild(option);
            });
        }

        function renderEntries(entries) {
            const content = document.getElementById('content');

            if (entries.length === 0) {
                content.innerHTML = '<div class="no-entries">No time entries found</div>';
                return;
            }

            // Group entries by project and date
            const grouped = groupEntriesByProjectAndDate(entries);

            content.innerHTML = \`
                <table>
                    <thead>
                        <tr>
                            <th style="width: 30px;"></th>
                            <th>Date</th>
                            <th>Project</th>
                            <th>Start Time</th>
                            <th>End Time</th>
                            <th>Duration</th>
                            <th>Notes</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${grouped.map((group, groupIndex) => {
                            const groupKey = \`\${group.date}_\${group.projectId}\`;
                            const isExpanded = expandedGroups.has(groupKey);
                            const expandIcon = isExpanded ? '▼' : '▶';

                            let html = \`
                                <tr class="group-row" onclick="toggleGroup('\${groupKey}')">
                                    <td style="text-align: center; cursor: pointer; user-select: none;">
                                        <span class="expand-icon">\${expandIcon}</span>
                                    </td>
                                    <td>\${formatDate(group.date)}</td>
                                    <td><strong>\${group.projectName}</strong> <span style="color: var(--vscode-descriptionForeground);">(\${group.entryIds.length} entries)</span></td>
                                    <td>\${formatTime(group.startTime)}</td>
                                    <td>\${formatTime(group.endTime)}</td>
                                    <td><strong>\${formatDuration(group.totalDuration)}</strong></td>
                                    <td>\${group.notes || '-'}</td>
                                    <td>
                                        <div class="actions">
                                            <button onclick="event.stopPropagation(); openSynergyModal(\${group.entryIds[0]}, \${group.totalDuration})">Submit to Synergy</button>
                                            <button class="delete" onclick="event.stopPropagation(); deleteGroupedEntries(\${JSON.stringify(group.entryIds).replace(/"/g, '&quot;')})">Delete All</button>
                                        </div>
                                    </td>
                                </tr>
                            \`;

                            if (isExpanded) {
                                // Add individual entry rows
                                group.entries.forEach(entry => {
                                    html += \`
                                        <tr class="detail-row">
                                            <td></td>
                                            <td style="padding-left: 20px; color: var(--vscode-descriptionForeground);">↳</td>
                                            <td style="color: var(--vscode-descriptionForeground); font-size: 0.9em;">\${entry.projectName}</td>
                                            <td>\${formatTime(entry.start_time)}</td>
                                            <td>\${entry.end_time ? formatTime(entry.end_time) : 'In progress'}</td>
                                            <td>\${formatDuration(entry.duration || 0)}</td>
                                            <td style="font-size: 0.9em;">\${entry.notes || '-'}</td>
                                            <td>
                                                <div class="actions">
                                                    <button onclick="editEntry(\${entry.id})">Edit</button>
                                                    <button class="delete" onclick="deleteEntry(\${entry.id})">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    \`;
                                });
                            }

                            return html;
                        }).join('')}
                    </tbody>
                </table>
            \`;
        }

        function toggleGroup(groupKey) {
            if (expandedGroups.has(groupKey)) {
                expandedGroups.delete(groupKey);
            } else {
                expandedGroups.add(groupKey);
            }
            renderEntries(allEntries);
        }

        function groupEntriesByProjectAndDate(entries) {
            const groups = {};

            entries.forEach(entry => {
                const date = new Date(entry.start_time).toISOString().split('T')[0];
                const key = \`\${date}_\${entry.project_id}\`;

                if (!groups[key]) {
                    groups[key] = {
                        date: date,
                        projectId: entry.project_id,
                        projectName: entry.projectName,
                        startTime: entry.start_time,
                        endTime: entry.end_time,
                        totalDuration: 0,
                        notes: [],
                        entryIds: [],
                        entries: []
                    };
                }

                // Track earliest start time
                if (new Date(entry.start_time) < new Date(groups[key].startTime)) {
                    groups[key].startTime = entry.start_time;
                }

                // Track latest end time
                if (entry.end_time && (!groups[key].endTime || new Date(entry.end_time) > new Date(groups[key].endTime))) {
                    groups[key].endTime = entry.end_time;
                }

                // Sum durations
                groups[key].totalDuration += (entry.duration || 0);

                // Collect notes
                if (entry.notes && entry.notes.trim() !== '') {
                    groups[key].notes.push(entry.notes);
                }

                // Track entry IDs
                groups[key].entryIds.push(entry.id);

                // Store individual entries
                groups[key].entries.push(entry);
            });

            // Convert to array and format notes
            return Object.values(groups).map(group => ({
                ...group,
                notes: group.notes.length > 0 ? group.notes.join('; ') : null,
                entries: group.entries.sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
            })).sort((a, b) => new Date(b.date) - new Date(a.date) || new Date(b.startTime) - new Date(a.startTime));
        }

        function deleteGroupedEntries(entryIds) {
            if (!confirm(\`Delete all \${entryIds.length} entries for this project/day?\`)) {
                return;
            }

            entryIds.forEach(id => {
                vscode.postMessage({ command: 'deleteEntry', entryId: id });
            });
        }

        function openSynergyModal(entryId, totalDuration) {
            // Find the entry
            const entry = allEntries.find(e => e.id === entryId);
            if (!entry) {
                alert('Entry not found');
                return;
            }

            // Store the entry ID in hidden field
            document.getElementById('selectedEntryId').value = entryId;

            // Populate project dropdown with smart sorting based on entry project name
            populateProjectDropdownSmart(entry.projectName);

            // Auto-fill form fields
            const startDate = new Date(entry.start_time);
            document.getElementById('synergyDate').value = startDate.toISOString().split('T')[0];

            // Use totalDuration if provided (for grouped entries), otherwise use entry duration
            const duration = totalDuration !== undefined ? totalDuration : (entry.duration || 0);

            // Calculate hours rounded UP to 15-minute increments
            // Always round up: 1-15 min = 0.25, 16-30 min = 0.50, 31-45 min = 0.75, etc.
            const totalMinutes = Math.floor(duration / 60);
            const roundedMinutes = Math.ceil(totalMinutes / 15) * 15;
            const hours = roundedMinutes / 60;
            document.getElementById('synergyHours').value = hours.toFixed(2);

            // Set default activity type
            document.getElementById('synergyActivityType').value = 'Development';

            if (entry.notes) {
                document.getElementById('synergyDescription').value = entry.notes;
            } else {
                document.getElementById('synergyDescription').value = '';
            }

            document.getElementById('synergyBillable').value = entry.is_billable ? 'yes' : 'no';

            // Show preview
            const previewDiv = document.getElementById('entryPreview');
            const displayDuration = totalDuration !== undefined ? totalDuration : (entry.duration || 0);
            previewDiv.innerHTML = \`
                <div class="entry-preview">
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Project:</span>
                        <span class="entry-preview-value">\${entry.projectName}</span>
                    </div>
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Date:</span>
                        <span class="entry-preview-value">\${formatDate(entry.start_time)}</span>
                    </div>
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Total Duration:</span>
                        <span class="entry-preview-value">\${formatDuration(displayDuration)}</span>
                    </div>
                    <div class="entry-preview-row">
                        <span class="entry-preview-label">Billable:</span>
                        <span class="entry-preview-value">\${entry.is_billable ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            \`;

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

        function submitToSynergy(event) {
            event.preventDefault();

            const formData = {
                entryId: parseInt(document.getElementById('selectedEntryId').value),
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

        function formatDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString();
        }

        function formatTime(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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


function updateStatusBar(status: any): void {
    if (!statusBarItem) {
        return;
    }

    const state = status.state || 'stopped';
    const sessionDuration = status.sessionDuration || 0;
    const todayTotal = status.todayTotal || 0;

    // Format session time
    const hours = Math.floor(sessionDuration / 3600);
    const minutes = Math.floor((sessionDuration % 3600) / 60);
    const seconds = sessionDuration % 60;
    const sessionTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Format today's total
    const totalHours = Math.floor(todayTotal / 3600);
    const totalMinutes = Math.floor((todayTotal % 3600) / 60);
    const totalTime = `${totalHours}h ${totalMinutes}m`;

    // Status icons and colors
    let icon = '⏱️';
    let color = undefined;

    if (state === 'tracking') {
        icon = '▶️';
        color = '#4caf50';
    } else if (state === 'paused') {
        icon = '⏸️';
        color = '#ff9800';
    } else {
        icon = '⏹️';
        color = '#757575';
    }

    statusBarItem.text = `${icon} ${sessionTime} (Today: ${totalTime})`;
    statusBarItem.color = color;

    // Update tooltip with more details
    let tooltipText = `Time Tracker - ${state.charAt(0).toUpperCase() + state.slice(1)}\n`;
    tooltipText += `Session: ${sessionTime}\n`;
    tooltipText += `Today's Total: ${totalTime}`;

    if (status.currentProject) {
        tooltipText += `\nProject: ${status.currentProject.name}`;
    }

    tooltipText += '\n\nClick to open Dashboard';
    statusBarItem.tooltip = tooltipText;
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

async function handleSynergySubmission(data: any): Promise<void> {
    // Handle Synergy submission from webview
    try {
        if (data && data.entryId) {
            const entry = db.getTimeEntry(data.entryId);
            if (entry) {
                // Use the date from the form, not the entry's original date
                const startTime = data.date ? new Date(data.date) : new Date(entry.start_time);

                // Use the hours from the form, not calculated from entry duration
                const hours = data.hours ? parseFloat(data.hours) : (entry.duration || 0) / 3600;

                const description = data.description || entry.notes || 'Time tracking entry';

                await synergyService.submitTimeEntry(startTime, hours, description, {
                    projectNo: data.projectCode,
                    internalRemarks: data.notes
                });

                vscode.window.showInformationMessage('Time entry submitted to Synergy successfully');
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to submit to Synergy: ${error}`);
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

async function configureEmployeeId(): Promise<void> {
    const config = vscode.workspace.getConfiguration('timetracker');
    const currentEmployeeId = config.get<string>('synergy.employeeId', '');

    const employeeId = await vscode.window.showInputBox({
        prompt: 'Enter your Synergy Employee ID (ResID)',
        placeHolder: 'e.g., 12345',
        value: currentEmployeeId,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'Employee ID cannot be empty';
            }
            return null;
        }
    });

    if (!employeeId) {
        return; // User cancelled
    }

    try {
        // Save to global settings
        await config.update('synergy.employeeId', employeeId.trim(), vscode.ConfigurationTarget.Global);

        // Enable Synergy integration if not already enabled
        const isEnabled = config.get<boolean>('synergy.enabled', false);
        if (!isEnabled) {
            await config.update('synergy.enabled', true, vscode.ConfigurationTarget.Global);
        }

        vscode.window.showInformationMessage(
            `Employee ID configured successfully! You can now sync Synergy projects.`,
            'Sync Projects Now'
        ).then(selection => {
            if (selection === 'Sync Projects Now') {
                vscode.commands.executeCommand('timetracker.syncSynergyProjects');
            }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to configure Employee ID: ${error}`);
    }
}

// Quick Switch command handler
async function showQuickSwitch(): Promise<void> {
    const recentProjects = recentProjectsManager.getRecentProjects();

    if (recentProjects.length === 0) {
        vscode.window.showInformationMessage('No recent projects found. Start tracking a project first!');
        return;
    }

    // Create quick pick items
    const quickPickItems = recentProjects.map(project => ({
        label: project.name,
        description: project.path,
        detail: `Last tracked: ${new Date(project.updated_at!).toLocaleString()}`,
        project: project
    }));

    // Show quick pick
    const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a project to switch to',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) {
        return; // User cancelled
    }

    // Stop current tracking if any
    if (timeTracker.getTrackingState() !== TrackingState.STOPPED) {
        await timeTracker.stopTracking();
    }

    // Start tracking the selected project
    await timeTracker.startTrackingProject(selected.project.path, selected.project.name);
    recentProjectsManager.addProject(selected.project);

    vscode.window.showInformationMessage(`✓ Switched to: ${selected.project.name}`);

    // Refresh sidebar
    if (sidebarProvider) {
        sidebarProvider.refresh();
    }
}

// Pomodoro command handlers
async function togglePomodoro(): Promise<void> {
    const status = pomodoroTimer.getStatus();

    if (status.phase === PomodoroPhase.STOPPED) {
        // Show menu to start work or break
        const choice = await vscode.window.showQuickPick([
            { label: '🍅 Start Work Session', value: 'work' },
            { label: '☕ Start Short Break', value: 'short' },
            { label: '🌴 Start Long Break', value: 'long' }
        ], {
            placeHolder: 'Select Pomodoro mode'
        });

        if (!choice) {
            return;
        }

        if (choice.value === 'work') {
            pomodoroTimer.startWork();
        } else if (choice.value === 'short') {
            pomodoroTimer.startShortBreak();
        } else if (choice.value === 'long') {
            pomodoroTimer.startLongBreak();
        }
    } else if (status.isActive) {
        // Show menu for active pomodoro
        const choice = await vscode.window.showQuickPick([
            { label: '⏸️ Pause', value: 'pause' },
            { label: '⏹️ Stop', value: 'stop' },
            { label: '⏭️ Skip to Next Phase', value: 'skip' }
        ], {
            placeHolder: 'Pomodoro is running...'
        });

        if (!choice) {
            return;
        }

        if (choice.value === 'pause') {
            pomodoroTimer.pause();
        } else if (choice.value === 'stop') {
            pomodoroTimer.stop();
        } else if (choice.value === 'skip') {
            pomodoroTimer.skip();
        }
    } else {
        // Paused - show resume or stop
        const choice = await vscode.window.showQuickPick([
            { label: '▶️ Resume', value: 'resume' },
            { label: '⏹️ Stop', value: 'stop' }
        ], {
            placeHolder: 'Pomodoro is paused...'
        });

        if (!choice) {
            return;
        }

        if (choice.value === 'resume') {
            pomodoroTimer.resume();
        } else if (choice.value === 'stop') {
            pomodoroTimer.stop();
        }
    }
}

function updatePomodoroStatusBar(status: any): void {
    if (status.phase === PomodoroPhase.STOPPED) {
        pomodoroStatusBarItem.text = '🍅 Pomodoro';
        pomodoroStatusBarItem.tooltip = 'Click to start Pomodoro timer';
        pomodoroStatusBarItem.color = undefined;
        return;
    }

    const minutes = Math.floor(status.remainingSeconds / 60);
    const seconds = status.remainingSeconds % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    let icon = '🍅';
    let color = undefined;
    let label = '';

    switch (status.phase) {
        case PomodoroPhase.WORK:
            icon = status.isActive ? '🍅' : '⏸️';
            color = status.isActive ? '#4caf50' : '#ff9800';
            label = 'Work';
            break;
        case PomodoroPhase.SHORT_BREAK:
            icon = status.isActive ? '☕' : '⏸️';
            color = status.isActive ? '#2196f3' : '#ff9800';
            label = 'Break';
            break;
        case PomodoroPhase.LONG_BREAK:
            icon = status.isActive ? '🌴' : '⏸️';
            color = status.isActive ? '#2196f3' : '#ff9800';
            label = 'Long Break';
            break;
    }

    pomodoroStatusBarItem.text = `${icon} ${timeStr} ${label}`;
    pomodoroStatusBarItem.tooltip = `Pomodoro ${label} - ${timeStr} remaining\nCycle: ${status.cycleCount}\nClick for options`;
    pomodoroStatusBarItem.color = color;
}

function handlePomodoroPhaseComplete(phase: PomodoroPhase): void {
    // Integration with time tracker
    if (phase === PomodoroPhase.WORK) {
        // Optionally pause time tracking during break
        const config = vscode.workspace.getConfiguration('timetracker');
        const autoPauseOnBreak = config.get<boolean>('pomodoro.autoPauseOnBreak', true);

        if (autoPauseOnBreak && timeTracker.getTrackingState() === TrackingState.TRACKING) {
            timeTracker.pauseTracking();
        }
    } else if (phase === PomodoroPhase.SHORT_BREAK || phase === PomodoroPhase.LONG_BREAK) {
        // Optionally resume time tracking after break
        const config = vscode.workspace.getConfiguration('timetracker');
        const autoResumeAfterBreak = config.get<boolean>('pomodoro.autoResumeAfterBreak', false);

        if (autoResumeAfterBreak && timeTracker.getTrackingState() === TrackingState.PAUSED) {
            timeTracker.resumeTracking();
        }
    }
}

async function showCalendar(context: vscode.ExtensionContext): Promise<void> {
    // Create and show calendar webview panel
    const panel = vscode.window.createWebviewPanel(
        'timetrackerCalendar',
        'Time Tracker Calendar',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            localResourceRoots: [context.extensionUri],
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getCalendarHtml();

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async message => {
            switch (message.command) {
                case 'getEntries':
                    sendCalendarData(panel, message.startDate, message.endDate);
                    break;
                case 'createEntry':
                    await createTimeEntry(panel, message.entry);
                    break;
                case 'updateEntry':
                    await updateTimeEntry(panel, message.id, message.updates);
                    break;
                case 'deleteEntry':
                    await deleteCalendarTimeEntry(panel, message.id);
                    break;
                case 'duplicateEntry':
                    await duplicateTimeEntry(panel, message.id, message.newDate);
                    break;
                case 'getProjects':
                    sendProjectsList(panel);
                    break;
                case 'getCustomers':
                    sendCustomersList(panel);
                    break;
            }
        }
    );

    // Send initial data
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString();
    sendCalendarData(panel, startDate, endDate);
    sendProjectsList(panel);
    sendCustomersList(panel);
}

function sendCalendarData(panel: vscode.WebviewPanel, startDate: string, endDate: string): void {
    const entries = db.getTimeEntriesForDateRange(startDate, endDate);
    const projects = db.getAllProjects();
    const customers = db.getAllCustomers();

    // Transform entries into calendar events
    const events = entries.map(entry => {
        const project = projects.find(p => p.id === entry.project_id);
        const customer = customers.find(c => c.id === entry.customer_id);

        // Determine color based on synergy submission status and billable status
        let backgroundColor: string;
        let borderColor: string;
        let title = project?.name || 'Unknown Project';

        if (entry.synergy_submitted) {
            // Submitted to Synergy - Purple
            backgroundColor = '#9c27b0';
            borderColor = '#7b1fa2';
            title = '✓ ' + title;
        } else if (entry.synergy_synced) {
            // Synced but not submitted - Orange
            backgroundColor = '#ff9800';
            borderColor = '#f57c00';
            title = '⚠ ' + title;
        } else if (entry.is_billable) {
            // Billable but not synced - Green
            backgroundColor = '#4caf50';
            borderColor = '#388e3c';
        } else {
            // Non-billable - Blue
            backgroundColor = '#2196f3';
            borderColor = '#1976d2';
        }

        // Synced or submitted entries cannot be edited
        const isEditable = !entry.synergy_synced && !entry.synergy_submitted;

        return {
            id: entry.id,
            title: title,
            start: entry.start_time,
            end: entry.end_time,
            backgroundColor: backgroundColor,
            borderColor: borderColor,
            editable: isEditable,
            startEditable: isEditable,
            durationEditable: isEditable,
            extendedProps: {
                projectId: entry.project_id,
                projectName: project?.name,
                customerId: entry.customer_id,
                customerName: customer?.account_name,
                duration: entry.duration,
                notes: entry.notes,
                isBillable: entry.is_billable,
                isManual: entry.is_manual,
                synergySynced: entry.synergy_synced,
                synergySubmitted: entry.synergy_submitted,
                synergySyncDate: entry.synergy_sync_date,
                synergySubmissionDate: entry.synergy_submission_date,
                synergyId: entry.synergy_id
            }
        };
    });

    panel.webview.postMessage({
        command: 'updateEvents',
        events
    });
}

function sendProjectsList(panel: vscode.WebviewPanel): void {
    const projects = db.getAllProjects();
    panel.webview.postMessage({
        command: 'updateProjects',
        projects
    });
}

function sendCustomersList(panel: vscode.WebviewPanel): void {
    const customers = db.getAllCustomers();
    panel.webview.postMessage({
        command: 'updateCustomers',
        customers
    });
}

async function createTimeEntry(panel: vscode.WebviewPanel, entry: any): Promise<void> {
    try {
        const timeEntry = {
            project_id: entry.projectId,
            customer_id: entry.customerId || undefined,
            start_time: entry.start,
            end_time: entry.end,
            duration: entry.duration,
            is_manual: true,
            notes: entry.notes || '',
            is_billable: entry.isBillable || false,
            synergy_synced: false
        };

        const id = db.createTimeEntry(timeEntry);

        panel.webview.postMessage({
            command: 'entryCreated',
            success: true,
            id
        });

        // Refresh calendar data
        const startDate = new Date(entry.start);
        startDate.setDate(1);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        sendCalendarData(panel, startDate.toISOString(), endDate.toISOString());

        vscode.window.showInformationMessage('Time entry created successfully');
    } catch (error) {
        panel.webview.postMessage({
            command: 'entryCreated',
            success: false,
            error: String(error)
        });
        vscode.window.showErrorMessage(`Failed to create time entry: ${error}`);
    }
}

async function updateTimeEntry(panel: vscode.WebviewPanel, id: number, updates: any): Promise<void> {
    try {
        const dbUpdates: any = {};

        if (updates.projectId !== undefined) { dbUpdates.project_id = updates.projectId; }
        if (updates.customerId !== undefined) { dbUpdates.customer_id = updates.customerId; }
        if (updates.start !== undefined) { dbUpdates.start_time = updates.start; }
        if (updates.end !== undefined) { dbUpdates.end_time = updates.end; }
        if (updates.duration !== undefined) { dbUpdates.duration = updates.duration; }
        if (updates.notes !== undefined) { dbUpdates.notes = updates.notes; }
        if (updates.isBillable !== undefined) { dbUpdates.is_billable = updates.isBillable; }

        db.updateTimeEntry(id, dbUpdates);

        panel.webview.postMessage({
            command: 'entryUpdated',
            success: true,
            id
        });

        // Refresh calendar data
        const entry = db.getTimeEntryById(id);
        if (entry) {
            const startDate = new Date(entry.start_time);
            startDate.setDate(1);
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            sendCalendarData(panel, startDate.toISOString(), endDate.toISOString());
        }

        vscode.window.showInformationMessage('Time entry updated successfully');
    } catch (error) {
        panel.webview.postMessage({
            command: 'entryUpdated',
            success: false,
            error: String(error)
        });
        vscode.window.showErrorMessage(`Failed to update time entry: ${error}`);
    }
}

async function deleteCalendarTimeEntry(panel: vscode.WebviewPanel, id: number): Promise<void> {
    try {
        const entry = db.getTimeEntryById(id);
        db.deleteTimeEntry(id);

        panel.webview.postMessage({
            command: 'entryDeleted',
            success: true,
            id
        });

        // Refresh calendar data
        if (entry) {
            const startDate = new Date(entry.start_time);
            startDate.setDate(1);
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            sendCalendarData(panel, startDate.toISOString(), endDate.toISOString());
        }

        vscode.window.showInformationMessage('Time entry deleted successfully');
    } catch (error) {
        panel.webview.postMessage({
            command: 'entryDeleted',
            success: false,
            error: String(error)
        });
        vscode.window.showErrorMessage(`Failed to delete time entry: ${error}`);
    }
}

async function duplicateTimeEntry(panel: vscode.WebviewPanel, id: number, newDate: string): Promise<void> {
    try {
        const original = db.getTimeEntryById(id);
        if (!original) {
            throw new Error('Original entry not found');
        }

        // Calculate new times based on new date
        const originalStart = new Date(original.start_time);
        const newStart = new Date(newDate);
        newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), originalStart.getSeconds());

        let newEnd: string | undefined;
        if (original.end_time) {
            const originalEnd = new Date(original.end_time);
            const newEndDate = new Date(newDate);
            newEndDate.setHours(originalEnd.getHours(), originalEnd.getMinutes(), originalEnd.getSeconds());
            newEnd = newEndDate.toISOString();
        }

        const duplicatedEntry = {
            project_id: original.project_id,
            customer_id: original.customer_id,
            start_time: newStart.toISOString(),
            end_time: newEnd,
            duration: original.duration,
            is_manual: true,
            notes: original.notes ? `${original.notes} (duplicated)` : 'Duplicated entry',
            is_billable: original.is_billable,
            synergy_synced: false
        };

        const newId = db.createTimeEntry(duplicatedEntry);

        panel.webview.postMessage({
            command: 'entryDuplicated',
            success: true,
            id: newId
        });

        // Refresh calendar data
        const startDate = new Date(newStart);
        startDate.setDate(1);
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        sendCalendarData(panel, startDate.toISOString(), endDate.toISOString());

        vscode.window.showInformationMessage('Time entry duplicated successfully');
    } catch (error) {
        panel.webview.postMessage({
            command: 'entryDuplicated',
            success: false,
            error: String(error)
        });
        vscode.window.showErrorMessage(`Failed to duplicate time entry: ${error}`);
    }
}

function getCalendarHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Time Tracker Calendar</title>
    <link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js"></script>
    <style>
        :root {
            --fc-border-color: var(--vscode-panel-border);
            --fc-button-bg-color: var(--vscode-button-background);
            --fc-button-border-color: var(--vscode-button-background);
            --fc-button-hover-bg-color: var(--vscode-button-hoverBackground);
            --fc-button-hover-border-color: var(--vscode-button-hoverBackground);
            --fc-button-active-bg-color: var(--vscode-button-hoverBackground);
            --fc-button-active-border-color: var(--vscode-button-hoverBackground);
            --fc-event-bg-color: var(--vscode-button-background);
            --fc-event-border-color: var(--vscode-button-background);
            --fc-today-bg-color: var(--vscode-editor-selectionBackground);
        }

        body {
            padding: 20px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            margin: 0;
        }

        #calendar {
            max-width: 1400px;
            margin: 0 auto;
        }

        .fc {
            color: var(--vscode-foreground);
        }

        .fc-toolbar-title {
            color: var(--vscode-foreground);
        }

        .fc-col-header-cell {
            background-color: var(--vscode-editor-background);
            color: var(--vscode-foreground);
        }

        .fc-daygrid-day-number {
            color: var(--vscode-foreground);
        }

        .fc-button {
            color: var(--vscode-button-foreground) !important;
            background-color: var(--vscode-button-background) !important;
            border-color: var(--vscode-button-background) !important;
        }

        .fc-button:hover {
            background-color: var(--vscode-button-hoverBackground) !important;
            border-color: var(--vscode-button-hoverBackground) !important;
        }

        .fc-button-active {
            background-color: var(--vscode-button-hoverBackground) !important;
        }

        /* Modal styles */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
        }

        .modal-content {
            background-color: var(--vscode-editor-background);
            margin: 5% auto;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            width: 80%;
            max-width: 600px;
            border-radius: 4px;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .modal-header h2 {
            margin: 0;
            color: var(--vscode-foreground);
        }

        .close {
            color: var(--vscode-foreground);
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
            background: none;
            border: none;
        }

        .close:hover {
            color: var(--vscode-errorForeground);
        }

        .form-group {
            margin-bottom: 15px;
        }

        .form-group label {
            display: block;
            margin-bottom: 5px;
            color: var(--vscode-foreground);
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            box-sizing: border-box;
        }

        .form-group textarea {
            min-height: 80px;
            resize: vertical;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }

        .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }

        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        button.danger {
            background-color: var(--vscode-errorBackground);
            color: var(--vscode-errorForeground);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .checkbox-group input[type="checkbox"] {
            width: auto;
        }

        .time-inputs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }

        .fc-event {
            cursor: pointer;
        }

        .fc-event:not(.fc-event-draggable) {
            cursor: not-allowed;
            opacity: 0.85;
        }

        .fc-event:not(.fc-event-draggable):hover {
            opacity: 1;
        }

        /* Legend styles */
        .legend {
            max-width: 1400px;
            margin: 20px auto;
            padding: 15px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .legend-title {
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--vscode-foreground);
            font-size: 14px;
        }

        .legend-items {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .legend-color {
            width: 20px;
            height: 20px;
            border-radius: 3px;
            border: 2px solid;
        }

        .legend-color.submitted {
            background-color: #9c27b0;
            border-color: #7b1fa2;
        }

        .legend-color.synced {
            background-color: #ff9800;
            border-color: #f57c00;
        }

        .legend-color.billable {
            background-color: #4caf50;
            border-color: #388e3c;
        }

        .legend-color.non-billable {
            background-color: #2196f3;
            border-color: #1976d2;
        }
        /* Stats panel styles */
        .stats-panel {
            max-width: 1400px;
            margin: 20px auto;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 15px;
        }

        .stat-card {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
        }

        .stat-title {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            text-transform: uppercase;
            font-weight: 600;
        }

        .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: var(--vscode-foreground);
            font-family: 'Courier New', monospace;
        }

        .stat-subtitle {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }

        .stat-progress-bar {
            height: 8px;
            background: var(--vscode-editor-background);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 10px;
            border: 1px solid var(--vscode-panel-border);
        }

        .stat-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4caf50 0%, #66bb6a 100%);
            transition: width 0.3s ease;
        }

        .stat-progress-fill.warning {
            background: linear-gradient(90deg, #ff9800 0%, #ffa726 100%);
        }

        .stat-progress-fill.complete {
            background: linear-gradient(90deg, #2196f3 0%, #42a5f5 100%);
        }

        /* Filter panel styles */
        .filters-panel {
            max-width: 1400px;
            margin: 20px auto;
            padding: 15px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
        }

        .filters-title {
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--vscode-foreground);
            font-size: 14px;
        }

        .filters-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }

        .filter-group {
            display: flex;
            flex-direction: column;
            gap: 5px;
        }

        .filter-label {
            font-size: 12px;
            color: var(--vscode-foreground);
            font-weight: 500;
        }

        .filter-select {
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 12px;
        }

        .filter-checkbox-group {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
        }

        /* Day number with total styles */
        .fc-daygrid-day-top {
            position: relative;
        }

        .day-total {
            position: absolute;
            top: 2px;
            right: 4px;
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 5px;
            border-radius: 3px;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <!-- Statistics Panel -->
    <div class="stats-panel">
        <div class="stat-card">
            <div class="stat-title">This Week</div>
            <div class="stat-value" id="weekHours">0h 0m</div>
            <div class="stat-subtitle" id="weekGoal">Goal: 40h (0%)</div>
            <div class="stat-progress-bar">
                <div class="stat-progress-fill" id="weekProgress" style="width: 0%"></div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-title">This Month</div>
            <div class="stat-value" id="monthHours">0h 0m</div>
            <div class="stat-subtitle" id="monthSubtitle">Billable: 0h | Non-billable: 0h</div>
        </div>
        <div class="stat-card">
            <div class="stat-title">Current View</div>
            <div class="stat-value" id="viewHours">0h 0m</div>
            <div class="stat-subtitle" id="viewSubtitle">0 entries</div>
        </div>
        <div class="stat-card">
            <div class="stat-title">Synergy Status</div>
            <div class="stat-value" id="synergyStats" style="font-size: 16px;">-</div>
            <div class="stat-subtitle" id="synergySubtitle">Submitted: 0 | Pending: 0</div>
        </div>
    </div>

    <!-- Filters Panel -->
    <div class="filters-panel">
        <div class="filters-title">Filters</div>
        <div class="filters-grid">
            <div class="filter-group">
                <label class="filter-label">Project</label>
                <select id="filterProject" class="filter-select" onchange="applyFilters()">
                    <option value="">All Projects</option>
                </select>
            </div>
            <div class="filter-group">
                <label class="filter-label">Status</label>
                <select id="filterStatus" class="filter-select" onchange="applyFilters()">
                    <option value="">All Statuses</option>
                    <option value="submitted">Submitted to Synergy</option>
                    <option value="synced">Synced (Not Submitted)</option>
                    <option value="billable">Billable (Not Synced)</option>
                    <option value="non-billable">Non-Billable</option>
                </select>
            </div>
            <div class="filter-group">
                <label class="filter-label">Options</label>
                <div class="filter-checkbox-group">
                    <input type="checkbox" id="filterBillableOnly" onchange="applyFilters()">
                    <label for="filterBillableOnly">Billable Only</label>
                </div>
            </div>
            <div class="filter-group">
                <button onclick="clearFilters()" style="margin-top: 18px; padding: 6px 12px;">Clear Filters</button>
            </div>
        </div>
    </div>

    <!-- Quick Actions Bar -->
    <div class="filters-panel" style="margin-top: 0;">
        <div class="filters-title">Quick Actions</div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button onclick="showTemplatesModal()" style="padding: 8px 16px;">📋 Templates</button>
            <button onclick="copyCurrentWeek()" style="padding: 8px 16px;">📅 Copy This Week to Next</button>
            <button onclick="showRecurringModal()" style="padding: 8px 16px;">🔁 Create Recurring Entry</button>
        </div>
    </div>

    <div id="calendar"></div>

    <!-- Legend -->
    <div class="legend">
        <div class="legend-title">Entry Status</div>
        <div class="legend-items">
            <div class="legend-item">
                <div class="legend-color submitted"></div>
                <span>✓ Submitted to Synergy (Read-Only)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color synced"></div>
                <span>⚠ Synced - Not Submitted (Read-Only)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color billable"></div>
                <span>Billable (Not Synced)</span>
            </div>
            <div class="legend-item">
                <div class="legend-color non-billable"></div>
                <span>Non-Billable</span>
            </div>
        </div>
        <div style="margin-top: 10px; font-size: 11px; color: var(--vscode-descriptionForeground);">
            🔒 Synced and submitted entries cannot be edited, moved, or resized.
        </div>
    </div>

    <!-- Entry Form Modal -->
    <div id="entryModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="modalTitle">Create Time Entry</h2>
                <button class="close" onclick="closeModal()">&times;</button>
            </div>
            <form id="entryForm">
                <input type="hidden" id="entryId">

                <div class="form-group">
                    <label for="projectSelect">Project *</label>
                    <select id="projectSelect" required>
                        <option value="">Select a project...</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="customerSelect">Customer</label>
                    <select id="customerSelect">
                        <option value="">None</option>
                    </select>
                </div>

                <div class="form-group time-inputs">
                    <div>
                        <label for="startTime">Start Time *</label>
                        <input type="datetime-local" id="startTime" required>
                    </div>
                    <div>
                        <label for="endTime">End Time *</label>
                        <input type="datetime-local" id="endTime" required>
                    </div>
                </div>

                <div class="form-group">
                    <label for="notes">Notes</label>
                    <textarea id="notes"></textarea>
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="isBillable">
                    <label for="isBillable">Billable</label>
                </div>

                <!-- Synergy Status Section (shown only for existing entries) -->
                <div id="synergyStatusSection" class="form-group" style="display: none;">
                    <label>Synergy Status</label>
                    <div id="synergyStatusInfo" style="padding: 10px; background: var(--vscode-editor-background); border-radius: 3px; font-size: 12px;">
                        <div id="synergySubmittedStatus"></div>
                        <div id="synergySyncedStatus"></div>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="button" class="secondary" onclick="closeModal()">Cancel</button>
                    <button type="button" class="danger" id="deleteBtn" style="display: none;" onclick="deleteEntry()">Delete</button>
                    <button type="button" id="duplicateBtn" style="display: none;" onclick="duplicateEntry()">Duplicate</button>
                    <button type="submit">Save</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Templates Modal -->
    <div id="templatesModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Entry Templates</h2>
                <button class="close" onclick="closeTemplatesModal()">&times;</button>
            </div>
            <div style="margin-bottom: 20px;">
                <button onclick="saveCurrentAsTemplate()" style="padding: 8px 16px;">💾 Save Current Entry as Template</button>
            </div>
            <div id="templatesList" style="max-height: 400px; overflow-y: auto;">
                <p style="color: var(--vscode-descriptionForeground); text-align: center; padding: 20px;">No templates saved yet.</p>
            </div>
        </div>
    </div>

    <!-- Recurring Entry Modal -->
    <div id="recurringModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create Recurring Entry</h2>
                <button class="close" onclick="closeRecurringModal()">&times;</button>
            </div>
            <form id="recurringForm">
                <div class="form-group">
                    <label for="recurringProject">Project *</label>
                    <select id="recurringProject" required>
                        <option value="">Select a project...</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="recurringCustomer">Customer</label>
                    <select id="recurringCustomer">
                        <option value="">None</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Days of Week *</label>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 8px;">
                        <label class="filter-checkbox-group"><input type="checkbox" id="dayMon" value="1"> Monday</label>
                        <label class="filter-checkbox-group"><input type="checkbox" id="dayTue" value="2"> Tuesday</label>
                        <label class="filter-checkbox-group"><input type="checkbox" id="dayWed" value="3"> Wednesday</label>
                        <label class="filter-checkbox-group"><input type="checkbox" id="dayThu" value="4"> Thursday</label>
                        <label class="filter-checkbox-group"><input type="checkbox" id="dayFri" value="5"> Friday</label>
                        <label class="filter-checkbox-group"><input type="checkbox" id="daySat" value="6"> Saturday</label>
                        <label class="filter-checkbox-group"><input type="checkbox" id="daySun" value="0"> Sunday</label>
                    </div>
                </div>

                <div class="form-group time-inputs">
                    <div>
                        <label for="recurringStartTime">Start Time *</label>
                        <input type="time" id="recurringStartTime" required value="09:00">
                    </div>
                    <div>
                        <label for="recurringEndTime">End Time *</label>
                        <input type="time" id="recurringEndTime" required value="10:00">
                    </div>
                </div>

                <div class="form-group">
                    <label for="recurringWeeks">Number of Weeks *</label>
                    <input type="number" id="recurringWeeks" min="1" max="52" value="10" required>
                    <div class="stat-subtitle">Entries will be created for the selected days over this many weeks</div>
                </div>

                <div class="form-group">
                    <label for="recurringStartDate">Start Date *</label>
                    <input type="date" id="recurringStartDate" required>
                </div>

                <div class="form-group">
                    <label for="recurringNotes">Notes</label>
                    <textarea id="recurringNotes" placeholder="Optional notes for all entries"></textarea>
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="recurringBillable">
                    <label for="recurringBillable">Billable</label>
                </div>

                <div class="form-actions">
                    <button type="button" class="secondary" onclick="closeRecurringModal()">Cancel</button>
                    <button type="submit">Create Entries</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Duplicate Entry Modal -->
    <div id="duplicateModal" class="modal">
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2>Duplicate Entry</h2>
                <button class="close" onclick="closeDuplicateModal()">&times;</button>
            </div>
            <form id="duplicateForm">
                <div class="form-group">
                    <label for="duplicateDate">New Date *</label>
                    <input type="date" id="duplicateDate" required>
                </div>
                <div class="form-actions">
                    <button type="button" class="secondary" onclick="closeDuplicateModal()">Cancel</button>
                    <button type="submit">Duplicate</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let calendar;
        let currentEvents = [];
        let projects = [];
        let customers = [];
        let selectedEvent = null;
        let templates = [];
        let duplicateEntryId = null;

        document.addEventListener('DOMContentLoaded', function() {
            const calendarEl = document.getElementById('calendar');
            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
                editable: true,
                droppable: true,
                eventDurationEditable: true,
                eventStartEditable: true,
                dateClick: handleDateClick,
                eventClick: handleEventClick,
                eventDrop: handleEventDrop,
                eventResize: handleEventResize,
                datesSet: handleDatesSet,
                height: 'auto'
            });
            calendar.render();

            // Set up form submission
            document.getElementById('entryForm').addEventListener('submit', handleFormSubmit);

            // Set up recurring form submission
            document.getElementById('recurringForm').addEventListener('submit', function(e) {
                e.preventDefault();

                const projectId = parseInt(document.getElementById('recurringProject').value);
                const customerId = document.getElementById('recurringCustomer').value ? parseInt(document.getElementById('recurringCustomer').value) : null;
                const startTime = document.getElementById('recurringStartTime').value;
                const endTime = document.getElementById('recurringEndTime').value;
                const weeks = parseInt(document.getElementById('recurringWeeks').value);
                const startDate = new Date(document.getElementById('recurringStartDate').value);
                const notes = document.getElementById('recurringNotes').value;
                const isBillable = document.getElementById('recurringBillable').checked;

                // Get selected days
                const selectedDays = [];
                if (document.getElementById('dayMon').checked) selectedDays.push(1);
                if (document.getElementById('dayTue').checked) selectedDays.push(2);
                if (document.getElementById('dayWed').checked) selectedDays.push(3);
                if (document.getElementById('dayThu').checked) selectedDays.push(4);
                if (document.getElementById('dayFri').checked) selectedDays.push(5);
                if (document.getElementById('daySat').checked) selectedDays.push(6);
                if (document.getElementById('daySun').checked) selectedDays.push(0);

                if (selectedDays.length === 0) {
                    return;
                }

                // Calculate duration
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                const duration = (endH * 3600 + endM * 60) - (startH * 3600 + startM * 60);

                if (duration <= 0) {
                    return;
                }

                const totalEntries = weeks * selectedDays.length;

                // Generate entries
                for (let week = 0; week < weeks; week++) {
                    selectedDays.forEach(dayOfWeek => {
                        const entryDate = new Date(startDate);
                        entryDate.setDate(startDate.getDate() + (week * 7));

                        // Find the correct day in this week
                        const currentDay = entryDate.getDay();
                        const daysToAdd = (dayOfWeek - currentDay + 7) % 7;
                        entryDate.setDate(entryDate.getDate() + daysToAdd);

                        const entryStart = new Date(entryDate);
                        entryStart.setHours(startH, startM, 0, 0);

                        const entryEnd = new Date(entryDate);
                        entryEnd.setHours(endH, endM, 0, 0);

                        vscode.postMessage({
                            command: 'createEntry',
                            entry: {
                                projectId: projectId,
                                customerId: customerId,
                                start: entryStart.toISOString(),
                                end: entryEnd.toISOString(),
                                duration: duration,
                                notes: notes,
                                isBillable: isBillable
                            }
                        });
                    });
                }

                closeRecurringModal();

                // Refresh calendar after a short delay
                setTimeout(() => {
                    const viewStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1).toISOString();
                    const viewEnd = new Date(startDate.getFullYear(), startDate.getMonth() + (Math.ceil(weeks / 4) + 2), 0).toISOString();
                    vscode.postMessage({
                        command: 'getEntries',
                        startDate: viewStart,
                        endDate: viewEnd
                    });
                }, 1000);
            });

            // Set up duplicate form submission
            document.getElementById('duplicateForm').addEventListener('submit', function(e) {
                e.preventDefault();
                const newDate = document.getElementById('duplicateDate').value;

                if (duplicateEntryId && newDate) {
                    vscode.postMessage({
                        command: 'duplicateEntry',
                        id: duplicateEntryId,
                        newDate: newDate
                    });
                    closeDuplicateModal();

                    // Refresh calendar
                    setTimeout(() => {
                        const dateObj = new Date(newDate);
                        const viewStart = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1).toISOString();
                        const viewEnd = new Date(dateObj.getFullYear(), dateObj.getMonth() + 2, 0).toISOString();
                        vscode.postMessage({
                            command: 'getEntries',
                            startDate: viewStart,
                            endDate: viewEnd
                        });
                    }, 500);
                }
            });
        });

        function handleDatesSet(info) {
            // Request data for the visible date range
            vscode.postMessage({
                command: 'getEntries',
                startDate: info.start.toISOString(),
                endDate: info.end.toISOString()
            });
        }

        function handleDateClick(info) {
            selectedEvent = null;
            openModal('Create Time Entry', info.dateStr);
        }

        function handleEventClick(info) {
            selectedEvent = info.event;
            openModal('Edit Time Entry', null, info.event);
        }

        function handleEventDrop(info) {
            const event = info.event;
            const updates = {
                start: event.start.toISOString(),
                end: event.end ? event.end.toISOString() : null,
                duration: event.end ? Math.floor((event.end - event.start) / 1000) : null
            };

            vscode.postMessage({
                command: 'updateEntry',
                id: parseInt(event.id),
                updates: updates
            });
        }

        function handleEventResize(info) {
            const event = info.event;
            const updates = {
                end: event.end ? event.end.toISOString() : null,
                duration: event.end ? Math.floor((event.end - event.start) / 1000) : null
            };

            vscode.postMessage({
                command: 'updateEntry',
                id: parseInt(event.id),
                updates: updates
            });
        }

        function openModal(title, dateStr, event) {
            document.getElementById('modalTitle').textContent = title;
            const modal = document.getElementById('entryModal');
            const form = document.getElementById('entryForm');
            form.reset();

            if (event) {
                // Edit mode
                document.getElementById('entryId').value = event.id;
                document.getElementById('projectSelect').value = event.extendedProps.projectId;
                document.getElementById('customerSelect').value = event.extendedProps.customerId || '';
                document.getElementById('startTime').value = formatDateTimeLocal(event.start);
                document.getElementById('endTime').value = event.end ? formatDateTimeLocal(event.end) : '';
                document.getElementById('notes').value = event.extendedProps.notes || '';
                document.getElementById('isBillable').checked = event.extendedProps.isBillable;
                document.getElementById('deleteBtn').style.display = 'inline-block';
                document.getElementById('duplicateBtn').style.display = 'inline-block';

                // Check if entry is synced (read-only mode)
                const isSynced = event.extendedProps.synergySynced || event.extendedProps.synergySubmitted;

                // Disable form fields if synced
                document.getElementById('projectSelect').disabled = isSynced;
                document.getElementById('customerSelect').disabled = isSynced;
                document.getElementById('startTime').disabled = isSynced;
                document.getElementById('endTime').disabled = isSynced;
                document.getElementById('notes').disabled = isSynced;
                document.getElementById('isBillable').disabled = isSynced;

                // Hide/disable action buttons if synced
                if (isSynced) {
                    document.getElementById('deleteBtn').style.display = 'none';
                    document.querySelector('button[type="submit"]').style.display = 'none';
                    document.getElementById('modalTitle').textContent = 'View Time Entry (Read-Only)';
                } else {
                    document.querySelector('button[type="submit"]').style.display = 'inline-block';
                }

                // Show synergy status if entry exists
                const synergySection = document.getElementById('synergyStatusSection');
                const submittedStatus = document.getElementById('synergySubmittedStatus');
                const syncedStatus = document.getElementById('synergySyncedStatus');

                if (event.extendedProps.synergySubmitted) {
                    synergySection.style.display = 'block';
                    submittedStatus.innerHTML = '<strong style="color: #9c27b0;">✓ Submitted to Synergy</strong>';
                    if (event.extendedProps.synergySubmissionDate) {
                        const subDate = new Date(event.extendedProps.synergySubmissionDate);
                        submittedStatus.innerHTML += \` on \${subDate.toLocaleDateString()} at \${subDate.toLocaleTimeString()}\`;
                    }
                    syncedStatus.innerHTML = '<div style="margin-top: 8px; padding: 8px; background: var(--vscode-inputValidation-infoBackground); border-left: 3px solid var(--vscode-inputValidation-infoBorder); border-radius: 3px;">🔒 This entry cannot be edited because it has been submitted to Synergy.</div>';
                } else if (event.extendedProps.synergySynced) {
                    synergySection.style.display = 'block';
                    submittedStatus.innerHTML = '';
                    syncedStatus.innerHTML = '<strong style="color: #ff9800;">⚠ Synced but not submitted</strong>';
                    if (event.extendedProps.synergySyncDate) {
                        const syncDate = new Date(event.extendedProps.synergySyncDate);
                        syncedStatus.innerHTML += \` on \${syncDate.toLocaleDateString()}\`;
                    }
                    if (event.extendedProps.synergyId) {
                        syncedStatus.innerHTML += \`<br>Synergy ID: \${event.extendedProps.synergyId}\`;
                    }
                    syncedStatus.innerHTML += '<div style="margin-top: 8px; padding: 8px; background: var(--vscode-inputValidation-warningBackground); border-left: 3px solid var(--vscode-inputValidation-warningBorder); border-radius: 3px;">🔒 This entry cannot be edited because it has been synced to Synergy.</div>';
                } else {
                    synergySection.style.display = 'block';
                    submittedStatus.innerHTML = '';
                    syncedStatus.innerHTML = '<span style="color: var(--vscode-descriptionForeground);">Not synced to Synergy</span>';
                }
            } else {
                // Create mode
                document.getElementById('entryId').value = '';
                const now = new Date();
                const startDate = dateStr ? new Date(dateStr + 'T' + now.getHours().toString().padStart(2, '0') + ':00') : now;
                const endDate = new Date(startDate.getTime() + 3600000); // +1 hour
                document.getElementById('startTime').value = formatDateTimeLocal(startDate);
                document.getElementById('endTime').value = formatDateTimeLocal(endDate);
                document.getElementById('deleteBtn').style.display = 'none';
                document.getElementById('duplicateBtn').style.display = 'none';
                document.getElementById('synergyStatusSection').style.display = 'none';

                // Enable all fields for new entry
                document.getElementById('projectSelect').disabled = false;
                document.getElementById('customerSelect').disabled = false;
                document.getElementById('startTime').disabled = false;
                document.getElementById('endTime').disabled = false;
                document.getElementById('notes').disabled = false;
                document.getElementById('isBillable').disabled = false;
                document.querySelector('button[type="submit"]').style.display = 'inline-block';
            }

            modal.style.display = 'block';
        }

        function closeModal() {
            document.getElementById('entryModal').style.display = 'none';
            selectedEvent = null;
        }

        function handleFormSubmit(e) {
            e.preventDefault();

            const entryId = document.getElementById('entryId').value;
            const projectId = parseInt(document.getElementById('projectSelect').value);
            const customerId = document.getElementById('customerSelect').value ? parseInt(document.getElementById('customerSelect').value) : null;
            const startTime = new Date(document.getElementById('startTime').value);
            const endTime = new Date(document.getElementById('endTime').value);
            const notes = document.getElementById('notes').value;
            const isBillable = document.getElementById('isBillable').checked;
            const duration = Math.floor((endTime - startTime) / 1000);

            if (entryId) {
                // Update existing entry
                vscode.postMessage({
                    command: 'updateEntry',
                    id: parseInt(entryId),
                    updates: {
                        projectId,
                        customerId,
                        start: startTime.toISOString(),
                        end: endTime.toISOString(),
                        duration,
                        notes,
                        isBillable
                    }
                });
            } else {
                // Create new entry
                vscode.postMessage({
                    command: 'createEntry',
                    entry: {
                        projectId,
                        customerId,
                        start: startTime.toISOString(),
                        end: endTime.toISOString(),
                        duration,
                        notes,
                        isBillable
                    }
                });
            }

            closeModal();
        }

        function deleteEntry() {
            const entryId = document.getElementById('entryId').value;
            if (entryId) {
                vscode.postMessage({
                    command: 'deleteEntry',
                    id: parseInt(entryId)
                });
                closeModal();
            }
        }

        function duplicateEntry() {
            const entryId = document.getElementById('entryId').value;
            if (entryId) {
                duplicateEntryId = parseInt(entryId);

                // Set default date to tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                document.getElementById('duplicateDate').value = tomorrow.toISOString().split('T')[0];

                // Show duplicate modal
                document.getElementById('duplicateModal').style.display = 'block';
                closeModal();
            }
        }

        function closeDuplicateModal() {
            document.getElementById('duplicateModal').style.display = 'none';
            duplicateEntryId = null;
        }

        function formatDateTimeLocal(date) {
            const d = new Date(date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return \`\${year}-\${month}-\${day}T\${hours}:\${minutes}\`;
        }

        function applyFilters() {
            const filterProjectId = document.getElementById('filterProject').value;
            const filterStatus = document.getElementById('filterStatus').value;
            const billableOnly = document.getElementById('filterBillableOnly').checked;

            let filteredEvents = currentEvents.filter(event => {
                // Filter by project
                if (filterProjectId && event.extendedProps.projectId != filterProjectId) {
                    return false;
                }

                // Filter by billable
                if (billableOnly && !event.extendedProps.isBillable) {
                    return false;
                }

                // Filter by status
                if (filterStatus) {
                    if (filterStatus === 'submitted' && !event.extendedProps.synergySubmitted) {
                        return false;
                    }
                    if (filterStatus === 'synced' && (!event.extendedProps.synergySynced || event.extendedProps.synergySubmitted)) {
                        return false;
                    }
                    if (filterStatus === 'billable' && (!event.extendedProps.isBillable || event.extendedProps.synergySynced)) {
                        return false;
                    }
                    if (filterStatus === 'non-billable' && event.extendedProps.isBillable) {
                        return false;
                    }
                }

                return true;
            });

            calendar.removeAllEvents();
            calendar.addEventSource(filteredEvents);
        }

        function clearFilters() {
            document.getElementById('filterProject').value = '';
            document.getElementById('filterStatus').value = '';
            document.getElementById('filterBillableOnly').checked = false;
            applyFilters();
        }

        function updateStatistics() {
            const now = new Date();

            // Calculate week hours (Monday to Sunday)
            const weekStart = new Date(now);
            const day = weekStart.getDay();
            const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
            weekStart.setDate(diff);
            weekStart.setHours(0, 0, 0, 0);

            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 7);

            let weekSeconds = 0;
            currentEvents.forEach(event => {
                const eventStart = new Date(event.start);
                if (eventStart >= weekStart && eventStart < weekEnd && event.extendedProps.duration) {
                    weekSeconds += event.extendedProps.duration;
                }
            });

            const weekHours = Math.floor(weekSeconds / 3600);
            const weekMinutes = Math.floor((weekSeconds % 3600) / 60);
            const weekPercent = Math.min(Math.round((weekSeconds / (40 * 3600)) * 100), 100);

            document.getElementById('weekHours').textContent = \`\${weekHours}h \${weekMinutes}m\`;
            document.getElementById('weekGoal').textContent = \`Goal: 40h (\${weekPercent}%)\`;

            const weekProgressBar = document.getElementById('weekProgress');
            weekProgressBar.style.width = weekPercent + '%';
            weekProgressBar.className = 'stat-progress-fill';
            if (weekPercent >= 100) {
                weekProgressBar.className += ' complete';
            } else if (weekPercent >= 80) {
                weekProgressBar.className += ' warning';
            }

            // Calculate month hours
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            monthEnd.setHours(23, 59, 59, 999);

            let monthSeconds = 0;
            let monthBillable = 0;
            let monthNonBillable = 0;

            currentEvents.forEach(event => {
                const eventStart = new Date(event.start);
                if (eventStart >= monthStart && eventStart <= monthEnd && event.extendedProps.duration) {
                    monthSeconds += event.extendedProps.duration;
                    if (event.extendedProps.isBillable) {
                        monthBillable += event.extendedProps.duration;
                    } else {
                        monthNonBillable += event.extendedProps.duration;
                    }
                }
            });

            const monthHours = Math.floor(monthSeconds / 3600);
            const monthMinutes = Math.floor((monthSeconds % 3600) / 60);
            const monthBillableHours = Math.floor(monthBillable / 3600);
            const monthNonBillableHours = Math.floor(monthNonBillable / 3600);

            document.getElementById('monthHours').textContent = \`\${monthHours}h \${monthMinutes}m\`;
            document.getElementById('monthSubtitle').textContent = \`Billable: \${monthBillableHours}h | Non-billable: \${monthNonBillableHours}h\`;

            // Calculate current view hours
            const visibleEvents = calendar.getEvents();
            let viewSeconds = 0;
            visibleEvents.forEach(event => {
                if (event.extendedProps.duration) {
                    viewSeconds += event.extendedProps.duration;
                }
            });

            const viewHours = Math.floor(viewSeconds / 3600);
            const viewMinutes = Math.floor((viewSeconds % 3600) / 60);

            document.getElementById('viewHours').textContent = \`\${viewHours}h \${viewMinutes}m\`;
            document.getElementById('viewSubtitle').textContent = \`\${visibleEvents.length} entries\`;

            // Calculate Synergy statistics
            let submitted = 0;
            let pending = 0;
            let pendingHours = 0;

            currentEvents.forEach(event => {
                if (event.extendedProps.synergySubmitted) {
                    submitted++;
                } else {
                    pending++;
                    if (event.extendedProps.duration) {
                        pendingHours += event.extendedProps.duration;
                    }
                }
            });

            const pendingHoursFormatted = Math.floor(pendingHours / 3600);
            document.getElementById('synergyStats').textContent = \`\${pendingHoursFormatted}h pending\`;
            document.getElementById('synergySubtitle').textContent = \`Submitted: \${submitted} | Pending: \${pending}\`;
        }

        function addDayTotals() {
            // Remove existing day totals
            document.querySelectorAll('.day-total').forEach(el => el.remove());

            // Calculate daily totals
            const dailyTotals = {};
            currentEvents.forEach(event => {
                const dateKey = new Date(event.start).toISOString().split('T')[0];
                if (!dailyTotals[dateKey]) {
                    dailyTotals[dateKey] = 0;
                }
                if (event.extendedProps.duration) {
                    dailyTotals[dateKey] += event.extendedProps.duration;
                }
            });

            // Add totals to day cells
            Object.keys(dailyTotals).forEach(dateKey => {
                const seconds = dailyTotals[dateKey];
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const totalText = hours > 0 ? \`\${hours}h \${minutes}m\` : \`\${minutes}m\`;

                // Find the day cell
                const dayCell = document.querySelector(\`[data-date="\${dateKey}"]\`);
                if (dayCell) {
                    const dayTop = dayCell.querySelector('.fc-daygrid-day-top');
                    if (dayTop) {
                        const totalSpan = document.createElement('div');
                        totalSpan.className = 'day-total';
                        totalSpan.textContent = totalText;
                        dayTop.appendChild(totalSpan);
                    }
                }
            });
        }

        // Template Management
        function loadTemplates() {
            const saved = localStorage.getItem('timetracker_templates');
            templates = saved ? JSON.parse(saved) : [];
            renderTemplates();
        }

        function saveTemplates() {
            localStorage.setItem('timetracker_templates', JSON.stringify(templates));
        }

        function renderTemplates() {
            const list = document.getElementById('templatesList');
            if (templates.length === 0) {
                list.innerHTML = '<p style="color: var(--vscode-descriptionForeground); text-align: center; padding: 20px;">No templates saved yet.</p>';
                return;
            }

            list.innerHTML = templates.map((template, index) => \`
                <div style="padding: 12px; margin-bottom: 10px; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 5px;">\${template.name}</div>
                            <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">
                                Project: \${template.projectName}<br>
                                Duration: \${template.duration} min | Billable: \${template.isBillable ? 'Yes' : 'No'}
                                \${template.notes ? '<br>Notes: ' + template.notes : ''}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="applyTemplate(\${index})" style="padding: 6px 12px;">Use</button>
                            <button onclick="deleteTemplate(\${index})" class="danger" style="padding: 6px 12px;">Delete</button>
                        </div>
                    </div>
                </div>
            \`).join('');
        }

        function showTemplatesModal() {
            loadTemplates();
            document.getElementById('templatesModal').style.display = 'block';
        }

        function closeTemplatesModal() {
            document.getElementById('templatesModal').style.display = 'none';
        }

        function saveCurrentAsTemplate() {
            if (!selectedEvent) {
                const name = prompt('Enter template name:');
                if (!name) return;

                return;
            }

            const name = prompt('Enter template name:', 'My Template');
            if (!name) return;

            const start = new Date(selectedEvent.start);
            const end = new Date(selectedEvent.end || selectedEvent.start);
            const duration = Math.floor((end - start) / 60000); // minutes

            const template = {
                name: name,
                projectId: selectedEvent.extendedProps.projectId,
                projectName: selectedEvent.extendedProps.projectName,
                customerId: selectedEvent.extendedProps.customerId,
                duration: duration,
                notes: selectedEvent.extendedProps.notes || '',
                isBillable: selectedEvent.extendedProps.isBillable
            };

            templates.push(template);
            saveTemplates();
            renderTemplates();
        }

        function applyTemplate(index) {
            const template = templates[index];
            const dateStr = prompt('Enter date to add this entry (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
            if (!dateStr) return;

            const startDate = new Date(dateStr + 'T09:00');
            const endDate = new Date(startDate.getTime() + template.duration * 60000);

            vscode.postMessage({
                command: 'createEntry',
                entry: {
                    projectId: template.projectId,
                    customerId: template.customerId,
                    start: startDate.toISOString(),
                    end: endDate.toISOString(),
                    duration: template.duration * 60,
                    notes: template.notes,
                    isBillable: template.isBillable
                }
            });

            closeTemplatesModal();
        }

        function deleteTemplate(index) {
            templates.splice(index, 1);
            saveTemplates();
            renderTemplates();
        }

        // Copy Week Functionality
        function copyCurrentWeek() {
            const view = calendar.view;
            let weekStart, weekEnd;

            if (view.type === 'timeGridWeek') {
                weekStart = new Date(view.currentStart);
                weekEnd = new Date(view.currentEnd);
            } else {
                // If in month or day view, calculate current week
                const today = new Date();
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
                weekStart = new Date(today.setDate(diff));
                weekStart.setHours(0, 0, 0, 0);
                weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);
            }

            const weekEntries = currentEvents.filter(event => {
                const eventDate = new Date(event.start);
                return eventDate >= weekStart && eventDate < weekEnd && !event.extendedProps.synergySynced && !event.extendedProps.synergySubmitted;
            });

            if (weekEntries.length === 0) {
                return;
            }

            weekEntries.forEach(event => {
                const originalStart = new Date(event.start);
                const newStart = new Date(originalStart);
                newStart.setDate(newStart.getDate() + 7); // Add 7 days

                const originalEnd = event.end ? new Date(event.end) : null;
                const newEnd = originalEnd ? new Date(originalEnd.getTime() + 7 * 24 * 60 * 60 * 1000) : null;

                vscode.postMessage({
                    command: 'createEntry',
                    entry: {
                        projectId: event.extendedProps.projectId,
                        customerId: event.extendedProps.customerId,
                        start: newStart.toISOString(),
                        end: newEnd ? newEnd.toISOString() : null,
                        duration: event.extendedProps.duration,
                        notes: event.extendedProps.notes,
                        isBillable: event.extendedProps.isBillable
                    }
                });
            });

            setTimeout(() => {
                const nextWeekStart = new Date(weekStart);
                nextWeekStart.setDate(nextWeekStart.getDate() + 7);
                const startDate = new Date(nextWeekStart.getFullYear(), nextWeekStart.getMonth(), 1).toISOString();
                const endDate = new Date(nextWeekStart.getFullYear(), nextWeekStart.getMonth() + 2, 0).toISOString();
                vscode.postMessage({
                    command: 'getEntries',
                    startDate: startDate,
                    endDate: endDate
                });
            }, 500);
        }

        // Recurring Entry Functions
        function showRecurringModal() {
            const modal = document.getElementById('recurringModal');
            const form = document.getElementById('recurringForm');
            form.reset();

            // Populate project dropdown
            const recurringProject = document.getElementById('recurringProject');
            recurringProject.innerHTML = '<option value="">Select a project...</option>';
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                recurringProject.appendChild(option);
            });

            // Populate customer dropdown
            const recurringCustomer = document.getElementById('recurringCustomer');
            recurringCustomer.innerHTML = '<option value="">None</option>';
            customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.id;
                option.textContent = customer.account_name;
                recurringCustomer.appendChild(option);
            });

            // Set default start date to next Monday
            const today = new Date();
            const day = today.getDay();
            const daysUntilMonday = day === 0 ? 1 : (8 - day);
            const nextMonday = new Date(today);
            nextMonday.setDate(today.getDate() + daysUntilMonday);
            document.getElementById('recurringStartDate').value = nextMonday.toISOString().split('T')[0];

            modal.style.display = 'block';
        }

        function closeRecurringModal() {
            document.getElementById('recurringModal').style.display = 'none';
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'updateEvents':
                    currentEvents = message.events;
                    applyFilters();
                    updateStatistics();
                    addDayTotals();
                    break;

                case 'updateProjects':
                    projects = message.projects;
                    const projectSelect = document.getElementById('projectSelect');
                    projectSelect.innerHTML = '<option value="">Select a project...</option>';
                    projects.forEach(project => {
                        const option = document.createElement('option');
                        option.value = project.id;
                        option.textContent = project.name;
                        projectSelect.appendChild(option);
                    });

                    // Also populate filter dropdown
                    const filterProject = document.getElementById('filterProject');
                    filterProject.innerHTML = '<option value="">All Projects</option>';
                    projects.forEach(project => {
                        const option = document.createElement('option');
                        option.value = project.id;
                        option.textContent = project.name;
                        filterProject.appendChild(option);
                    });
                    break;

                case 'updateCustomers':
                    customers = message.customers;
                    const customerSelect = document.getElementById('customerSelect');
                    customerSelect.innerHTML = '<option value="">None</option>';
                    customers.forEach(customer => {
                        const option = document.createElement('option');
                        option.value = customer.id;
                        option.textContent = customer.account_name;
                        customerSelect.appendChild(option);
                    });
                    break;
            }
        });

        // Request initial data
        vscode.postMessage({ command: 'getProjects' });
        vscode.postMessage({ command: 'getCustomers' });

        // Close modal on outside click
        window.onclick = function(event) {
            const modal = document.getElementById('entryModal');
            if (event.target === modal) {
                closeModal();
            }
        };
    </script>
</body>
</html>`;
}

export function deactivate() {
    if (timeTracker) {
        timeTracker.stop();
    }
    if (pomodoroTimer) {
        pomodoroTimer.dispose();
    }
    if (db) {
        db.close();
    }
}
