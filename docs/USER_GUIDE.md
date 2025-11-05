# Time Tracker User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Usage](#basic-usage)
3. [Advanced Features](#advanced-features)
4. [Configuration](#configuration)
5. [Tips & Best Practices](#tips--best-practices)
6. [FAQ](#faq)

## Getting Started

### Installation

1. Install the extension from the VS Code Marketplace or from a VSIX file
2. Restart VS Code (if required)
3. The Time Tracker icon will appear in the Activity Bar (left sidebar)

### First Steps

1. **Open a Project**: Open any workspace folder in VS Code
2. **Check the Sidebar**: Click the Time Tracker icon to see the sidebar
3. **Automatic Tracking**: The extension will automatically start tracking if auto-start is enabled
4. **Manual Start**: If not auto-started, use the "Start Tracking" command

## Basic Usage

### Starting and Stopping Tracking

#### Automatic Start
By default, tracking starts automatically when you open a workspace folder.

#### Manual Start
- Click the "Start" button in the sidebar
- Or use Command Palette: `Time Tracker: Start Tracking`

#### Stopping
- Click the "Stop" button in the sidebar
- Or use Command Palette: `Time Tracker: Stop Tracking`
- Sessions shorter than the minimum duration (default: 1 minute) won't be saved

### Pausing and Resuming

#### Automatic Pause
The extension automatically pauses tracking after a period of inactivity (default: 5 minutes).

#### Manual Pause/Resume
- Click "Pause" to temporarily stop tracking
- Click "Resume" to continue tracking
- Useful when taking breaks or attending meetings

### Understanding the Sidebar

#### Current Session Section
- **Status Badge**: Shows whether you're tracking, paused, or stopped
- **Project Name**: The currently tracked project
- **Timer**: Live timer showing session duration (HH:MM:SS format)
- **Control Buttons**: Start, Pause, Resume, Stop

#### Today's Total Section
- Shows cumulative time tracked today across all projects

#### Today's Projects Section
- Lists all projects worked on today
- Shows individual time per project

#### Actions Section
- **Dashboard**: Opens detailed analytics
- **Manual Entry**: Add time worked outside VS Code
- **Export**: Export your time data

## Advanced Features

### Manual Time Entry

Use this feature to record time worked outside VS Code or to correct missed sessions.

1. Click "Manual Entry" in the sidebar
2. **Date**: Enter date in YYYY-MM-DD format or leave empty for today
3. **Start Time**: Enter in HH:MM format (e.g., "09:00") or 12-hour format (e.g., "9:00 AM")
4. **End Time**: Enter in the same format as start time
5. **Notes**: Optional description of what you worked on
6. **Billable**: Mark if this time is billable to a client

#### Examples
```
Date: 2024-11-05
Start Time: 9:00
End Time: 12:30
Notes: Implemented user authentication feature
Billable: Yes
```

### Dashboard

The dashboard provides comprehensive analytics:

#### Today's Summary
- Total time tracked today
- Number of projects worked on

#### This Week's Summary
- Total time for the current week
- Number of unique projects

#### All-Time Projects
- Complete list of all projects
- Cumulative time per project
- Project paths

#### Opening the Dashboard
- Click "Dashboard" in the sidebar
- Or use Command Palette: `Time Tracker: Show Dashboard`

### Data Export

Export your time tracking data in various formats:

#### Export Formats

1. **CSV - Detailed**
   - Every time entry with full details
   - Columns: Project Name, Project Path, Start Time, End Time, Duration, Notes, Is Manual, Is Billable
   - Best for: Detailed analysis in Excel/Google Sheets

2. **CSV - Summary**
   - Aggregated data per project
   - Columns: Project Name, Total Duration, Number of Sessions, Average Session Duration
   - Best for: Quick overview and reporting

3. **JSON**
   - Complete data in structured JSON format
   - Includes all metadata
   - Best for: Importing into other tools or custom analysis

4. **Text Report**
   - Human-readable formatted report
   - Shows breakdown by project
   - Best for: Quick review or sharing with non-technical stakeholders

#### Export Process

1. Click "Export" in the sidebar or use the command
2. Select export format
3. Choose date range:
   - **All Time**: Everything ever tracked
   - **Today**: Only today's data
   - **This Week**: Current week (Sunday to today)
   - **This Month**: Current calendar month
   - **Custom Range**: Specify start and end dates
4. Choose save location
5. Optionally open the exported file

#### Example Exports

**CSV Detailed:**
```csv
Project Name,Project Path,Start Time,End Time,Duration (seconds),Duration (formatted),Notes,Is Manual,Is Billable
"My App","/Users/john/projects/my-app","2024-11-05T09:00:00Z","2024-11-05T12:30:00Z",12600,"3h 30m 0s","Feature development","No","Yes"
```

**Text Report:**
```
═══════════════════════════════════════════════════════
           TIME TRACKER REPORT
═══════════════════════════════════════════════════════

Total Time Tracked: 25h 45m
Total Sessions: 15

───────────────────────────────────────────────────────
PROJECT BREAKDOWN
───────────────────────────────────────────────────────

My App
  Total: 12h 30m
  Sessions: 8
  Average: 1h 33m
  Path: /Users/john/projects/my-app
```

### Activity Detection

The extension monitors various activities:

- **Text Changes**: Typing in editor
- **Cursor Movement**: Navigating through code
- **File Operations**: Opening/closing files
- **Debugging**: Starting/stopping debug sessions
- **Terminal**: Using integrated terminal

All these activities reset the idle timer, keeping tracking active.

## Configuration

### Accessing Settings

1. File > Preferences > Settings (Ctrl+,)
2. Search for "Time Tracker"
3. Or use `Time Tracker: Open Settings` command

### Key Settings

#### Idle Timeout
```json
"timetracker.idleTimeout": 5
```
- Minutes of inactivity before pausing
- Recommended: 5-10 minutes
- Lower values = more responsive to breaks
- Higher values = fewer interruptions

#### Minimum Session Duration
```json
"timetracker.minSessionDuration": 1
```
- Minimum minutes to record a session
- Sessions shorter than this are discarded
- Recommended: 1-2 minutes
- Prevents cluttering data with very short sessions

#### Auto Start
```json
"timetracker.autoStart": true
```
- Automatically start tracking on workspace open
- Recommended: true for "set and forget" tracking
- Set to false if you prefer manual control

#### Excluded Projects
```json
"timetracker.excludedProjects": ["test-project", "sandbox"]
```
- Projects to never track
- Matches against project name or path
- Useful for personal projects or testing

#### Working Hours
```json
"timetracker.workingHoursStart": "09:00",
"timetracker.workingHoursEnd": "17:00"
```
- Define your typical working hours
- Currently informational (future features will use this)

#### Data Retention
```json
"timetracker.dataRetentionDays": 365
```
- How many days to keep data
- 0 = keep forever
- Data older than this is automatically deleted

## Tips & Best Practices

### Maximizing Accuracy

1. **Set Appropriate Idle Timeout**
   - Too short: Tracking pauses during brief thinking breaks
   - Too long: Counts actual breaks as work time
   - Sweet spot: 5-10 minutes

2. **Review Daily**
   - Check your daily summary before end of day
   - Add manual entries for missed time
   - Delete accidental tracking sessions

3. **Use Manual Entries**
   - Meetings outside VS Code
   - Whiteboard planning sessions
   - Code review on GitHub
   - Reading documentation

### Organizing Your Data

1. **Consistent Project Names**
   - Use meaningful workspace folder names
   - These become your project names

2. **Add Notes to Manual Entries**
   - Helps remember context later
   - Useful for client billing
   - Good for performance reviews

3. **Regular Exports**
   - Export weekly for backup
   - Keep monthly summaries
   - Archive old data

### Privacy & Security

1. **Local Storage**
   - All data stays on your machine
   - Regularly backup the database

2. **Excluded Projects**
   - Add personal projects to excluded list
   - Exclude client-confidential projects if needed

3. **Be Mindful of Screen Sharing**
   - Dashboard shows project names and paths
   - Be careful when sharing screen

## FAQ

### General Questions

**Q: Does this track what I'm typing?**
A: No. It only tracks that you're active, not what you're working on. Only project name and time data are recorded.

**Q: Does it work offline?**
A: Yes, completely. All data is stored locally.

**Q: Can I track multiple projects simultaneously?**
A: No, it tracks one workspace at a time (the active workspace).

**Q: What happens if VS Code crashes?**
A: The last recorded time entry will remain open. Next time you track, it will be stopped automatically.

### Technical Questions

**Q: Where is my data stored?**
A: In VS Code's global storage directory. See README for specific paths per OS.

**Q: Can I sync data across machines?**
A: Not currently built-in, but you can manually copy the database file.

**Q: How much disk space does it use?**
A: Very little. Even years of tracking typically use less than 10 MB.

**Q: Does it slow down VS Code?**
A: No. The extension is designed to have minimal performance impact.

### Troubleshooting

**Q: Tracking isn't starting automatically**
A: Check that:
- Auto-start is enabled in settings
- You have a workspace folder open
- The project isn't in the excluded list

**Q: Timer shows incorrect time**
A: This can happen if:
- System clock was changed
- Computer was suspended during tracking
- Database was corrupted (rare)

Solution: Stop tracking and start fresh, or add a manual entry with correct times.

**Q: Exported CSV doesn't open correctly**
A: Ensure you're using UTF-8 encoding in Excel or your CSV viewer.

**Q: Can I delete all data and start fresh?**
A: Yes. Close VS Code, delete the database file from the storage directory, and restart.

### Feature Requests

**Q: Can it track time on Git branches?**
A: Not currently, but this is a planned feature.

**Q: Can it integrate with Jira/Trello?**
A: Not yet, but integrations are on the roadmap.

**Q: Can I set goals per project?**
A: Not currently, but this is a planned feature.

**Q: Can I categorize projects?**
A: Yes, but only through the database directly. UI support coming in future versions.

## Getting Help

- **Documentation**: Check README.md for technical details
- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Ask questions on GitHub Discussions
- **Updates**: Check for extension updates regularly

---

Happy tracking! Remember, the goal is to understand your time, not to stress over every minute. Use this tool to gain insights and improve your workflow. ⏱️
