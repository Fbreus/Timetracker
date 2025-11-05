import * as vscode from 'vscode';
import { TimeTracker, TrackingStatus, TrackingState } from '../tracking/timeTracker';
import { TimeTrackerDatabase } from '../database/database';

export class SidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private timeTracker: TimeTracker;
    private db: TimeTrackerDatabase;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        timeTracker: TimeTracker,
        db: TimeTrackerDatabase
    ) {
        this.timeTracker = timeTracker;
        this.db = db;

        // Listen to status updates
        this.timeTracker.onStatusUpdate((status) => {
            this.updateView(status);
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'start':
                    await vscode.commands.executeCommand('timetracker.startTracking');
                    break;
                case 'stop':
                    await vscode.commands.executeCommand('timetracker.stopTracking');
                    break;
                case 'pause':
                    await vscode.commands.executeCommand('timetracker.pauseTracking');
                    break;
                case 'resume':
                    await vscode.commands.executeCommand('timetracker.resumeTracking');
                    break;
                case 'showDashboard':
                    await vscode.commands.executeCommand('timetracker.showDashboard');
                    break;
                case 'addManual':
                    await vscode.commands.executeCommand('timetracker.addManualEntry');
                    break;
                case 'export':
                    await vscode.commands.executeCommand('timetracker.exportData');
                    break;
                case 'refresh':
                    this.refresh();
                    break;
            }
        });

        // Initial update
        this.refresh();
    }

    public refresh() {
        if (this._view) {
            const status = this.timeTracker.getStatus();
            this.updateView(status);
        }
    }

    private updateView(status: TrackingStatus) {
        if (this._view) {
            // Get today's stats for all projects
            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            const todaySummaries = this.db.getDailySummariesForRange(today, tomorrowStr);

            this._view.webview.postMessage({
                type: 'statusUpdate',
                status: {
                    ...status,
                    todaySummaries
                }
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Time Tracker</title>
    <style>
        body {
            padding: 10px;
            color: var(--vscode-foreground);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        .section {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .section:last-child {
            border-bottom: none;
        }

        h2 {
            font-size: 14px;
            font-weight: 600;
            margin: 0 0 10px 0;
            color: var(--vscode-foreground);
        }

        .status {
            padding: 10px;
            background: var(--vscode-editor-background);
            border-radius: 4px;
            margin-bottom: 10px;
        }

        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
        }

        .status-badge.tracking {
            background: #4caf50;
            color: white;
        }

        .status-badge.paused {
            background: #ff9800;
            color: white;
        }

        .status-badge.stopped {
            background: #757575;
            color: white;
        }

        .project-name {
            font-weight: 600;
            margin-bottom: 5px;
        }

        .timer {
            font-size: 24px;
            font-weight: 700;
            font-family: 'Courier New', monospace;
            color: var(--vscode-terminal-ansiGreen);
            margin: 10px 0;
        }

        .time-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 3px;
        }

        .time-value {
            font-size: 13px;
            font-weight: 600;
        }

        .button-group {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }

        button {
            flex: 1;
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        .project-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .project-item {
            padding: 8px;
            background: var(--vscode-editor-background);
            border-radius: 3px;
            margin-bottom: 5px;
        }

        .project-item-name {
            font-weight: 500;
            font-size: 12px;
            margin-bottom: 3px;
        }

        .project-item-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .no-data {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            font-style: italic;
        }

        .action-links {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }

        .action-link {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 12px;
            cursor: pointer;
        }

        .action-link:hover {
            color: var(--vscode-textLink-activeForeground);
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="section">
        <h2>Current Session</h2>
        <div class="status">
            <div class="status-badge" id="statusBadge">Stopped</div>
            <div class="project-name" id="projectName">No active project</div>
            <div class="timer" id="sessionTimer">00:00:00</div>
            <div class="button-group" id="trackingControls">
                <button id="startBtn" onclick="startTracking()">Start</button>
                <button id="pauseBtn" onclick="pauseTracking()" style="display:none;">Pause</button>
                <button id="resumeBtn" onclick="resumeTracking()" style="display:none;">Resume</button>
                <button id="stopBtn" onclick="stopTracking()" style="display:none;">Stop</button>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>Today's Total</h2>
        <div class="status">
            <div class="time-value" id="todayTotal">0h 0m</div>
        </div>
    </div>

    <div class="section">
        <h2>Today's Projects</h2>
        <ul class="project-list" id="projectList">
            <li class="no-data">No projects tracked today</li>
        </ul>
    </div>

    <div class="section">
        <h2>Actions</h2>
        <div class="action-links">
            <a class="action-link" onclick="showDashboard()">Dashboard</a>
            <a class="action-link" onclick="addManualEntry()">Manual Entry</a>
            <a class="action-link" onclick="exportData()">Export</a>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        let currentState = 'stopped';

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'statusUpdate') {
                updateUI(message.status);
            }
        });

        function updateUI(status) {
            currentState = status.state;

            // Update status badge
            const badge = document.getElementById('statusBadge');
            badge.className = 'status-badge ' + status.state;
            badge.textContent = status.state.charAt(0).toUpperCase() + status.state.slice(1);

            // Update project name
            const projectName = document.getElementById('projectName');
            if (status.currentProject) {
                projectName.textContent = status.currentProject.name;
            } else {
                projectName.textContent = 'No active project';
            }

            // Update timer
            updateTimer(status.sessionDuration);

            // Update buttons
            updateButtons(status.state);

            // Update today's total
            updateTodayTotal(status.todayTotal);

            // Update project list
            updateProjectList(status.todaySummaries || []);
        }

        function updateTimer(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;

            const formatted =
                String(hours).padStart(2, '0') + ':' +
                String(minutes).padStart(2, '0') + ':' +
                String(secs).padStart(2, '0');

            document.getElementById('sessionTimer').textContent = formatted;
        }

        function updateButtons(state) {
            const startBtn = document.getElementById('startBtn');
            const pauseBtn = document.getElementById('pauseBtn');
            const resumeBtn = document.getElementById('resumeBtn');
            const stopBtn = document.getElementById('stopBtn');

            startBtn.style.display = 'none';
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'none';
            stopBtn.style.display = 'none';

            if (state === 'stopped') {
                startBtn.style.display = 'block';
            } else if (state === 'tracking') {
                pauseBtn.style.display = 'block';
                stopBtn.style.display = 'block';
            } else if (state === 'paused') {
                resumeBtn.style.display = 'block';
                stopBtn.style.display = 'block';
            }
        }

        function updateTodayTotal(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);

            document.getElementById('todayTotal').textContent = hours + 'h ' + minutes + 'm';
        }

        function updateProjectList(summaries) {
            const list = document.getElementById('projectList');

            if (summaries.length === 0) {
                list.innerHTML = '<li class="no-data">No projects tracked today</li>';
                return;
            }

            list.innerHTML = summaries.map(summary => {
                const hours = Math.floor(summary.total_duration / 3600);
                const minutes = Math.floor((summary.total_duration % 3600) / 60);

                return \`
                    <li class="project-item">
                        <div class="project-item-name">\${summary.project_name}</div>
                        <div class="project-item-time">\${hours}h \${minutes}m</div>
                    </li>
                \`;
            }).join('');
        }

        function startTracking() {
            vscode.postMessage({ type: 'start' });
        }

        function stopTracking() {
            vscode.postMessage({ type: 'stop' });
        }

        function pauseTracking() {
            vscode.postMessage({ type: 'pause' });
        }

        function resumeTracking() {
            vscode.postMessage({ type: 'resume' });
        }

        function showDashboard() {
            vscode.postMessage({ type: 'showDashboard' });
        }

        function addManualEntry() {
            vscode.postMessage({ type: 'addManual' });
        }

        function exportData() {
            vscode.postMessage({ type: 'export' });
        }

        // Request initial data
        vscode.postMessage({ type: 'refresh' });
    </script>
</body>
</html>`;
    }
}
