/**
 * Synergy PSA API Types
 * Comprehensive type definitions for both direct API and Azure Logic App integration
 */

// Azure Logic App / PSA Types
export interface SynergyRequestBody {
    Activity: 'CONSULTANCY' | 'DEVELOPMENT';
    CustomerID: string;
    Date: string; // ISO date string
    Description: string;
    ExternalRemarks?: string;
    Hours: number;
    HoursRealized: number;
    InternalRemarks?: string;
    Project: string;
    ResourceID: number;
}

export interface SynergyTokenResponse {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    userName?: string;
    '.issued'?: string;
    '.expires'?: string;
    body?: string; // Bearer token from Azure Logic App
    statusCode?: number;
    headers?: Record<string, string>;
}

export interface SynergyApiResponse {
    success: boolean;
    statusCode?: number;
    error?: string;
    data?: any;
}

export interface SynergyCustomer {
    AccountID: string;
    AccountName: string;
}

export interface SynergyProject {
    ProjectNo: string;
    CustomerID: string;
    ProjectName: string;
}

export interface WinterHourCheckRequest {
    Date: string;
}

export interface WinterHourCheckResponse {
    IsWinterHour: 'True' | 'False';
}

// Direct API Types
export interface SynergyAuthConfig {
    apiUrl: string;
    username: string;
    password: string;
}

export interface SynergyTimeRegistration {
    projectId?: string;
    description?: string;
    startTime: string;
    endTime: string;
    duration: number;
    notes?: string;
}

export interface SynergyRegistrationResponse {
    success: boolean;
    id?: string;
    message?: string;
    error?: string;
}

export interface SynergySyncResult {
    success: boolean;
    entriesProcessed: number;
    entriesSynced: number;
    entriesFailed: number;
    errors: Array<{
        entryId: number;
        error: string;
    }>;
}

// Configuration
export interface SynergyConfig {
    enabled: boolean;
    // Azure Logic App endpoints
    apiEndpoint: string;
    tokenEndpoint: string;
    winterHourCheckEndpoint: string;
    customersEndpoint: string;
    projectsEndpoint: string;
    defaultCustomerId: string;
    defaultProject: string;
    defaultActivity: 'CONSULTANCY' | 'DEVELOPMENT';
    resourceId?: number;
    // Direct API configuration
    apiUrl?: string;
    username?: string;
    password?: string;
    autoSync?: boolean;
}

export const DEFAULT_SYNERGY_CONFIG: SynergyConfig = {
    enabled: false,
    apiEndpoint: 'https://synergy.esc.be/TopDeskAPI_CRM/api/Request',
    tokenEndpoint: 'https://handleteamscallrecordwebhook.azurewebsites.net:443/api/ReturnSynergyAccesToken/triggers/manual/invoke?api-version=2020-05-01-preview&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=vmB_g4-6eXhhbn_C6sfBonXqWnZVWtozUEM1e1JFtyI',
    winterHourCheckEndpoint: 'https://handleteamscallrecordwebhook.azurewebsites.net:443/api/CalculateWinterHourIsNeeded/triggers/manual/invoke?api-version=2022-05-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gpHmI_AuviEbhpI9SgcotY0Fp56RHcTWYJh67Z102qA',
    customersEndpoint: 'https://handleteamscallrecordwebhook.azurewebsites.net:443/api/ReturnSynergyCustomers/triggers/manual/invoke?api-version=2020-05-01-preview&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=dZTOockMmIM-4Wj8AYzNO9iwIOFDjJK7BYB4VihJ6Bc',
    projectsEndpoint: 'https://handleteamscallrecordwebhook.azurewebsites.net:443/api/ReturnSynergyProjects/triggers/manual/invoke?api-version=2022-05-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=OZxUzs96HCgkFcM9wuA_sVOAQBEA23TQBZWK3as9xro',
    defaultCustomerId: '15afd034-ce8a-449c-af83-b169db07fbcd',
    defaultProject: 'ESC-TEAMS-CALL',
    defaultActivity: 'CONSULTANCY',
    apiUrl: 'https://synergy.esc.be/TopDeskAPI_CRM',
    autoSync: false
};
