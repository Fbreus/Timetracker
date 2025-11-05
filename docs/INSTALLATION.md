# Installation Guide

## Prerequisites

Before installing the Time Tracker extension, ensure you have:

- **VS Code**: Version 1.70.0 or higher
- **Operating System**: Windows, macOS, or Linux
- **Node.js**: Version 18+ (only if building from source)

## Installation Methods

### Method 1: From Source (Recommended for Development)

This method is best if you want to:
- Contribute to development
- Customize the extension
- Build from the latest code

#### Steps:

1. **Clone the Repository**
   ```bash
   git clone https://github.com/yourusername/vscode-time-tracker.git
   cd vscode-time-tracker
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

   This will install all required packages including:
   - TypeScript
   - better-sqlite3
   - VS Code extension types
   - Development tools

3. **Compile TypeScript**
   ```bash
   npm run compile
   ```

   This compiles the TypeScript source files to JavaScript in the `out/` directory.

4. **Open in VS Code**
   ```bash
   code .
   ```

5. **Run the Extension**
   - Press `F5` to open a new VS Code window with the extension loaded
   - Or use Run > Start Debugging from the menu

6. **Test the Extension**
   - Open a workspace folder in the new window
   - Check that the Time Tracker icon appears in the Activity Bar
   - Tracking should start automatically

#### Development Mode

For active development:

```bash
# Watch mode - automatically recompiles on changes
npm run watch
```

Keep this running in a terminal while you develop. Press `F5` in VS Code to reload the extension after changes.

### Method 2: From VSIX Package

This method is best for:
- End users
- Production installation
- Distributing to team members

#### Steps:

1. **Download VSIX**
   - Download the `.vsix` file from the [Releases page](https://github.com/yourusername/vscode-time-tracker/releases)
   - Or build it yourself (see Building VSIX section below)

2. **Install in VS Code**
   - Open VS Code
   - Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
   - Click the `...` (More Actions) button at the top of the Extensions view
   - Select "Install from VSIX..."
   - Browse to and select the downloaded `.vsix` file

3. **Restart VS Code**
   - VS Code may prompt you to reload
   - If not, reload manually: `Developer: Reload Window` command

4. **Verify Installation**
   - Check for the Time Tracker icon in the Activity Bar
   - Open Command Palette and search for "Time Tracker" commands

### Method 3: From VS Code Marketplace (Future)

Once published to the marketplace:

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Time Tracker"
4. Click "Install"

## Building VSIX Package

To create a VSIX package for distribution:

1. **Install VSCE** (VS Code Extension packager)
   ```bash
   npm install -g @vscode/vsce
   ```

2. **Package the Extension**
   ```bash
   vsce package
   ```

   This creates a `.vsix` file in the current directory.

3. **Test the Package**
   Install the VSIX in a clean VS Code instance to test it.

## Platform-Specific Notes

### Windows

#### Native Module Compilation

The extension uses `better-sqlite3`, which includes native modules. On Windows, you may need:

1. **Visual Studio Build Tools**
   ```bash
   npm install --global windows-build-tools
   ```

2. **Python 3.x**
   - Download from [python.org](https://www.python.org/downloads/)
   - Ensure Python is in PATH

#### Path Issues

If you encounter path-related errors:

```bash
# Use Windows-style paths
npm config set script-shell "C:\\Program Files\\Git\\bin\\bash.exe"
```

### macOS

#### Xcode Command Line Tools

Required for compiling native modules:

```bash
xcode-select --install
```

#### Permission Issues

If you get permission errors during installation:

```bash
# Fix npm permissions
sudo chown -R $USER /usr/local/lib/node_modules
```

### Linux

#### Build Dependencies

Install build tools:

**Ubuntu/Debian:**
```bash
sudo apt-get install build-essential python3
```

**Fedora/CentOS:**
```bash
sudo yum install gcc-c++ make python3
```

**Arch Linux:**
```bash
sudo pacman -S base-devel python
```

#### SQLite Development Files

Some distributions may need SQLite development files:

```bash
# Ubuntu/Debian
sudo apt-get install libsqlite3-dev

# Fedora/CentOS
sudo yum install sqlite-devel

# Arch Linux
sudo pacman -S sqlite
```

## Post-Installation Setup

### First Launch

1. **Open a Workspace**
   Open any project folder in VS Code

2. **Check Sidebar**
   Click the Time Tracker icon (clock) in the Activity Bar

3. **Verify Tracking**
   - If auto-start is enabled, tracking starts automatically
   - Check the sidebar shows "Tracking" status

4. **Configure Settings** (Optional)
   - Open Settings (`Ctrl+,` / `Cmd+,`)
   - Search for "Time Tracker"
   - Adjust settings as needed

### Data Directory

The extension creates a data directory on first use:

**Windows:**
```
%APPDATA%\Code\User\globalStorage\<publisher>.vscode-time-tracker\
```

**macOS:**
```
~/Library/Application Support/Code/User/globalStorage/<publisher>.vscode-time-tracker/
```

**Linux:**
```
~/.config/Code/User/globalStorage/<publisher>.vscode-time-tracker/
```

This directory contains:
- `timetracker.db` - SQLite database with all your data
- `timetracker.db-journal` - Temporary journal file (safe to ignore)

### Recommended Initial Settings

For most users, these settings provide a good starting point:

```json
{
  "timetracker.idleTimeout": 5,
  "timetracker.minSessionDuration": 1,
  "timetracker.autoStart": true,
  "timetracker.excludedProjects": []
}
```

## Troubleshooting Installation

### Extension Won't Activate

**Symptoms:**
- No Time Tracker icon in Activity Bar
- Commands not available in Command Palette

**Solutions:**
1. Check VS Code version (must be 1.70+)
2. Check Developer Console for errors:
   - Help > Toggle Developer Tools
   - Look for errors related to Time Tracker
3. Try reinstalling the extension
4. Restart VS Code

### Native Module Errors

**Symptoms:**
```
Error: Cannot find module 'better-sqlite3'
```

**Solutions:**

1. **Rebuild Native Modules**
   ```bash
   npm rebuild better-sqlite3
   ```

2. **Install from Source**
   If prebuilt binaries don't work:
   ```bash
   npm install better-sqlite3 --build-from-source
   ```

3. **Check Node Version**
   Ensure your Node.js version matches the VS Code Electron version:
   ```bash
   node --version
   ```

### Database Initialization Errors

**Symptoms:**
- Extension activates but sidebar shows errors
- Cannot start tracking

**Solutions:**

1. **Check Directory Permissions**
   Ensure the global storage directory is writable

2. **Delete Database and Restart**
   - Close VS Code
   - Delete `timetracker.db` from the storage directory
   - Restart VS Code (will create fresh database)

3. **Check Disk Space**
   Ensure you have available disk space

### Compilation Errors

**Symptoms:**
```
error TS2304: Cannot find name 'vscode'
```

**Solutions:**

1. **Reinstall Dependencies**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check TypeScript Version**
   ```bash
   npm list typescript
   ```
   Should be 4.7.4 or compatible

3. **Clean Build**
   ```bash
   npm run compile
   ```

## Upgrading

### From Previous Version

1. **Backup Your Data**
   Copy the database file from the storage directory

2. **Uninstall Old Version**
   - Extensions view > Time Tracker > Uninstall
   - Or use command: `Extensions: Uninstall Extension`

3. **Install New Version**
   Follow installation steps above

4. **Verify Data**
   - Open the sidebar
   - Check that your historical data is present
   - If not, restore from backup

### Database Migration

If upgrading from an incompatible database version:

1. **Export Old Data**
   Use the export function before upgrading

2. **Install New Version**
   Old database will be automatically migrated or recreated

3. **Import Data** (if needed)
   Use the import function (if available in new version)

## Uninstalling

### Complete Removal

1. **Uninstall Extension**
   - Extensions view > Time Tracker > Uninstall
   - Or: `Extensions: Uninstall Extension` command

2. **Remove Data** (Optional)
   If you want to remove all tracking data:

   **Windows:**
   ```powershell
   Remove-Item -Recurse "%APPDATA%\Code\User\globalStorage\<publisher>.vscode-time-tracker"
   ```

   **macOS/Linux:**
   ```bash
   rm -rf ~/Library/Application\ Support/Code/User/globalStorage/<publisher>.vscode-time-tracker
   # or
   rm -rf ~/.config/Code/User/globalStorage/<publisher>.vscode-time-tracker
   ```

3. **Restart VS Code**

### Keep Data for Later

If you might reinstall later, keep the database file. Just uninstall the extension - your data remains intact.

## Getting Help

If you encounter issues not covered here:

1. **Check Documentation**
   - README.md
   - USER_GUIDE.md

2. **Search Issues**
   - [GitHub Issues](https://github.com/yourusername/vscode-time-tracker/issues)

3. **Create New Issue**
   Include:
   - OS and version
   - VS Code version
   - Node.js version (if building from source)
   - Error messages from Developer Console
   - Steps to reproduce

4. **Community**
   - [GitHub Discussions](https://github.com/yourusername/vscode-time-tracker/discussions)

---

Successful installation? Great! Check out the [User Guide](USER_GUIDE.md) to get started. 🚀
