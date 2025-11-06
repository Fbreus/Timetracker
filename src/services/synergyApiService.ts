import * as vscode from 'vscode';

/**
 * Customer data structure returned from Synergy API
 */
export interface SynergyCustomer {
    AccountID: string;
    AccountName: string;
}

/**
 * Configuration for Synergy API
 */
interface SynergyConfig {
    tokenEndpoint: string;
    customerEndpoint: string;
}

/**
 * Service for interacting with Synergy API
 * Handles authentication and customer data fetching
 */
export class SynergyApiService {
    private config: SynergyConfig;
    private cachedToken?: { token: string; expiresAt: number };

    constructor() {
        // Default configuration - can be overridden via settings
        this.config = {
            tokenEndpoint: 'https://handleteamscallrecordwebhook.azurewebsites.net:443/api/ReturnSynergyAccesToken/triggers/manual/invoke?api-version=2020-05-01-preview&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=vmB_g4-6eXhhbn_C6sfBonXqWnZVWtozUEM1e1JFtyI',
            customerEndpoint: 'https://synergy.esc.be/TopDeskAPI_CRM/api/Customer/GetRelationDataByResId'
        };
    }

    /**
     * Get access token for Synergy API
     * Caches token to avoid unnecessary requests
     */
    private async getAccessToken(): Promise<string> {
        // Check if we have a valid cached token
        if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
            return this.cachedToken.token;
        }

        try {
            const response = await fetch(this.config.tokenEndpoint, {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
            }

            const token = await response.text();

            // Cache token for 50 minutes (assuming 1 hour expiry)
            this.cachedToken = {
                token: token.trim(),
                expiresAt: Date.now() + (50 * 60 * 1000)
            };

            return this.cachedToken.token;
        } catch (error) {
            throw new Error(`Failed to retrieve Synergy access token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Calculate reference date (90 days ago from today)
     * Format: yyyy-MM-dd
     */
    private getReferenceDate(): string {
        const date = new Date();
        date.setDate(date.getDate() - 90);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    /**
     * Fetch customers from Synergy API for a given resource ID
     * @param resId Resource ID to fetch customers for
     * @returns Array of customers with AccountID and AccountName
     */
    async getCustomers(resId: number): Promise<SynergyCustomer[]> {
        try {
            // Get authentication token
            const accessToken = await this.getAccessToken();

            // Build request URL with query parameters
            const referenceDate = this.getReferenceDate();
            const url = `${this.config.customerEndpoint}?resId=${resId}&referenceDate=${referenceDate}`;

            // Make request to Synergy API
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch customers: ${response.status} ${response.statusText}`);
            }

            // Parse response
            const data: any = await response.json();

            // Transform response to match expected format
            // The API returns CustomerID and AccountName, we map to AccountID and AccountName
            const customers: SynergyCustomer[] = [];

            if (Array.isArray(data)) {
                for (const item of data) {
                    customers.push({
                        AccountID: String(item.CustomerID || item.AccountID || ''),
                        AccountName: String(item.AccountName || '')
                    });
                }
            } else if (data && data.Body && Array.isArray(data.Body)) {
                // Handle case where data is wrapped in Body property
                for (const item of data.Body) {
                    customers.push({
                        AccountID: String(item.CustomerID || item.AccountID || ''),
                        AccountName: String(item.AccountName || '')
                    });
                }
            }

            return customers;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to fetch customers from Synergy: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Update API configuration
     * @param config Partial configuration to update
     */
    updateConfig(config: Partial<SynergyConfig>): void {
        this.config = { ...this.config, ...config };
        // Clear cached token when config changes
        this.cachedToken = undefined;
    }

    /**
     * Clear cached token (useful for testing or forcing refresh)
     */
    clearTokenCache(): void {
        this.cachedToken = undefined;
    }
}
