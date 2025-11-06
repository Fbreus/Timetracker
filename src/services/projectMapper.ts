import { Project } from '../database/database';
import { SynergyProject } from './synergyApi';

/**
 * Maps Synergy project data to local database project format
 */
export class ProjectMapper {
    /**
     * Converts a Synergy project to a local database project
     * Note: The path will be set to a unique identifier based on ProjectNr
     * since Synergy projects don't have file system paths
     *
     * @param synergyProject Synergy project from Power Automate
     * @returns Local database project format
     */
    static synergyToLocal(synergyProject: SynergyProject): Omit<Project, 'id' | 'created_at' | 'updated_at'> {
        // Create a descriptive name combining customer and project number
        const customerPrefix = synergyProject.ProjectCustomerName ?
            `${synergyProject.ProjectCustomerName} - ` : '';
        const name = `${customerPrefix}${synergyProject.ProjectNr}`;

        // Use ProjectNr as a unique path identifier (prefixed to avoid conflicts)
        const path = `synergy://${synergyProject.ProjectNr}`;

        // Use customer name as category if available
        const category = synergyProject.ProjectCustomerName || 'Synergy Projects';

        // Create tags from available metadata
        const tags: string[] = ['synergy'];
        if (synergyProject.ProjectCustomerID) {
            tags.push(`customer:${synergyProject.ProjectCustomerID}`);
        }
        if (synergyProject.ProjectDescription) {
            tags.push('has-description');
        }

        return {
            name,
            path,
            category,
            tags
        };
    }

    /**
     * Converts multiple Synergy projects to local database format
     *
     * @param synergyProjects Array of Synergy projects
     * @returns Array of local database projects
     */
    static synergyArrayToLocal(
        synergyProjects: SynergyProject[]
    ): Array<Omit<Project, 'id' | 'created_at' | 'updated_at'>> {
        return synergyProjects.map(project => this.synergyToLocal(project));
    }

    /**
     * Extracts Synergy project metadata from a local project
     * Returns null if the project is not a Synergy project
     *
     * @param localProject Local database project
     * @returns Extracted metadata or null
     */
    static extractSynergyMetadata(localProject: Project): {
        projectNr: string;
        customerId?: string;
    } | null {
        // Check if this is a Synergy project by path prefix
        if (!localProject.path.startsWith('synergy://')) {
            return null;
        }

        // Extract ProjectNr from path
        const projectNr = localProject.path.replace('synergy://', '');

        // Extract customer ID from tags if present
        const customerIdTag = localProject.tags?.find(tag => tag.startsWith('customer:'));
        const customerId = customerIdTag ? customerIdTag.replace('customer:', '') : undefined;

        return {
            projectNr,
            customerId
        };
    }

    /**
     * Checks if a local project is a Synergy project
     *
     * @param localProject Local database project
     * @returns True if the project is from Synergy
     */
    static isSynergyProject(localProject: Project): boolean {
        return localProject.path.startsWith('synergy://');
    }
}
