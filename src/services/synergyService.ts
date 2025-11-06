import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import {
    SynergyRequestBody,
    SynergyTokenResponse,
    SynergyApiResponse,
    SynergyConfig,
    DEFAULT_SYNERGY_CONFIG,
    WinterHourCheckRequest,
    WinterHourCheckResponse,
    SynergyCustomer,
    SynergyProject
} from './synergyTypes';

export class SynergyService {
    private config: SynergyConfig;
    private cachedToken?: string;
    private tokenExpiry?: Date;

    constructor() {
        this.config = this.loadConfig();
    }

    /**
     * Load Synergy configuration from VS Code settings
     */
    private loadConfig(): SynergyConfig {
        const config = vscode.workspace.getConfiguration('timetracker.synergy');

        return {
            enabled: config.get<boolean>('enabled', DEFAULT_SYNERGY_CONFIG.enabled),
            apiEndpoint: config.get<string>('apiEndpoint', DEFAULT_SYNERGY_CONFIG.apiEndpoint),
            tokenEndpoint: config.get<string>('tokenEndpoint', DEFAULT_SYNERGY_CONFIG.tokenEndpoint),
            winterHourCheckEndpoint: config.get<string>('winterHourCheckEndpoint', DEFAULT_SYNERGY_CONFIG.winterHourCheckEndpoint),
            customersEndpoint: config.get<string>('customersEndpoint', DEFAULT_SYNERGY_CONFIG.customersEndpoint),
            projectsEndpoint: config.get<string>('projectsEndpoint', DEFAULT_SYNERGY_CONFIG.projectsEndpoint),
            defaultCustomerId: config.get<string>('defaultCustomerId', DEFAULT_SYNERGY_CONFIG.defaultCustomerId),
            defaultProject: config.get<string>('defaultProject', DEFAULT_SYNERGY_CONFIG.defaultProject),
            resourceId: config.get<number>('resourceId'),
            defaultActivity: config.get<'CONSULTANCY' | 'DEVELOPMENT'>('defaultActivity', DEFAULT_SYNERGY_CONFIG.defaultActivity)
        };
    }

    /**
     * Reload configuration (call when settings change)
     */
    public reloadConfig(): void {
        this.config = this.loadConfig();
        this.cachedToken = undefined; // Invalidate cached token
    }

    /**
     * Check if Synergy integration is enabled
     */
    public isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Get Synergy access token
     */
    private async getAccessToken(): Promise<string> {
        // Return cached token if still valid
        if (this.cachedToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
            return this.cachedToken;
        }

        try {
            const response = await this.makeHttpRequest<any>(
                this.config.tokenEndpoint,
                'GET'
            );

            // Handle both JSON response and plain string token
            let token: string;
            if (typeof response === 'string') {
                // Plain token string (e.g., "Bearer eyJhbGciOi...")
                token = response.trim();
                // Remove "Bearer " prefix if present
                if (token.startsWith('Bearer ')) {
                    token = token.substring(7);
                }
            } else if (response.body && typeof response.body === 'string') {
                // Token in body field
                token = response.body.trim();
                if (token.startsWith('Bearer ')) {
                    token = token.substring(7);
                }
            } else {
                throw new Error('Unexpected token response format');
            }

            this.cachedToken = token;
            // Token expires in 1 hour (assuming standard token expiry)
            this.tokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
            return token;
        } catch (error) {
            throw new Error(`Failed to get Synergy access token: ${error}`);
        }
    }

    /**
     * Check if winter hour adjustment is needed
     */
    public async checkWinterHour(date: Date): Promise<boolean> {
        try {
            const response = await this.makeHttpRequest<WinterHourCheckResponse>(
                this.config.winterHourCheckEndpoint,
                'POST',
                { Date: date.toISOString() }
            );

            return response.IsWinterHour === 'True';
        } catch (error) {
            console.error('Failed to check winter hour:', error);
            // Default to winter hour (UTC+1) if check fails
            return true;
        }
    }

    /**
     * Get customers for a resource
     */
    public async getCustomers(resourceId: number): Promise<SynergyCustomer[]> {
        try {
            const response = await this.makeHttpRequest<SynergyCustomer[]>(
                this.config.customersEndpoint,
                'POST',
                { ResID: resourceId }
            );

            return Array.isArray(response) ? response : [];
        } catch (error) {
            console.error('Failed to get customers:', error);
            return [];
        }
    }

    /**
     * Get projects for an employee
     */
    public async getProjects(employeeId: number): Promise<SynergyProject[]> {
        try {
            const response = await this.makeHttpRequest<SynergyProject[]>(
                this.config.projectsEndpoint,
                'POST',
                { empID: employeeId }
            );

            return Array.isArray(response) ? response : [];
        } catch (error) {
            console.error('Failed to get projects:', error);
            return [];
        }
    }

    /**
     * Adjust date for timezone (winter/summer hour)
     */
    private async adjustDateForTimezone(date: Date): Promise<Date> {
        const isWinterHour = await this.checkWinterHour(date);
        const adjustedDate = new Date(date);

        if (isWinterHour) {
            // Winter hour: UTC+1
            adjustedDate.setHours(adjustedDate.getHours() + 1);
        } else {
            // Summer hour: UTC+2
            adjustedDate.setHours(adjustedDate.getHours() + 2);
        }

        return adjustedDate;
    }

    /**
     * Submit a time entry to Synergy PSA
     */
    public async submitTimeEntry(
        startTime: Date,
        hours: number,
        description: string,
        options: {
            customerId?: string;
            projectNo?: string;
            resourceId?: number;
            internalRemarks?: string;
            externalRemarks?: string;
            activity?: 'CONSULTANCY' | 'DEVELOPMENT';
        } = {}
    ): Promise<SynergyApiResponse> {
        if (!this.config.enabled) {
            return {
                success: false,
                error: 'Synergy integration is not enabled'
            };
        }

        try {
            // Get access token
            const token = await this.getAccessToken();

            // Adjust date for timezone
            const adjustedDate = await this.adjustDateForTimezone(startTime);

            // Determine project and customer
            let project = options.projectNo || this.config.defaultProject;
            let customerId = options.customerId || this.config.defaultCustomerId;

            // If projectNo contains pipe, split it (format: "ProjectNo|CustomerID")
            if (options.projectNo && options.projectNo.includes('|')) {
                const [projectPart, customerPart] = options.projectNo.split('|');
                project = projectPart;
                customerId = customerPart;
            }

            // Get resource ID
            const resourceId = options.resourceId || this.config.resourceId;
            if (!resourceId) {
                return {
                    success: false,
                    error: 'Resource ID is not configured'
                };
            }

            // Build request body
            const requestBody: SynergyRequestBody = {
                Activity: options.activity || this.config.defaultActivity,
                CustomerID: customerId,
                Date: adjustedDate.toISOString(),
                Description: description,
                ExternalRemarks: options.externalRemarks,
                Hours: hours,
                HoursRealized: hours,
                InternalRemarks: options.internalRemarks,
                Project: project,
                ResourceID: resourceId
            };

            // Submit to Synergy
            const response = await this.submitToSynergy(token, requestBody);

            // If failed with 404 and activity is CONSULTANCY, retry with DEVELOPMENT
            if (response.statusCode === 404 && requestBody.Activity === 'CONSULTANCY') {
                console.log('Retrying with DEVELOPMENT activity...');
                requestBody.Activity = 'DEVELOPMENT';
                return await this.submitToSynergy(token, requestBody);
            }

            return response;
        } catch (error) {
            console.error('Failed to submit to Synergy:', error);
            return {
                success: false,
                error: `Failed to submit: ${error}`
            };
        }
    }

    /**
     * Submit request to Synergy API
     */
    private async submitToSynergy(
        token: string,
        requestBody: SynergyRequestBody
    ): Promise<SynergyApiResponse> {
        try {
            const response = await this.makeHttpRequest(
                this.config.apiEndpoint,
                'POST',
                requestBody,
                {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            );

            return {
                success: true,
                statusCode: 200,
                data: response
            };
        } catch (error: any) {
            return {
                success: false,
                statusCode: error.statusCode || 500,
                error: error.message || 'Unknown error'
            };
        }
    }

    /**
     * Make HTTP request (generic)
     */
    private makeHttpRequest<T>(
        url: string,
        method: 'GET' | 'POST' = 'GET',
        body?: any,
        headers: Record<string, string> = {}
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                }
            };

            const req = lib.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                            // Try to parse as JSON, but fall back to raw string for plain text responses
                            let result: any;
                            if (data) {
                                try {
                                    result = JSON.parse(data);
                                } catch (parseError) {
                                    // If JSON parsing fails, return the raw string (e.g., plain JWT token)
                                    result = data;
                                }
                            } else {
                                result = {};
                            }
                            resolve(result as T);
                        } else {
                            const error: any = new Error(`HTTP ${res.statusCode}: ${data}`);
                            error.statusCode = res.statusCode;
                            reject(error);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (body) {
                req.write(JSON.stringify(body));
            }

            req.end();
        });
    }

    /**
     * Test Synergy connection
     */
    public async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const token = await this.getAccessToken();

            if (token) {
                return {
                    success: true,
                    message: 'Successfully connected to Synergy API'
                };
            }

            return {
                success: false,
                message: 'Failed to get access token'
            };
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error}`
            };
        }
    }
}
