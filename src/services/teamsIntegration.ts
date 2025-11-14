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
    clientId?: string; // Store client ID for token refresh
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
            tokenExpiry: config.get('tokenExpiry'),
            clientId: config.get('clientId')
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
        await config.update('clientId', this.config.clientId, vscode.ConfigurationTarget.Global);
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

        // Refresh token if needed
        await this.refreshTokenIfNeeded();

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

        // Refresh token if needed
        await this.refreshTokenIfNeeded();

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
     * Authenticate with Microsoft Teams using Device Code Flow
     */
    async authenticate(): Promise<boolean> {
        try {
            // Check if user wants to use custom app or guided setup
            const choice = await vscode.window.showInformationMessage(
                'Teams Integration requires a Microsoft Azure app registration. Choose setup method:',
                { modal: true },
                'Quick Setup (Recommended)',
                'Use My App',
                'Cancel'
            );

            if (choice === 'Cancel' || !choice) {
                return false;
            }

            let clientId: string;

            if (choice === 'Use My App') {
                // User provides their own client ID
                const inputClientId = await vscode.window.showInputBox({
                    prompt: 'Enter your Azure AD Application (client) ID',
                    placeHolder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                    validateInput: (value) => {
                        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        return uuidRegex.test(value) ? null : 'Please enter a valid client ID (UUID format)';
                    }
                });

                if (!inputClientId) {
                    return false;
                }
                clientId = inputClientId;
            } else {
                // Quick Setup - use public Graph Explorer client
                // Note: This may require admin consent for Presence.ReadWrite
                clientId = 'de8bc8b5-d9f9-48b1-a8ad-b748da725064'; // Graph Explorer client ID
            }

            const tenantId = 'common'; // Works for all Microsoft accounts
            // Add offline_access to get refresh token
            const scope = 'https://graph.microsoft.com/Presence.ReadWrite offline_access';

            // Step 1: Request device code
            vscode.window.showInformationMessage('Starting Microsoft authentication...');

            const deviceCodeResponse = await axios.post(
                `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`,
                new URLSearchParams({
                    client_id: clientId,
                    scope: scope
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            ).catch(error => {
                console.error('Device code request failed:', error.response?.data || error.message);
                throw error;
            });

            const deviceCode = deviceCodeResponse.data.device_code;
            const userCode = deviceCodeResponse.data.user_code;
            const verificationUri = deviceCodeResponse.data.verification_uri;
            const expiresIn = deviceCodeResponse.data.expires_in;
            const interval = deviceCodeResponse.data.interval;

            // Step 2: Show user the code and open browser
            const message = `To sign in, use a web browser to open ${verificationUri} and enter the code: ${userCode}`;

            const result = await vscode.window.showInformationMessage(
                `Opening browser for authentication. Code: ${userCode}`,
                { modal: true },
                'Open Browser',
                'Copy Code',
                'Cancel'
            );

            if (result === 'Cancel') {
                vscode.window.showWarningMessage('Authentication cancelled');
                return false;
            }

            if (result === 'Open Browser') {
                vscode.env.openExternal(vscode.Uri.parse(verificationUri));
            }

            if (result === 'Copy Code') {
                vscode.env.clipboard.writeText(userCode);
                vscode.window.showInformationMessage(`Code ${userCode} copied to clipboard!`);
                vscode.env.openExternal(vscode.Uri.parse(verificationUri));
            }

            // Step 3: Poll for token
            vscode.window.showInformationMessage('Waiting for you to complete sign-in in browser...');

            const startTime = Date.now();
            const maxWaitTime = expiresIn * 1000;

            while (Date.now() - startTime < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, interval * 1000));

                try {
                    const tokenResponse = await axios.post(
                        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
                        new URLSearchParams({
                            client_id: clientId,
                            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                            device_code: deviceCode
                        }),
                        {
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                        }
                    );

                    // Success! We got the token
                    this.config.accessToken = tokenResponse.data.access_token;
                    this.config.refreshToken = tokenResponse.data.refresh_token;
                    this.config.tokenExpiry = Date.now() + (tokenResponse.data.expires_in * 1000);
                    this.config.clientId = clientId; // Save client ID for refresh
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
                        vscode.window.showErrorMessage('Failed to connect to Teams. Please try again.');
                        return false;
                    }
                } catch (error) {
                    if (axios.isAxiosError(error) && error.response?.data?.error === 'authorization_pending') {
                        // User hasn't completed auth yet, continue polling
                        continue;
                    }
                    throw error;
                }
            }

            vscode.window.showWarningMessage('Authentication timed out. Please try again.');
            return false;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to authenticate with Microsoft: ${errorMessage}`);
            return false;
        }
    }

    /**
     * Refresh access token if expired using refresh token
     */
    private async refreshTokenIfNeeded(): Promise<boolean> {
        // Check if token is expired or about to expire (within 5 minutes)
        if (!this.config.tokenExpiry || Date.now() >= (this.config.tokenExpiry - 300000)) {
            if (!this.config.refreshToken || !this.config.clientId) {
                console.error('No refresh token or client ID available');
                return false;
            }

            try {
                const tenantId = 'common';

                const tokenResponse = await axios.post(
                    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
                    new URLSearchParams({
                        client_id: this.config.clientId,
                        grant_type: 'refresh_token',
                        refresh_token: this.config.refreshToken,
                        scope: 'https://graph.microsoft.com/Presence.ReadWrite offline_access'
                    }),
                    {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    }
                );

                this.config.accessToken = tokenResponse.data.access_token;
                if (tokenResponse.data.refresh_token) {
                    this.config.refreshToken = tokenResponse.data.refresh_token;
                }
                this.config.tokenExpiry = Date.now() + (tokenResponse.data.expires_in * 1000);
                await this.saveConfig();
                return true;
            } catch (error) {
                console.error('Failed to refresh token:', error);
                vscode.window.showWarningMessage('Teams authentication expired. Please reconnect using "Teams: Connect"');
                return false;
            }
        }
        return true;
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
