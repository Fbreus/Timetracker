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

        console.log('Commands registered successfully');

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

    // Get chart data
    const dailyTrend = db.getDailyTotalsForDays(30); // Last 30 days
    const heatmapData = db.getHeatmapData(90); // Last 90 days
    const todayTimeline = db.getHourlyBreakdownForDate(today); // Today's hourly breakdown

    panel.webview.postMessage({
        command: 'updateData',
        data: {
            projects,
            todaySummaries,
            weekSummaries,
            allTimeTotals,
            dailyTrend,
            heatmapData,
            todayTimeline
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
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.3.0/dist/chart.umd.min.js"></script>
    <style>
        body {
            padding: 20px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background: var(--vscode-editor-background);
        }

        h1 {
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
        }

        .subtitle {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 30px;
        }

        h2 {
            font-size: 18px;
            margin: 30px 0 15px 0;
            border-bottom: 2px solid var(--vscode-panel-border);
            padding-bottom: 8px;
            font-weight: 600;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: var(--vscode-sideBar-background);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
            transition: transform 0.2s;
        }

        .stat-card:hover {
            transform: translateY(-2px);
        }

        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .stat-value {
            font-size: 28px;
            font-weight: 700;
            color: var(--vscode-foreground);
        }

        .chart-container {
            background: var(--vscode-sideBar-background);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
            margin-bottom: 25px;
            position: relative;
        }

        .chart-wrapper {
            position: relative;
            height: 300px;
            margin-top: 15px;
        }

        .chart-wrapper.large {
            height: 400px;
        }

        .chart-wrapper.small {
            height: 250px;
        }

        .charts-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 25px;
        }

        @media (max-width: 900px) {
            .charts-row {
                grid-template-columns: 1fr;
            }
        }

        .heatmap-container {
            background: var(--vscode-sideBar-background);
            padding: 20px;
            border-radius: 8px;
            border: 1px solid var(--vscode-panel-border);
            margin-bottom: 25px;
            overflow-x: auto;
        }

        .heatmap {
            display: grid;
            grid-template-columns: repeat(13, 1fr);
            gap: 4px;
            margin-top: 15px;
            min-width: 700px;
        }

        .heatmap-week {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .heatmap-day {
            width: 100%;
            aspect-ratio: 1;
            border-radius: 3px;
            border: 1px solid var(--vscode-panel-border);
            position: relative;
            cursor: pointer;
            transition: transform 0.1s;
        }

        .heatmap-day:hover {
            transform: scale(1.1);
            border-color: var(--vscode-foreground);
        }

        .heatmap-day.level-0 {
            background: var(--vscode-editor-background);
        }

        .heatmap-day.level-1 {
            background: #0e4429;
        }

        .heatmap-day.level-2 {
            background: #006d32;
        }

        .heatmap-day.level-3 {
            background: #26a641;
        }

        .heatmap-day.level-4 {
            background: #39d353;
        }

        .heatmap-legend {
            display: flex;
            align-items: center;
            gap: 5px;
            margin-top: 15px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .heatmap-legend-item {
            width: 12px;
            height: 12px;
            border-radius: 2px;
            border: 1px solid var(--vscode-panel-border);
        }

        .no-data {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px;
            text-align: center;
        }

        .tooltip {
            position: absolute;
            background: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            pointer-events: none;
            z-index: 1000;
            display: none;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        }
    </style>
</head>
<body>
    <h1>📊 Analytics Dashboard</h1>
    <div class="subtitle">Visual insights into your productivity</div>

    <h2>Summary Statistics</h2>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-label">Today</div>
            <div class="stat-value" id="todayTotal">0h 0m</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">This Week</div>
            <div class="stat-value" id="weekTotal">0h 0m</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Projects Today</div>
            <div class="stat-value" id="todayProjects">0</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">All Time</div>
            <div class="stat-value" id="allTimeTotal">0h 0m</div>
        </div>
    </div>

    <h2>📈 Analytics</h2>

    <div class="charts-row">
        <div class="chart-container">
            <h3 style="margin: 0 0 5px 0; font-size: 16px;">Project Distribution</h3>
            <p style="margin: 0; font-size: 11px; color: var(--vscode-descriptionForeground);">All-time breakdown by project</p>
            <div class="chart-wrapper small">
                <canvas id="projectPieChart"></canvas>
            </div>
        </div>

        <div class="chart-container">
            <h3 style="margin: 0 0 5px 0; font-size: 16px;">Today's Activity</h3>
            <p style="margin: 0; font-size: 11px; color: var(--vscode-descriptionForeground);">Hourly breakdown</p>
            <div class="chart-wrapper small">
                <canvas id="todayTimelineChart"></canvas>
            </div>
        </div>
    </div>

    <div class="chart-container">
        <h3 style="margin: 0 0 5px 0; font-size: 16px;">30-Day Trend</h3>
        <p style="margin: 0; font-size: 11px; color: var(--vscode-descriptionForeground);">Daily productivity over the last month</p>
        <div class="chart-wrapper">
            <canvas id="trendChart"></canvas>
        </div>
    </div>

    <div class="heatmap-container">
        <h3 style="margin: 0 0 5px 0; font-size: 16px;">90-Day Activity Heatmap</h3>
        <p style="margin: 0 0 15px 0; font-size: 11px; color: var(--vscode-descriptionForeground);">Your contribution graph</p>
        <div id="heatmap"></div>
        <div class="heatmap-legend">
            <span>Less</span>
            <div class="heatmap-legend-item level-0"></div>
            <div class="heatmap-legend-item level-1"></div>
            <div class="heatmap-legend-item level-2"></div>
            <div class="heatmap-legend-item level-3"></div>
            <div class="heatmap-legend-item level-4"></div>
            <span>More</span>
        </div>
    </div>

    <div class="tooltip" id="tooltip"></div>

    <script>
        const vscode = acquireVsCodeApi();
        let charts = {};

        // Chart.js default configuration for dark theme
        Chart.defaults.color = getComputedStyle(document.body).getPropertyValue('--vscode-foreground');
        Chart.defaults.borderColor = getComputedStyle(document.body).getPropertyValue('--vscode-panel-border');

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
                updateDashboard(message.data);
            }
        });

        function updateDashboard(data) {
            updateStats(data);
            createProjectPieChart(data.allTimeTotals);
            createTrendChart(data.dailyTrend);
            createHeatmap(data.heatmapData);
            createTodayTimelineChart(data.todayTimeline);
        }

        function updateStats(data) {
            // Today's total
            let todayTotal = 0;
            data.todaySummaries.forEach(s => todayTotal += s.total_duration);
            document.getElementById('todayTotal').textContent = formatDuration(todayTotal);
            document.getElementById('todayProjects').textContent = data.todaySummaries.length;

            // Week's total
            const weekProjects = new Set();
            let weekTotal = 0;
            data.weekSummaries.forEach(s => {
                weekTotal += s.total_duration;
                weekProjects.add(s.project_id);
            });
            document.getElementById('weekTotal').textContent = formatDuration(weekTotal);

            // All-time total
            let allTimeTotal = 0;
            data.allTimeTotals.forEach(p => allTimeTotal += p.total_duration);
            document.getElementById('allTimeTotal').textContent = formatDuration(allTimeTotal);
        }

        function createProjectPieChart(allTimeTotals) {
            const ctx = document.getElementById('projectPieChart');

            if (charts.projectPie) {
                charts.projectPie.destroy();
            }

            if (allTimeTotals.length === 0) {
                ctx.parentElement.innerHTML = '<div class="no-data">No project data available</div>';
                return;
            }

            const colors = generateColors(allTimeTotals.length);

            charts.projectPie = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: allTimeTotals.map(p => p.project_name),
                    datasets: [{
                        data: allTimeTotals.map(p => p.total_duration / 3600), // Convert to hours
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: getComputedStyle(document.body).getPropertyValue('--vscode-sideBar-background')
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: {
                                padding: 15,
                                font: { size: 11 },
                                generateLabels: function(chart) {
                                    const data = chart.data;
                                    return data.labels.map((label, i) => ({
                                        text: label + ' (' + data.datasets[0].data[i].toFixed(1) + 'h)',
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        hidden: false,
                                        index: i
                                    }));
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.label + ': ' + context.parsed.toFixed(1) + ' hours';
                                }
                            }
                        }
                    }
                }
            });
        }

        function createTrendChart(dailyTrend) {
            const ctx = document.getElementById('trendChart');

            if (charts.trend) {
                charts.trend.destroy();
            }

            if (dailyTrend.length === 0) {
                ctx.parentElement.innerHTML = '<div class="no-data">No trend data available</div>';
                return;
            }

            // Fill in missing dates
            const filledData = fillMissingDates(dailyTrend, 30);

            charts.trend = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: filledData.map(d => formatDate(d.date)),
                    datasets: [{
                        label: 'Hours per day',
                        data: filledData.map(d => d.total_duration / 3600),
                        borderColor: '#3794ff',
                        backgroundColor: 'rgba(55, 148, 255, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 3,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return 'Time: ' + context.parsed.y.toFixed(1) + ' hours';
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value + 'h';
                                }
                            },
                            grid: {
                                color: 'rgba(128, 128, 128, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            }
                        }
                    }
                }
            });
        }

        function createTodayTimelineChart(timeline) {
            const ctx = document.getElementById('todayTimelineChart');

            if (charts.timeline) {
                charts.timeline.destroy();
            }

            if (timeline.length === 0) {
                ctx.parentElement.innerHTML = '<div class="no-data">No activity today</div>';
                return;
            }

            // Fill in all 24 hours
            const hours = Array.from({length: 24}, (_, i) => i);
            const data = hours.map(h => {
                const entry = timeline.find(t => t.hour === h);
                return entry ? entry.duration / 60 : 0; // Convert to minutes
            });

            charts.timeline = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: hours.map(h => h + ':00'),
                    datasets: [{
                        label: 'Minutes',
                        data: data,
                        backgroundColor: '#26a641',
                        borderColor: '#26a641',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.parsed.y.toFixed(0) + ' minutes';
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return value + 'm';
                                }
                            },
                            grid: {
                                color: 'rgba(128, 128, 128, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                font: { size: 9 }
                            }
                        }
                    }
                }
            });
        }

        function createHeatmap(heatmapData) {
            const container = document.getElementById('heatmap');

            if (heatmapData.length === 0) {
                container.innerHTML = '<div class="no-data">No heatmap data available</div>';
                return;
            }

            // Calculate max for color scaling
            const max = Math.max(...heatmapData.map(d => d.total_duration));

            // Group by weeks
            const today = new Date();
            const startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 90);

            const weeks = [];
            let currentWeek = [];

            for (let i = 0; i < 91; i++) {
                const date = new Date(startDate);
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];

                const entry = heatmapData.find(d => d.date === dateStr);
                const duration = entry ? entry.total_duration : 0;

                currentWeek.push({
                    date: dateStr,
                    duration: duration,
                    level: getHeatLevel(duration, max)
                });

                if (date.getDay() === 6 || i === 90) {
                    weeks.push([...currentWeek]);
                    currentWeek = [];
                }
            }

            container.innerHTML = '<div class="heatmap">' +
                weeks.map(week =>
                    '<div class="heatmap-week">' +
                    week.map(day =>
                        \`<div class="heatmap-day level-\${day.level}"
                             title="\${formatDate(day.date)}: \${formatDuration(day.duration)}"
                             data-date="\${day.date}"
                             data-duration="\${day.duration}"></div>\`
                    ).join('') +
                    '</div>'
                ).join('') +
                '</div>';

            // Add hover tooltips
            const tooltip = document.getElementById('tooltip');
            document.querySelectorAll('.heatmap-day').forEach(day => {
                day.addEventListener('mouseenter', (e) => {
                    const date = e.target.getAttribute('data-date');
                    const duration = parseInt(e.target.getAttribute('data-duration'));
                    tooltip.innerHTML = \`<strong>\${formatDate(date)}</strong><br>\${formatDuration(duration)}\`;
                    tooltip.style.display = 'block';
                });

                day.addEventListener('mousemove', (e) => {
                    tooltip.style.left = (e.pageX + 10) + 'px';
                    tooltip.style.top = (e.pageY + 10) + 'px';
                });

                day.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            });
        }

        function getHeatLevel(duration, max) {
            if (duration === 0) return 0;
            const ratio = duration / max;
            if (ratio < 0.25) return 1;
            if (ratio < 0.5) return 2;
            if (ratio < 0.75) return 3;
            return 4;
        }

        function fillMissingDates(data, days) {
            const result = [];
            const endDate = new Date();

            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(endDate);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];

                const entry = data.find(d => d.date === dateStr);
                result.push({
                    date: dateStr,
                    total_duration: entry ? entry.total_duration : 0
                });
            }

            return result;
        }

        function formatDuration(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);

            if (hours > 0) {
                return hours + 'h ' + minutes + 'm';
            } else if (minutes > 0) {
                return minutes + 'm';
            } else {
                return '0m';
            }
        }

        function formatDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        function generateColors(count) {
            const colors = [
                '#3794ff', '#26a641', '#f97316', '#8b5cf6',
                '#ec4899', '#14b8a6', '#f59e0b', '#ef4444',
                '#06b6d4', '#84cc16', '#a855f7', '#10b981'
            ];

            const result = [];
            for (let i = 0; i < count; i++) {
                result.push(colors[i % colors.length]);
            }
            return result;
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

        h1 {
            font-size: 24px;
            margin-bottom: 20px;
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
    </style>
</head>
<body>
    <h1>Time Entries (Last 30 Days)</h1>
    <div id="content">
        <div class="no-entries">Loading...</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateData') {
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

export function deactivate() {
    if (timeTracker) {
        timeTracker.stop();
    }
    if (db) {
        db.close();
    }
}
