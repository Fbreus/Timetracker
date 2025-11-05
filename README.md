# Time Tracker for VS Code

A comprehensive, automatic time tracking extension for Visual Studio Code that monitors your work activity and provides detailed analytics about time spent on different projects.

## Features

### Automatic Time Tracking
- **Zero Configuration**: Start tracking immediately after installation
- **Activity Detection**: Automatically detects when you're actively working (typing, file navigation, debugging, terminal usage)
- **Idle Detection**: Pauses tracking after a configurable period of inactivity (default: 5 minutes)
- **Project-Based Tracking**: Tracks time per workspace folder
- **Persistent Data**: All data stored locally in SQLite database

### Rich User Interface
- **Sidebar Panel**: Quick view of current session, today's total, and project breakdown
- **Dashboard**: Comprehensive view with statistics for today, this week, and all time
- **Real-time Updates**: Live timer showing current session duration
- **Visual Feedback**: Color-coded status indicators (tracking, paused, stopped)

### Data Management
- **Manual Entries**: Add time entries for work done outside VS Code
- **Edit/Delete**: Modify or remove time entries
- **Multiple Export Formats**: Export data as CSV (detailed or summary), JSON, or text reports
- **Date Range Filtering**: Export data for specific time periods

### Analytics & Reports
- **Daily Summaries**: See how much time spent on each project today
- **Weekly Overview**: Track your weekly productivity
- **All-Time Statistics**: View cumulative time across all projects
- **Session History**: Review past work sessions with start/end times

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/vscode-time-tracker.git
   cd vscode-time-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Open the folder in VS Code and press F5 to launch the extension in a new window

### From VSIX Package

1. Download the `.vsix` file from the releases page
2. In VS Code, go to Extensions view (Ctrl+Shift+X)
3. Click the "..." menu at the top and select "Install from VSIX..."
4. Select the downloaded file

## Usage

### Getting Started

1. **Open a Project**: Open any workspace folder in VS Code
2. **Automatic Start**: If auto-start is enabled (default), tracking begins automatically
3. **View Status**: Click the Time Tracker icon in the Activity Bar to see the sidebar

### Commands

Access these commands via the Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- `Time Tracker: Start Tracking` - Manually start tracking the current project
- `Time Tracker: Stop Tracking` - Stop tracking and save the session
- `Time Tracker: Pause Tracking` - Temporarily pause tracking
- `Time Tracker: Resume Tracking` - Resume a paused session
- `Time Tracker: Show Dashboard` - Open the analytics dashboard
- `Time Tracker: Add Manual Entry` - Add a time entry manually
- `Time Tracker: Export Data` - Export your time tracking data
- `Time Tracker: Open Settings` - Open Time Tracker settings

### Sidebar

The sidebar shows:
- **Current Session**: Active project, timer, and tracking controls
- **Today's Total**: Total time tracked today across all projects
- **Today's Projects**: List of projects worked on today with individual times
- **Quick Actions**: Links to dashboard, manual entry, and export

### Dashboard

The dashboard provides:
- Today's summary (total time, number of projects)
- This week's summary
- All-time project breakdown with cumulative hours

### Manual Time Entry

1. Click "Manual Entry" in the sidebar or run the command
2. Enter the date (or leave empty for today)
3. Enter start time (e.g., "9:00" or "9:00 AM")
4. Enter end time (e.g., "17:00" or "5:00 PM")
5. Optionally add notes
6. Mark as billable if needed

### Exporting Data

1. Click "Export" in the sidebar or run the export command
2. Choose export format:
   - **CSV - Detailed**: All time entries with full details
   - **CSV - Summary**: Aggregated data per project
   - **JSON**: Complete data in JSON format
   - **Text Report**: Human-readable report
3. Select date range (All Time, Today, This Week, This Month, or Custom)
4. Choose save location

## Configuration

Go to Settings (File > Preferences > Settings) and search for "Time Tracker":

### Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `timetracker.idleTimeout` | number | 5 | Minutes of inactivity before pausing tracking |
| `timetracker.minSessionDuration` | number | 1 | Minimum session duration in minutes to record |
| `timetracker.excludedProjects` | array | [] | Project paths or names to exclude from tracking |
| `timetracker.autoStart` | boolean | true | Automatically start tracking when opening a project |
| `timetracker.workingHoursStart` | string | "09:00" | Working hours start time (HH:MM) |
| `timetracker.workingHoursEnd` | string | "17:00" | Working hours end time (HH:MM) |
| `timetracker.dataRetentionDays` | number | 365 | Number of days to retain data (0 = forever) |

### Example Configuration

```json
{
  "timetracker.idleTimeout": 10,
  "timetracker.minSessionDuration": 2,
  "timetracker.excludedProjects": ["test-project", "/path/to/exclude"],
  "timetracker.autoStart": true
}
```

## Data Storage

All data is stored locally on your machine:

- **Location**: VS Code's global storage directory
  - Windows: `%APPDATA%\Code\User\globalStorage\<publisher>.vscode-time-tracker\`
  - macOS: `~/Library/Application Support/Code/User/globalStorage/<publisher>.vscode-time-tracker/`
  - Linux: `~/.config/Code/User/globalStorage/<publisher>.vscode-time-tracker/`

- **Database**: SQLite database file (`timetracker.db`)
- **Privacy**: No data is sent to external servers
- **Backup**: You can manually backup the database file

## Database Schema

The extension uses SQLite with the following tables:

- **projects**: Project information (name, path, category, tags)
- **time_entries**: Individual time tracking sessions
- **activity_log**: Detailed activity events (start, pause, resume, stop, idle)
- **daily_summaries**: Pre-aggregated daily statistics
- **settings**: Extension settings storage

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- VS Code 1.70+

### Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test

# Package extension
npx vsce package
```

### Project Structure

```
vscode-time-tracker/
├── src/
│   ├── database/           # Database layer
│   │   ├── schema.sql      # Database schema
│   │   └── database.ts     # Database operations
│   ├── tracking/           # Time tracking logic
│   │   ├── activityDetector.ts
│   │   └── timeTracker.ts
│   ├── views/              # UI components
│   │   └── sidebarProvider.ts
│   ├── utils/              # Utility functions
│   │   ├── formatters.ts
│   │   └── exporter.ts
│   └── extension.ts        # Main extension file
├── resources/              # Icons and assets
├── package.json            # Extension manifest
├── tsconfig.json          # TypeScript configuration
└── README.md              # This file
```

## Troubleshooting

### Tracking Not Starting

1. Check if a workspace folder is open
2. Verify the project is not in the excluded list
3. Check if auto-start is enabled in settings
4. Try manually starting tracking with the command

### Database Issues

1. Check if the storage directory is writable
2. Look for database errors in the Developer Console (Help > Toggle Developer Tools)
3. If corrupted, you can delete the database file (backup first!)

### Performance Issues

1. Check the idle timeout setting (lower values = more frequent checks)
2. Review the minimum session duration
3. Check if too many activities are being logged

## Privacy & Security

- **Local Only**: All data stored on your local machine
- **No Telemetry**: No usage data sent to external servers
- **No File Content**: Only tracks project names and time data
- **Full Control**: You own your data and can export/delete it anytime

## Roadmap

Future enhancements may include:

- [ ] Integration with project management tools (Jira, Trello, Asana)
- [ ] Team time tracking capabilities
- [ ] Billable vs non-billable hour tracking
- [ ] Client assignment per project
- [ ] Invoice generation
- [ ] Browser extension for non-VS Code work
- [ ] Mobile app for viewing stats
- [ ] Charts and visualizations
- [ ] Goals and productivity insights
- [ ] Git integration (track time per branch/commit)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: Report bugs or request features on GitHub Issues
- **Discussions**: Ask questions on GitHub Discussions
- **Email**: support@example.com

## Acknowledgments

- Built with [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for efficient local storage
- Inspired by time tracking tools like Toggl, RescueTime, and WakaTime

---

**Enjoy tracking your time!** ⏱️
