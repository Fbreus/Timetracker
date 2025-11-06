/**
 * Synergy API Type Definitions
 */

export interface SynergyTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    userName: string;
    '.issued': string;
    '.expires': string;
}

export interface SynergyAuthConfig {
    apiUrl: string;
    username: string;
    password: string;
}

export interface SynergyTimeRegistration {
    // Define the structure based on Synergy API requirements
    // This is a placeholder - adjust according to actual API
    projectId?: string;
    description?: string;
    startTime: string;
    endTime: string;
    duration: number; // in minutes or hours, depending on API
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
