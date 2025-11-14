import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';

/**
 * Microsoft Teams presence status values
 */
export enum TeamsPresence {
    Available = 'Available',
    Busy = 'Busy',
    DoNotDisturb = 'DoNotDisturb',
    BeRightBack = 'BeRightBack',
    Away = 'Away',
    Offline = 'Offline'
}

/**
 * Teams integration configuration
 */
interface TeamsConfig {
    enabled: boolean;
    autoSetDNDOnPomodoro: boolean;
    autoSetDNDOnTracking: boolean;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: number;
}

/**
 * Service for integrating with Microsoft Teams
 * Sets user presence/status via Microsoft Graph API
 */
export class TeamsIntegrationService {
    private config: TeamsConfig;
    private previousPresence?: TeamsPresence;
    private isInFocusMode: boolean = false;

    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from VS Code settings
     */
    private loadConfig(): TeamsConfig {
        const config = vscode.workspace.getConfiguration('timetracker.teams');
        return {
            enabled: config.get('enabled', false),
            autoSetDNDOnPomodoro: config.get('autoSetDNDOnPomodoro', true),
            autoSetDNDOnTracking: config.get('autoSetDNDOnTracking', false),
            accessToken: config.get('accessToken'),
            refreshToken: config.get('refreshToken'),
            tokenExpiry: config.get('tokenExpiry')
        };
    }

    /**
     * Save configuration to VS Code settings
     */
    private async saveConfig(): Promise<void> {
        const config = vscode.workspace.getConfiguration('timetracker.teams');
        await config.update('accessToken', this.config.accessToken, vscode.ConfigurationTarget.Global);
        await config.update('refreshToken', this.config.refreshToken, vscode.ConfigurationTarget.Global);
        await config.update('tokenExpiry', this.config.tokenExpiry, vscode.ConfigurationTarget.Global);
    }

    /**
     * Check if Teams integration is enabled and authenticated
     */
    isEnabled(): boolean {
        return this.config.enabled && !!this.config.accessToken;
    }

    /**
     * Get current user presence from Teams
     */
    async getCurrentPresence(): Promise<TeamsPresence | null> {
        if (!this.isEnabled()) {
            return null;
        }

        try {
            const response = await axios.get('https://graph.microsoft.com/v1.0/me/presence', {
                headers: {
                    'Authorization': `Bearer ${this.config.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data.availability as TeamsPresence;
        } catch (error) {
            console.error('Failed to get Teams presence:', error);
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                vscode.window.showWarningMessage('Teams authentication expired. Please reconnect.');
            }
            return null;
        }
    }

    /**
     * Set user presence in Teams
     */
    async setPresence(presence: TeamsPresence, duration: number = 0): Promise<boolean> {
        if (!this.isEnabled()) {
            return false;
        }

        try {
            // Use presence API to set status
            const body: any = {
                sessionId: 'timetracker-vscode',
                availability: presence,
                activity: presence
            };

            // If duration is specified, set expiration
            if (duration > 0) {
                const expirationDateTime = new Date(Date.now() + duration * 60000).toISOString();
                body.expirationDuration = `PT${duration}M`;
            }

            await axios.post(
                'https://graph.microsoft.com/v1.0/me/presence/setPresence',
                body,
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return true;
        } catch (error) {
            console.error('Failed to set Teams presence:', error);
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.response?.status === 401) {
                    vscode.window.showWarningMessage('Teams authentication expired. Please reconnect.');
                } else {
                    vscode.window.showErrorMessage(`Failed to set Teams status: ${axiosError.message}`);
                }
            }
            return false;
        }
    }

    /**
     * Enter focus mode - set Teams to Do Not Disturb
     * @param durationMinutes Optional duration in minutes
     */
    async enterFocusMode(durationMinutes?: number): Promise<void> {
        if (!this.isEnabled()) {
            return;
        }

        // Store current presence to restore later
        if (!this.isInFocusMode) {
            this.previousPresence = await this.getCurrentPresence() || TeamsPresence.Available;
        }

        const success = await this.setPresence(TeamsPresence.DoNotDisturb, durationMinutes);

        if (success) {
            this.isInFocusMode = true;
            vscode.window.showInformationMessage('🎯 Teams status set to Do Not Disturb - Focus Mode ON');
        }
    }

    /**
     * Exit focus mode - restore previous Teams presence
     */
    async exitFocusMode(): Promise<void> {
        if (!this.isEnabled() || !this.isInFocusMode) {
            return;
        }

        const previousStatus = this.previousPresence || TeamsPresence.Available;
        const success = await this.setPresence(previousStatus);

        if (success) {
            this.isInFocusMode = false;
            vscode.window.showInformationMessage(`Teams status restored to ${previousStatus}`);
        }
    }

    /**
     * Handle Pomodoro work session start
     */
    async onPomodoroWorkStart(durationMinutes: number): Promise<void> {
        if (this.config.autoSetDNDOnPomodoro) {
            await this.enterFocusMode(durationMinutes);
        }
    }

    /**
     * Handle Pomodoro break start
     */
    async onPomodoroBreakStart(): Promise<void> {
        if (this.config.autoSetDNDOnPomodoro) {
            await this.exitFocusMode();
        }
    }

    /**
     * Handle tracking start
     */
    async onTrackingStart(): Promise<void> {
        if (this.config.autoSetDNDOnTracking) {
            await this.enterFocusMode();
        }
    }

    /**
     * Handle tracking stop
     */
    async onTrackingStop(): Promise<void> {
        if (this.config.autoSetDNDOnTracking) {
            await this.exitFocusMode();
        }
    }

    /**
     * Manually toggle Do Not Disturb mode
     */
    async toggleDND(): Promise<void> {
        if (!this.isEnabled()) {
            vscode.window.showWarningMessage('Teams integration is not enabled or not authenticated.');
            return;
        }

        if (this.isInFocusMode) {
            await this.exitFocusMode();
        } else {
            await this.enterFocusMode();
        }
    }

    /**
     * Authenticate with Microsoft Teams using device code flow
     */
    async authenticate(): Promise<boolean> {
        // Show instructions for manual token setup
        const result = await vscode.window.showInformationMessage(
            'Teams Integration Setup: You need to provide a Microsoft Graph API access token. Would you like instructions?',
            'Show Instructions',
            'Enter Token',
            'Cancel'
        );

        if (result === 'Show Instructions') {
            const instructions = `
# Microsoft Teams Integration Setup

To enable Teams integration, you need to create an access token:

1. **Register an Azure AD Application**:
   - Go to https://portal.azure.com
   - Navigate to "Azure Active Directory" > "App registrations"
   - Click "New registration"
   - Name: "VS Code Time Tracker"
   - Supported account types: "Accounts in this organizational directory only"
   - Click "Register"

2. **Configure API Permissions**:
   - In your app, go to "API permissions"
   - Click "Add a permission" > "Microsoft Graph" > "Delegated permissions"
   - Add these permissions:
     - Presence.ReadWrite
   - Click "Grant admin consent"

3. **Get Authentication Details**:
   - Note your "Application (client) ID"
   - Go to "Certificates & secrets" > "New client secret"
   - Copy the secret value immediately

4. **Get Access Token**:
   - Use the Azure AD authentication flow or a tool like Postman
   - Endpoint: https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
   - Or use this simplified approach: Enter the token manually in the next step

For a simpler approach, you can use Microsoft Graph Explorer to get a temporary token:
- Go to https://developer.microsoft.com/graph/graph-explorer
- Sign in and consent to Presence.ReadWrite permission
- Copy the access token from the request headers
            `;

            const panel = vscode.window.createWebviewPanel(
                'teamsSetup',
                'Teams Integration Setup',
                vscode.ViewColumn.One,
                {}
            );

            panel.webview.html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: var(--vscode-font-family);
                            padding: 20px;
                            line-height: 1.6;
                        }
                        pre {
                            background: var(--vscode-textBlockQuote-background);
                            padding: 15px;
                            border-radius: 5px;
                            overflow-x: auto;
                        }
                        h1 { color: var(--vscode-textLink-foreground); }
                        ol { margin-left: 20px; }
                        li { margin-bottom: 10px; }
                    </style>
                </head>
                <body>
                    <pre>${instructions.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </body>
                </html>
            `;

            // After showing instructions, prompt for token
            setTimeout(() => {
                this.promptForToken();
            }, 2000);

            return false;
        } else if (result === 'Enter Token') {
            return await this.promptForToken();
        }

        return false;
    }

    /**
     * Prompt user to enter access token
     */
    private async promptForToken(): Promise<boolean> {
        const token = await vscode.window.showInputBox({
            prompt: 'Enter your Microsoft Graph API access token',
            password: true,
            placeHolder: 'eyJ0eXAiOiJKV1QiLCJub25jZSI6...',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Token cannot be empty';
                }
                if (value.length < 100) {
                    return 'Token seems too short. Please enter a valid access token.';
                }
                return null;
            }
        });

        if (!token) {
            return false;
        }

        // Save token
        this.config.accessToken = token;
        this.config.tokenExpiry = Date.now() + (3600 * 1000); // Assume 1 hour expiry
        await this.saveConfig();

        // Test the token
        const presence = await this.getCurrentPresence();
        if (presence !== null) {
            vscode.window.showInformationMessage('✅ Teams integration connected successfully!');

            // Update enabled setting
            const config = vscode.workspace.getConfiguration('timetracker.teams');
            await config.update('enabled', true, vscode.ConfigurationTarget.Global);
            this.config.enabled = true;

            return true;
        } else {
            vscode.window.showErrorMessage('Failed to connect to Teams. Please check your token and try again.');
            return false;
        }
    }

    /**
     * Disconnect Teams integration
     */
    async disconnect(): Promise<void> {
        this.config.accessToken = undefined;
        this.config.refreshToken = undefined;
        this.config.tokenExpiry = undefined;
        await this.saveConfig();

        const config = vscode.workspace.getConfiguration('timetracker.teams');
        await config.update('enabled', false, vscode.ConfigurationTarget.Global);
        this.config.enabled = false;

        vscode.window.showInformationMessage('Teams integration disconnected');
    }

    /**
     * Check and show current Teams status
     */
    async showStatus(): Promise<void> {
        if (!this.isEnabled()) {
            vscode.window.showInformationMessage('Teams integration is not enabled. Use "Teams: Connect" to set up.');
            return;
        }

        const presence = await this.getCurrentPresence();
        if (presence) {
            vscode.window.showInformationMessage(`Current Teams status: ${presence}${this.isInFocusMode ? ' (Focus Mode Active)' : ''}`);
        } else {
            vscode.window.showWarningMessage('Could not retrieve Teams status. Please check your connection.');
        }
    }
}
