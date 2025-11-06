import * as vscode from 'vscode';
import { SynergyTokenResponse, SynergyAuthConfig } from './synergyTypes';

/**
 * Manages Synergy API authentication and token lifecycle
 */
export class SynergyAuthService {
    private token?: string;
    private tokenExpiration?: Date;
    private config?: SynergyAuthConfig;

    constructor() {
        this.loadConfig();
    }

    /**
     * Load configuration from VS Code settings
     */
    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('timetracker.synergy');

        const apiUrl = config.get<string>('apiUrl');
        const username = config.get<string>('username');
        const password = config.get<string>('password');

        if (apiUrl && username && password) {
            this.config = {
                apiUrl,
                username,
                password
            };
        }
    }

    /**
     * Check if Synergy integration is enabled and configured
     */
    public isEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('timetracker.synergy');
        const enabled = config.get<boolean>('enabled', false);
        return enabled && this.config !== undefined;
    }

    /**
     * Get a valid access token, refreshing if necessary
     */
    public async getAccessToken(): Promise<string> {
        // Check if we have a valid cached token
        if (this.token && this.tokenExpiration && new Date() < this.tokenExpiration) {
            return this.token;
        }

        // Need to get a new token
        await this.authenticate();

        if (!this.token) {
            throw new Error('Failed to obtain access token');
        }

        return this.token;
    }

    /**
     * Authenticate with Synergy API and obtain access token
     */
    private async authenticate(): Promise<void> {
        if (!this.config) {
            throw new Error('Synergy API not configured. Please check your settings.');
        }

        try {
            // Build the authentication URL with query parameters
            const authUrl = `${this.config.apiUrl}/Token?username=${encodeURIComponent(this.config.username)}&password=${encodeURIComponent(this.config.password)}`;

            const response = await fetch(authUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as SynergyTokenResponse;

            // Store the token and calculate expiration
            this.token = data.access_token;

            // Set expiration to 90% of the actual expiration time to refresh before it expires
            const expiresInMs = (data.expires_in || 3600) * 1000 * 0.9;
            this.tokenExpiration = new Date(Date.now() + expiresInMs);

            console.log(`Synergy token obtained, expires at: ${this.tokenExpiration.toISOString()}`);
        } catch (error) {
            console.error('Synergy authentication error:', error);
            this.token = undefined;
            this.tokenExpiration = undefined;
            throw new Error(`Failed to authenticate with Synergy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Test the connection and credentials
     */
    public async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            await this.authenticate();
            return {
                success: true,
                message: 'Successfully connected to Synergy API'
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Clear cached token (useful for testing or logout)
     */
    public clearToken(): void {
        this.token = undefined;
        this.tokenExpiration = undefined;
    }

    /**
     * Reload configuration from settings
     */
    public reloadConfig(): void {
        this.loadConfig();
        this.clearToken();
    }
}
