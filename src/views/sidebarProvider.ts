import * as vscode from 'vscode';
import { TimeTracker, TrackingStatus, TrackingState } from '../tracking/timeTracker';
import { TimeTrackerDatabase } from '../database/database';

export class SidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private timeTracker: TimeTracker | null = null;
    private db: TimeTrackerDatabase | null = null;
    private initialized: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {}

    public setDependencies(timeTracker: TimeTracker, db: TimeTrackerDatabase): void {
        this.timeTracker = timeTracker;
        this.db = db;
        this.initialized = true;

        // Listen to status updates
        this.timeTracker.onStatusUpdate((status) => {
            this.updateView(status);
        });

        // If view is already open, refresh it
        if (this._view) {
            this.refresh();
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        console.log('=== resolveWebviewView CALLED ===');
        console.log('Webview view being resolved for timetracker.sidebar');
        console.log('Initialized state:', this.initialized);
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        console.log('Setting webview HTML content...');
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        console.log('Webview HTML content set successfully');

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
                case 'switchProject':
                    if (data.projectId) {
                        await vscode.commands.executeCommand('timetracker.switchToProject', data.projectId);
                    }
                    break;
                case 'viewEntries':
                    await vscode.commands.executeCommand('timetracker.viewTimeEntries');
                    break;
                case 'showDashboard':
                    await vscode.commands.executeCommand('timetracker.showDashboard');
                    break;
                case 'showCalendar':
                    await vscode.commands.executeCommand('timetracker.showCalendar');
                    break;
                case 'addManual':
                    await vscode.commands.executeCommand('timetracker.addManualEntry');
                    break;
                case 'export':
                    await vscode.commands.executeCommand('timetracker.exportData');
                    break;
                case 'submitSynergy':
                    await vscode.commands.executeCommand('timetracker.submitToSynergy');
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
            if (!this.initialized || !this.timeTracker || !this.db) {
                // Show loading state
                this._view.webview.postMessage({
                    type: 'loading'
                });
                return;
            }

            const status = this.timeTracker.getStatus();
            this.updateView(status);
        }
    }

    private updateView(status: TrackingStatus) {
        if (this._view && this.db) {
            // Get today's stats for all projects
            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            const todaySummaries = this.db.getDailySummariesForRange(today, tomorrowStr);

            // Get detailed entries for tooltips
            const todayEntries = this.db.getAllTimeEntries(today, tomorrowStr);

            // Get working hours configuration
            const config = vscode.workspace.getConfiguration('timetracker');
            const workingHoursStart = config.get<string>('workingHoursStart', '09:00');
            const workingHoursEnd = config.get<string>('workingHoursEnd', '17:00');

            // Calculate expected working hours in seconds
            const [startHour, startMin] = workingHoursStart.split(':').map(Number);
            const [endHour, endMin] = workingHoursEnd.split(':').map(Number);
            const expectedSeconds = (endHour * 3600 + endMin * 60) - (startHour * 3600 + startMin * 60);

            this._view.webview.postMessage({
                type: 'statusUpdate',
                status: {
                    ...status,
                    todaySummaries,
                    todayEntries,
                    expectedWorkingSeconds: expectedSeconds,
                    workingHoursStart,
                    workingHoursEnd
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

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
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
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .project-item-info {
            flex: 1;
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

        .project-switch-btn {
            padding: 4px 8px;
            font-size: 11px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            white-space: nowrap;
        }

        .project-switch-btn:hover {
            background: var(--vscode-button-hoverBackground);
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

        /* Progress bar styles */
        .progress-container {
            width: 100%;
            height: 24px;
            background: var(--vscode-editor-background);
            border-radius: 4px;
            overflow: hidden;
            margin: 10px 0;
            position: relative;
            border: 1px solid var(--vscode-panel-border);
        }

        .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #4caf50 0%, #66bb6a 100%);
            transition: width 0.5s ease;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .progress-bar.warning {
            background: linear-gradient(90deg, #ff9800 0%, #ffa726 100%);
        }

        .progress-bar.over-limit {
            background: linear-gradient(90deg, #f44336 0%, #ef5350 100%);
        }

        .progress-text {
            position: absolute;
            width: 100%;
            text-align: center;
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-foreground);
            line-height: 24px;
            z-index: 1;
        }

        .progress-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 4px;
            display: flex;
            justify-content: space-between;
        }

        /* Billable/Non-billable indicators */
        .time-badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: 600;
            margin-left: 5px;
        }

        .time-badge.billable {
            background: #4caf50;
            color: white;
        }

        .time-badge.non-billable {
            background: #757575;
            color: white;
        }

        /* Tooltip styles */
        .tooltip {
            position: relative;
            cursor: help;
        }

        .tooltip .tooltiptext {
            visibility: hidden;
            width: 280px;
            background-color: var(--vscode-editorHoverWidget-background);
            color: var(--vscode-editorHoverWidget-foreground);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            text-align: left;
            border-radius: 6px;
            padding: 10px;
            position: absolute;
            z-index: 1000;
            bottom: 125%;
            left: 50%;
            margin-left: -140px;
            font-size: 12px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }

        .tooltip .tooltiptext::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: var(--vscode-editorHoverWidget-border) transparent transparent transparent;
        }

        .tooltip:hover .tooltiptext {
            visibility: visible;
            opacity: 1;
        }

        .tooltip-section {
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .tooltip-section:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }

        .tooltip-title {
            font-weight: 600;
            margin-bottom: 4px;
            color: var(--vscode-foreground);
        }

        .tooltip-item {
            font-size: 11px;
            margin: 2px 0;
            color: var(--vscode-descriptionForeground);
        }

        /* Milestone indicators */
        .milestone-indicator {
            font-size: 11px;
            padding: 4px 8px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
            margin-top: 5px;
            display: inline-block;
        }

        .milestone-indicator.achieved {
            background: #4caf50;
            color: white;
        }
    </style>
</head>
<body>
    <div id="loadingView" class="loading" style="display:block;">
        <p>Initializing Time Tracker...</p>
    </div>

    <div id="mainView" style="display:none;">
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
            <h2>Today's Progress</h2>
            <div class="progress-label">
                <span>Today's Total: <span id="todayTotal">0h 0m</span></span>
                <span>Goal: <span id="goalTime">8h 0m</span></span>
            </div>
            <div class="progress-container">
                <div class="progress-bar" id="progressBar" style="width: 0%;">
                </div>
                <div class="progress-text" id="progressText">0%</div>
            </div>
            <div id="milestoneIndicator"></div>
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
                <a class="action-link" onclick="viewTimeEntries()">View Entries</a>
                <a class="action-link" onclick="showDashboard()">Dashboard</a>
                <a class="action-link" onclick="showCalendar()">Calendar</a>
                <a class="action-link" onclick="addManualEntry()">Manual Entry</a>
                <a class="action-link" onclick="exportData()">Export</a>
                <a class="action-link" onclick="submitToSynergy()">Submit to Synergy</a>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        let currentState = 'stopped';

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'statusUpdate') {
                // Hide loading, show main view
                document.getElementById('loadingView').style.display = 'none';
                document.getElementById('mainView').style.display = 'block';
                updateUI(message.status);
            } else if (message.type === 'loading') {
                // Show loading view
                document.getElementById('loadingView').style.display = 'block';
                document.getElementById('mainView').style.display = 'none';
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

            // Update today's total and progress
            updateTodayProgress(status.todayTotal, status.expectedWorkingSeconds || 28800);

            // Update project list with tooltips and color coding
            updateProjectList(status.todaySummaries || [], status.todayEntries || []);

            // Update milestone indicators
            updateMilestones(status.todayTotal);
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

        function updateTodayProgress(seconds, goalSeconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);

            document.getElementById('todayTotal').textContent = hours + 'h ' + minutes + 'm';

            // Update goal display
            const goalHours = Math.floor(goalSeconds / 3600);
            const goalMinutes = Math.floor((goalSeconds % 3600) / 60);
            document.getElementById('goalTime').textContent = goalHours + 'h ' + goalMinutes + 'm';

            // Calculate progress percentage
            const percentage = Math.min(Math.round((seconds / goalSeconds) * 100), 100);
            const actualPercentage = Math.round((seconds / goalSeconds) * 100);

            // Update progress bar
            const progressBar = document.getElementById('progressBar');
            progressBar.style.width = percentage + '%';

            // Color code based on progress
            progressBar.className = 'progress-bar';
            if (actualPercentage >= 100) {
                progressBar.className = 'progress-bar over-limit';
            } else if (percentage >= 80) {
                progressBar.className = 'progress-bar warning';
            }

            // Update progress text
            document.getElementById('progressText').textContent = actualPercentage + '%';
        }

        function updateMilestones(seconds) {
            const milestoneDiv = document.getElementById('milestoneIndicator');
            const hours = seconds / 3600;

            let milestoneText = '';
            if (hours >= 8) {
                milestoneText = '<span class="milestone-indicator achieved">Full Day Complete! 🎉</span>';
            } else if (hours >= 4) {
                milestoneText = '<span class="milestone-indicator achieved">Half Day Milestone! ⭐</span>';
            } else if (hours >= 2) {
                milestoneText = '<span class="milestone-indicator achieved">2 Hour Milestone! 💪</span>';
            }

            milestoneDiv.innerHTML = milestoneText;
        }

        function updateProjectList(summaries, entries) {
            const list = document.getElementById('projectList');

            if (summaries.length === 0) {
                list.innerHTML = '<li class="no-data">No projects tracked today</li>';
                return;
            }

            list.innerHTML = summaries.map(summary => {
                const hours = Math.floor(summary.total_duration / 3600);
                const minutes = Math.floor((summary.total_duration % 3600) / 60);

                // Get entries for this project
                const projectEntries = entries.filter(e => e.project_id === summary.project_id);

                // Calculate billable vs non-billable
                let billableTime = 0;
                let nonBillableTime = 0;
                projectEntries.forEach(entry => {
                    if (entry.is_billable) {
                        billableTime += entry.duration || 0;
                    } else {
                        nonBillableTime += entry.duration || 0;
                    }
                });

                const hasBillable = billableTime > 0;
                const hasNonBillable = nonBillableTime > 0;

                // Generate tooltip content
                const tooltipContent = generateTooltip(summary, projectEntries, billableTime, nonBillableTime);

                return \`
                    <li class="project-item tooltip">
                        <div class="project-item-info">
                            <div class="project-item-name">
                                \${summary.project_name}
                                \${hasBillable ? '<span class="time-badge billable">$</span>' : ''}
                                \${hasNonBillable && hasBillable ? '<span class="time-badge non-billable">-</span>' : ''}
                            </div>
                            <div class="project-item-time">\${hours}h \${minutes}m</div>
                        </div>
                        <button class="project-switch-btn" onclick="switchToProject(\${summary.project_id})">
                            Switch
                        </button>
                        <span class="tooltiptext">\${tooltipContent}</span>
                    </li>
                \`;
            }).join('');
        }

        function generateTooltip(summary, entries, billableTime, nonBillableTime) {
            let html = '<div class="tooltip-section">';
            html += \`<div class="tooltip-title">\${summary.project_name}</div>\`;
            html += \`<div class="tooltip-item">Sessions: \${entries.length}</div>\`;
            html += '</div>';

            if (billableTime > 0 || nonBillableTime > 0) {
                html += '<div class="tooltip-section">';
                html += '<div class="tooltip-title">Time Breakdown</div>';

                if (billableTime > 0) {
                    const bHours = Math.floor(billableTime / 3600);
                    const bMins = Math.floor((billableTime % 3600) / 60);
                    html += \`<div class="tooltip-item">💰 Billable: \${bHours}h \${bMins}m</div>\`;
                }

                if (nonBillableTime > 0) {
                    const nbHours = Math.floor(nonBillableTime / 3600);
                    const nbMins = Math.floor((nonBillableTime % 3600) / 60);
                    html += \`<div class="tooltip-item">⚪ Non-billable: \${nbHours}h \${nbMins}m</div>\`;
                }

                html += '</div>';
            }

            if (entries.length > 0) {
                html += '<div class="tooltip-section">';
                html += '<div class="tooltip-title">Recent Sessions</div>';

                entries.slice(0, 3).forEach(entry => {
                    const start = new Date(entry.start_time);
                    const startTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const duration = entry.duration || 0;
                    const dMins = Math.floor(duration / 60);

                    html += \`<div class="tooltip-item">\${startTime} - \${dMins}m\`;
                    if (entry.notes) {
                        html += \` (\${entry.notes.substring(0, 20)}...)\`;
                    }
                    html += '</div>';
                });

                html += '</div>';
            }

            return html;
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

        function showCalendar() {
            vscode.postMessage({ type: 'showCalendar' });
        }

        function addManualEntry() {
            vscode.postMessage({ type: 'addManual' });
        }

        function exportData() {
            vscode.postMessage({ type: 'export' });
        }

        function switchToProject(projectId) {
            vscode.postMessage({ type: 'switchProject', projectId: projectId });
        }

        function viewTimeEntries() {
            vscode.postMessage({ type: 'viewEntries' });
        }

        function submitToSynergy() {
            vscode.postMessage({ type: 'submitSynergy' });
        }

        // Request initial data
        vscode.postMessage({ type: 'refresh' });
    </script>
</body>
</html>`;
    }
}
