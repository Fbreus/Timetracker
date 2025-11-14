import axios, { AxiosError } from 'axios';

/**
 * Interface for Synergy project data as returned from Power Automate
 */
export interface SynergyProject {
    ProjectNr: string;
    ProjectCustomerID: string | null;
    ProjectCustomerName: string;
    ProjectDescription: string | null;
}

/**
 * Interface for Power Automate projects response
 */
interface PowerAutomateProjectsResponse {
    ResultSets: {
        Table1: SynergyProject[];
    };
}

/**
 * Interface for Power Automate ResID response
 */
interface PowerAutomateResIdResponse {
    ResID?: string;
    [key: string]: any;
}

/**
 * Configuration for Synergy API
 */
export interface SynergyApiConfig {
    projectsEndpointUrl: string;
    resIdEndpointUrl: string;
    employeeId?: string;
    email?: string;
}

/**
 * Service for interacting with Synergy via Power Automate
 */
export class SynergyApiService {
    private config: SynergyApiConfig;
    private cachedResId?: string;

    constructor(config: SynergyApiConfig) {
        this.config = config;
    }

    /**
     * Fetches ResID (employee ID) from email address
     * @param email Email address to look up
     * @returns The ResID for the given email
     * @throws Error if the API call fails
     */
    async getResIdFromEmail(email: string): Promise<string> {
        try {
            const response = await axios.post<PowerAutomateResIdResponse>(
                this.config.resIdEndpointUrl,
                {
                    email: email
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                }
            );

            const resId = response.data?.ResID;
            if (!resId) {
                throw new Error('ResID not found in response');
            }

            // Cache the ResID
            this.cachedResId = resId;
            return resId;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.response) {
                    throw new Error(
                        `Failed to fetch ResID from email: ${axiosError.response.status} ${axiosError.response.statusText}`
                    );
                } else if (axiosError.request) {
                    throw new Error(
                        'Failed to fetch ResID: No response received from server'
                    );
                } else {
                    throw new Error(
                        `Failed to fetch ResID: ${axiosError.message}`
                    );
                }
            }
            throw error;
        }
    }

    /**
     * Fetches projects for a given ResID from Synergy
     * @param resId Employee ResID (optional if already cached)
     * @returns Array of Synergy projects
     * @throws Error if the API call fails
     */
    async getProjectsByResId(resId?: string): Promise<SynergyProject[]> {
        const employeeId = resId || this.cachedResId || this.config.employeeId;

        if (!employeeId) {
            throw new Error('No ResID available. Call getResIdFromEmail first or provide employeeId in config.');
        }

        try {
            const response = await axios.post<PowerAutomateProjectsResponse>(
                this.config.projectsEndpointUrl,
                {
                    ResID: employeeId
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                }
            );

            // Extract projects from the response
            const projects = response.data?.ResultSets?.Table1 || [];
            return projects;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const axiosError = error as AxiosError;
                if (axiosError.response) {
                    throw new Error(
                        `Failed to fetch projects from Synergy: ${axiosError.response.status} ${axiosError.response.statusText}`
                    );
                } else if (axiosError.request) {
                    throw new Error(
                        'Failed to fetch projects from Synergy: No response received from server'
                    );
                } else {
                    throw new Error(
                        `Failed to fetch projects from Synergy: ${axiosError.message}`
                    );
                }
            }
            throw error;
        }
    }

    /**
     * Fetches projects using email (convenience method that combines both calls)
     * @param email Email address to look up (optional if provided in config)
     * @returns Array of Synergy projects
     * @throws Error if the API call fails
     */
    async getProjectsByEmail(email?: string): Promise<SynergyProject[]> {
        const userEmail = email || this.config.email;

        if (!userEmail) {
            throw new Error('No email provided. Provide email parameter or in config.');
        }

        // First, get ResID from email
        const resId = await this.getResIdFromEmail(userEmail);

        // Then fetch projects using ResID
        return await this.getProjectsByResId(resId);
    }

    /**
     * Updates the employee ID
     * @param employeeId New employee ID
     */
    updateEmployeeId(employeeId: string): void {
        this.config.employeeId = employeeId;
        this.cachedResId = employeeId;
    }

    /**
     * Updates the email address
     * @param email New email address
     */
    updateEmail(email: string): void {
        this.config.email = email;
    }
}

/**
 * Default Power Automate endpoint URLs
 */
export const DEFAULT_SYNERGY_PROJECTS_ENDPOINT =
    'https://default8e426d61a69d49278a3fef2f62da7f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/22875bb4fbe842878aa259258da3282e/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=AstmvDgfeuxKoNh5UUeRpqScE6wvhwBE17W6tGDucWs';

export const DEFAULT_SYNERGY_RESID_ENDPOINT =
    'https://default8e426d61a69d49278a3fef2f62da7f.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/2a6aeb0a4dd04785a7e49d8a03702975/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=dvAvMPws4G4Dm846yzL8Akkp0GboBOlsifL19VT6s7w';
