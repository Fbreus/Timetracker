import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';

export interface Project {
    id?: number;
    name: string;
    path: string;
    category?: string;
    tags?: string[];
    created_at?: string;
    updated_at?: string;
}

export interface TimeEntry {
    id?: number;
    project_id: number;
    customer_id?: number;
    start_time: string;
    end_time?: string;
    duration?: number;
    is_manual: boolean;
    notes?: string;
    is_billable: boolean;
    task_code?: string; // Optional task/subtask identifier for grouping
    group_id?: number; // Reference to time_entry_groups
    // Legacy sync fields (will be deprecated - moved to groups)
    synergy_synced: boolean;
    synergy_sync_date?: string;
    synergy_id?: string;
    synergy_submitted?: boolean;
    synergy_submission_date?: string;
    synergy_customer_id?: string;
    synergy_project_no?: string;
    synergy_response?: string;
    created_at?: string;
    updated_at?: string;
}

export interface TimeEntryGroup {
    id?: number;
    project_id: number;
    customer_id?: number;
    entry_date: string; // Date only (YYYY-MM-DD)
    task_code?: string; // Optional task/subtask identifier
    total_duration: number; // Sum of all individual entries
    notes?: string; // Combined or summary notes
    is_billable: boolean;
    // Synergy sync fields (moved from individual entries)
    synergy_synced: boolean;
    synergy_sync_date?: string;
    synergy_id?: string;
    synergy_submitted?: boolean;
    synergy_submission_date?: string;
    synergy_customer_id?: string;
    synergy_project_no?: string;
    synergy_response?: string;
    created_at?: string;
    updated_at?: string;
}

export interface ActivityLog {
    id?: number;
    time_entry_id: number;
    activity_type: 'start' | 'pause' | 'resume' | 'stop' | 'idle_detected';
    timestamp: string;
    metadata?: string;
}

export interface DailySummary {
    id?: number;
    project_id: number;
    date: string;
    total_duration: number;
    session_count: number;
    created_at?: string;
    updated_at?: string;
}

export interface Customer {
    id?: number;
    account_id: string;
    account_name: string;
    res_id?: number;
    last_synced_at?: string;
    created_at?: string;
    updated_at?: string;
}

const DATABASE_SCHEMA = `
-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    category TEXT,
    tags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Customers table (Synergy)
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL UNIQUE,
    account_name TEXT NOT NULL,
    res_id INTEGER,
    last_synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Time entry groups table (for Synergy sync)
CREATE TABLE IF NOT EXISTS time_entry_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    customer_id INTEGER,
    entry_date DATE NOT NULL,
    task_code TEXT,
    total_duration INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    is_billable BOOLEAN DEFAULT 0,
    synergy_synced BOOLEAN DEFAULT 0,
    synergy_sync_date DATETIME,
    synergy_id TEXT,
    synergy_submitted BOOLEAN DEFAULT 0,
    synergy_submission_date DATETIME,
    synergy_customer_id TEXT,
    synergy_project_no TEXT,
    synergy_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    UNIQUE(project_id, entry_date, task_code)
);

-- Time entries table
CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    customer_id INTEGER,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration INTEGER,
    is_manual BOOLEAN DEFAULT 0,
    notes TEXT,
    is_billable BOOLEAN DEFAULT 0,
    task_code TEXT,
    group_id INTEGER,
    synergy_synced BOOLEAN DEFAULT 0,
    synergy_sync_date DATETIME,
    synergy_id TEXT,
    synergy_submitted BOOLEAN DEFAULT 0,
    synergy_submission_date DATETIME,
    synergy_customer_id TEXT,
    synergy_project_no TEXT,
    synergy_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (group_id) REFERENCES time_entry_groups(id) ON DELETE SET NULL
);

-- Activity log table
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time_entry_id INTEGER NOT NULL,
    activity_type TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    metadata TEXT,
    FOREIGN KEY (time_entry_id) REFERENCES time_entries(id) ON DELETE CASCADE
);

-- Daily summaries table
CREATE TABLE IF NOT EXISTS daily_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    date DATE NOT NULL,
    total_duration INTEGER NOT NULL,
    session_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, date)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_customer ON time_entries(customer_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_start_time ON time_entries(start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_end_time ON time_entries(end_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_group_id ON time_entries(group_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_synergy_synced ON time_entries(synergy_synced);
CREATE INDEX IF NOT EXISTS idx_time_entry_groups_project ON time_entry_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_groups_customer ON time_entry_groups(customer_id);
CREATE INDEX IF NOT EXISTS idx_time_entry_groups_date ON time_entry_groups(entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entry_groups_synced ON time_entry_groups(synergy_synced);
CREATE INDEX IF NOT EXISTS idx_time_entry_groups_submitted ON time_entry_groups(synergy_submitted);
CREATE INDEX IF NOT EXISTS idx_customers_account_id ON customers(account_id);
CREATE INDEX IF NOT EXISTS idx_customers_res_id ON customers(res_id);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_project_date ON daily_summaries(project_id, date);
CREATE INDEX IF NOT EXISTS idx_activity_log_entry ON activity_log(time_entry_id);
`;

export class TimeTrackerDatabase {
    private db: SqlJsDatabase | null = null;
    private dbPath: string;
    private initialized: boolean = false;

    constructor(storagePath: string) {
        this.dbPath = path.join(storagePath, 'timetracker.db');

        // Ensure the storage directory exists
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
    }

    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        const SQL = await initSqlJs();

        const isExistingDb = fs.existsSync(this.dbPath);

        // Try to load existing database
        if (isExistingDb) {
            const buffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(new Uint8Array(buffer));

            // Run migrations FIRST for existing databases (before applying full schema)
            this.runMigrations();
        } else {
            this.db = new SQL.Database();
        }

        // Execute schema (safe now because migrations already ran)
        this.db.run(DATABASE_SCHEMA);

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON');

        this.initialized = true;
        this.saveToFile();
    }

    private runMigrations(): void {
        if (!this.db) {
            return;
        }

        try {
            // Check if time_entries table exists
            const tables = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='time_entries'");
            if (tables.length === 0 || tables[0].values.length === 0) {
                return; // Table doesn't exist yet, skip migrations
            }

            console.log('Checking for database migrations...');

            // Get current columns in time_entries
            const tableInfo = this.db.exec("PRAGMA table_info(time_entries)");
            if (tableInfo.length === 0) {
                return;
            }

            const existingColumns = tableInfo[0].values.map(row => row[1] as string);

            // Define all required columns that should exist
            const requiredColumns = [
                { name: 'customer_id', type: 'INTEGER' },
                { name: 'task_code', type: 'TEXT' },
                { name: 'group_id', type: 'INTEGER' },
                { name: 'synergy_synced', type: 'BOOLEAN DEFAULT 0' },
                { name: 'synergy_sync_date', type: 'DATETIME' },
                { name: 'synergy_id', type: 'TEXT' },
                { name: 'synergy_submitted', type: 'BOOLEAN DEFAULT 0' },
                { name: 'synergy_submission_date', type: 'DATETIME' },
                { name: 'synergy_customer_id', type: 'TEXT' },
                { name: 'synergy_project_no', type: 'TEXT' },
                { name: 'synergy_response', type: 'TEXT' }
            ];

            // Add missing columns
            let migrationsRun = 0;
            for (const column of requiredColumns) {
                if (!existingColumns.includes(column.name)) {
                    console.log(`Migration: Adding ${column.name} column to time_entries`);
                    this.db.run(`ALTER TABLE time_entries ADD COLUMN ${column.name} ${column.type}`);
                    migrationsRun++;
                }
            }

            // Check and create customers table if it doesn't exist
            const customerTable = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='customers'");
            if (customerTable.length === 0 || customerTable[0].values.length === 0) {
                console.log('Migration: Creating customers table');
                this.db.run(`
                    CREATE TABLE customers (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        account_id TEXT NOT NULL UNIQUE,
                        account_name TEXT NOT NULL,
                        res_id INTEGER,
                        last_synced_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                migrationsRun++;
            }

            // Check and create time_entry_groups table if it doesn't exist
            const groupsTable = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='time_entry_groups'");
            if (groupsTable.length === 0 || groupsTable[0].values.length === 0) {
                console.log('Migration: Creating time_entry_groups table');
                this.db.run(`
                    CREATE TABLE time_entry_groups (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        project_id INTEGER NOT NULL,
                        customer_id INTEGER,
                        entry_date DATE NOT NULL,
                        task_code TEXT,
                        total_duration INTEGER NOT NULL DEFAULT 0,
                        notes TEXT,
                        is_billable BOOLEAN DEFAULT 0,
                        synergy_synced BOOLEAN DEFAULT 0,
                        synergy_sync_date DATETIME,
                        synergy_id TEXT,
                        synergy_submitted BOOLEAN DEFAULT 0,
                        synergy_submission_date DATETIME,
                        synergy_customer_id TEXT,
                        synergy_project_no TEXT,
                        synergy_response TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
                        UNIQUE(project_id, entry_date, task_code)
                    )
                `);

                // Create indexes for groups table
                this.db.run('CREATE INDEX IF NOT EXISTS idx_time_entry_groups_project ON time_entry_groups(project_id)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_time_entry_groups_customer ON time_entry_groups(customer_id)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_time_entry_groups_date ON time_entry_groups(entry_date)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_time_entry_groups_synced ON time_entry_groups(synergy_synced)');
                this.db.run('CREATE INDEX IF NOT EXISTS idx_time_entry_groups_submitted ON time_entry_groups(synergy_submitted)');

                migrationsRun++;
            }

            if (migrationsRun > 0) {
                console.log(`Migration completed: ${migrationsRun} changes applied`);
            } else {
                console.log('Database is up to date');
            }
        } catch (error) {
            console.error('Migration error:', error);
            // Don't throw - allow initialization to continue
        }
    }

    private saveToFile(): void {
        if (!this.db) {
            return;
        }

        const data = this.db.export();
        fs.writeFileSync(this.dbPath, data);
    }

    // Project operations
    createProject(project: Project): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run(
            'INSERT INTO projects (name, path, category, tags) VALUES (?, ?, ?, ?)',
            [project.name, project.path, project.category || null, project.tags ? JSON.stringify(project.tags) : null]
        );

        const result = this.db.exec('SELECT last_insert_rowid() as id');
        this.saveToFile();
        return result[0].values[0][0] as number;
    }

    getProjectByPath(projectPath: string): Project | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM projects WHERE path = ?', [projectPath]);

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToProject(result[0].columns, result[0].values[0]);
    }

    getProjectById(id: number): Project | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM projects WHERE id = ?', [id]);

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToProject(result[0].columns, result[0].values[0]);
    }

    getAllProjects(): Project[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM projects ORDER BY updated_at DESC');

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToProject(result[0].columns, row));
    }

    updateProject(id: number, updates: Partial<Project>): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const fields: string[] = [];
        const values: any[] = [];

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.category !== undefined) {
            fields.push('category = ?');
            values.push(updates.category);
        }
        if (updates.tags !== undefined) {
            fields.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
        }

        if (fields.length > 0) {
            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            this.db.run(
                `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
            this.saveToFile();
        }
    }

    deleteProject(id: number): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run('DELETE FROM projects WHERE id = ?', [id]);
        this.saveToFile();
    }

    // Time entry group operations
    private getOrCreateGroup(projectId: number, customerId: number | undefined, entryDate: string, taskCode: string | undefined): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Try to find existing group
        const result = this.db.exec(
            'SELECT id FROM time_entry_groups WHERE project_id = ? AND entry_date = ? AND (task_code = ? OR (task_code IS NULL AND ? IS NULL))',
            [projectId, entryDate, taskCode || null, taskCode || null]
        );

        if (result.length > 0 && result[0].values.length > 0) {
            return result[0].values[0][0] as number;
        }

        // Create new group
        this.db.run(
            `INSERT INTO time_entry_groups (project_id, customer_id, entry_date, task_code, total_duration, is_billable)
             VALUES (?, ?, ?, ?, 0, 0)`,
            [projectId, customerId || null, entryDate, taskCode || null]
        );

        const newResult = this.db.exec('SELECT last_insert_rowid() as id');
        return newResult[0].values[0][0] as number;
    }

    private recalculateGroupTotals(groupId: number): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Get all entries in this group
        const entries = this.db.exec(
            'SELECT duration, is_billable FROM time_entries WHERE group_id = ?',
            [groupId]
        );

        if (entries.length === 0 || entries[0].values.length === 0) {
            // No entries in group, delete it
            this.db.run('DELETE FROM time_entry_groups WHERE id = ?', [groupId]);
            return;
        }

        // Calculate totals
        let totalDuration = 0;
        let allBillable = true;

        entries[0].values.forEach(row => {
            const duration = row[0] as number || 0;
            const isBillable = row[1] as number;
            totalDuration += duration;
            if (!isBillable) {
                allBillable = false;
            }
        });

        // Update group
        this.db.run(
            'UPDATE time_entry_groups SET total_duration = ?, is_billable = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [totalDuration, allBillable ? 1 : 0, groupId]
        );
    }

    getTimeEntryGroup(id: number): TimeEntryGroup | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM time_entry_groups WHERE id = ?', [id]);

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToTimeEntryGroup(result[0].columns, result[0].values[0]);
    }

    getTimeEntryGroupsForDateRange(startDate: string, endDate: string): TimeEntryGroup[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM time_entry_groups WHERE entry_date >= ? AND entry_date <= ? ORDER BY entry_date, project_id',
            [startDate, endDate]
        );

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToTimeEntryGroup(result[0].columns, row));
    }

    updateTimeEntryGroup(id: number, updates: Partial<TimeEntryGroup>): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const setClauses: string[] = [];
        const values: any[] = [];

        if (updates.notes !== undefined) {
            setClauses.push('notes = ?');
            values.push(updates.notes);
        }
        if (updates.synergy_synced !== undefined) {
            setClauses.push('synergy_synced = ?');
            values.push(updates.synergy_synced ? 1 : 0);
        }
        if (updates.synergy_sync_date !== undefined) {
            setClauses.push('synergy_sync_date = ?');
            values.push(updates.synergy_sync_date);
        }
        if (updates.synergy_id !== undefined) {
            setClauses.push('synergy_id = ?');
            values.push(updates.synergy_id);
        }
        if (updates.synergy_submitted !== undefined) {
            setClauses.push('synergy_submitted = ?');
            values.push(updates.synergy_submitted ? 1 : 0);
        }
        if (updates.synergy_submission_date !== undefined) {
            setClauses.push('synergy_submission_date = ?');
            values.push(updates.synergy_submission_date);
        }
        if (updates.synergy_customer_id !== undefined) {
            setClauses.push('synergy_customer_id = ?');
            values.push(updates.synergy_customer_id);
        }
        if (updates.synergy_project_no !== undefined) {
            setClauses.push('synergy_project_no = ?');
            values.push(updates.synergy_project_no);
        }
        if (updates.synergy_response !== undefined) {
            setClauses.push('synergy_response = ?');
            values.push(updates.synergy_response);
        }

        if (setClauses.length === 0) {
            return;
        }

        setClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        this.db.run(
            `UPDATE time_entry_groups SET ${setClauses.join(', ')} WHERE id = ?`,
            values
        );

        this.saveToFile();
    }

    private rowToTimeEntryGroup(columns: string[], row: any[]): TimeEntryGroup {
        const group: any = {};
        columns.forEach((col, idx) => {
            group[col] = row[idx];
        });

        return {
            id: group.id,
            project_id: group.project_id,
            customer_id: group.customer_id,
            entry_date: group.entry_date,
            task_code: group.task_code,
            total_duration: group.total_duration,
            notes: group.notes,
            is_billable: Boolean(group.is_billable),
            synergy_synced: Boolean(group.synergy_synced),
            synergy_sync_date: group.synergy_sync_date,
            synergy_id: group.synergy_id,
            synergy_submitted: Boolean(group.synergy_submitted),
            synergy_submission_date: group.synergy_submission_date,
            synergy_customer_id: group.synergy_customer_id,
            synergy_project_no: group.synergy_project_no,
            synergy_response: group.synergy_response,
            created_at: group.created_at,
            updated_at: group.updated_at
        };
    }

    // Time entry operations
    createTimeEntry(entry: TimeEntry): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Extract date from start_time for grouping
        const entryDate = entry.start_time.split('T')[0];

        // Get or create the group for this entry
        const groupId = this.getOrCreateGroup(
            entry.project_id,
            entry.customer_id,
            entryDate,
            entry.task_code
        );

        this.db.run(
            `INSERT INTO time_entries (project_id, customer_id, start_time, end_time, duration, is_manual, notes, is_billable,
             task_code, group_id, synergy_synced, synergy_sync_date, synergy_id, synergy_submitted, synergy_submission_date,
             synergy_customer_id, synergy_project_no, synergy_response)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.project_id,
                entry.customer_id || null,
                entry.start_time,
                entry.end_time || null,
                entry.duration || null,
                entry.is_manual ? 1 : 0,
                entry.notes || null,
                entry.is_billable ? 1 : 0,
                entry.task_code || null,
                groupId,
                entry.synergy_synced ? 1 : 0,
                entry.synergy_sync_date || null,
                entry.synergy_id || null,
                entry.synergy_submitted ? 1 : 0,
                entry.synergy_submission_date || null,
                entry.synergy_customer_id || null,
                entry.synergy_project_no || null,
                entry.synergy_response || null
            ]
        );

        const result = this.db.exec('SELECT last_insert_rowid() as id');
        const entryId = result[0].values[0][0] as number;

        // Recalculate group totals
        this.recalculateGroupTotals(groupId);

        this.saveToFile();
        return entryId;
    }

    getTimeEntry(id: number): TimeEntry | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM time_entries WHERE id = ?', [id]);

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToTimeEntry(result[0].columns, result[0].values[0]);
    }

    getActiveTimeEntry(projectId: number): TimeEntry | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM time_entries WHERE project_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1',
            [projectId]
        );

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToTimeEntry(result[0].columns, result[0].values[0]);
    }

    getTimeEntryById(id: number): TimeEntry | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM time_entries WHERE id = ?',
            [id]
        );

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToTimeEntry(result[0].columns, result[0].values[0]);
    }

    getTimeEntriesForProject(projectId: number, startDate?: string, endDate?: string): TimeEntry[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        let query = 'SELECT * FROM time_entries WHERE project_id = ?';
        const params: any[] = [projectId];

        if (startDate) {
            query += ' AND start_time >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND start_time <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY start_time DESC';

        const result = this.db.exec(query, params);

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToTimeEntry(result[0].columns, row));
    }

    getAllTimeEntries(startDate?: string, endDate?: string): TimeEntry[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        let query = 'SELECT * FROM time_entries WHERE 1=1';
        const params: any[] = [];

        if (startDate) {
            query += ' AND start_time >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND start_time <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY start_time DESC';

        const result = this.db.exec(query, params);

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToTimeEntry(result[0].columns, row));
    }

    updateTimeEntry(id: number, updates: Partial<TimeEntry>): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Get current entry to know the old group
        const currentEntry = this.getTimeEntryById(id);
        if (!currentEntry) {
            throw new Error('Time entry not found');
        }
        const oldGroupId = currentEntry.group_id;

        const fields: string[] = [];
        const values: any[] = [];

        // Check if we need to change groups (project, date, or task_code changed)
        let needsRegroup = false;
        if (updates.start_time !== undefined && updates.start_time.split('T')[0] !== currentEntry.start_time.split('T')[0]) {
            needsRegroup = true;
        }
        if (updates.task_code !== undefined && updates.task_code !== currentEntry.task_code) {
            needsRegroup = true;
        }

        if (needsRegroup && updates.start_time) {
            // Create/find new group
            const entryDate = updates.start_time.split('T')[0];
            const newGroupId = this.getOrCreateGroup(
                currentEntry.project_id,
                updates.customer_id !== undefined ? updates.customer_id : currentEntry.customer_id,
                entryDate,
                updates.task_code !== undefined ? updates.task_code : currentEntry.task_code
            );
            fields.push('group_id = ?');
            values.push(newGroupId);
        }

        if (updates.customer_id !== undefined) {
            fields.push('customer_id = ?');
            values.push(updates.customer_id);
        }
        if (updates.start_time !== undefined) {
            fields.push('start_time = ?');
            values.push(updates.start_time);
        }
        if (updates.end_time !== undefined) {
            fields.push('end_time = ?');
            values.push(updates.end_time);
        }
        if (updates.duration !== undefined) {
            fields.push('duration = ?');
            values.push(updates.duration);
        }
        if (updates.notes !== undefined) {
            fields.push('notes = ?');
            values.push(updates.notes);
        }
        if (updates.is_billable !== undefined) {
            fields.push('is_billable = ?');
            values.push(updates.is_billable ? 1 : 0);
        }
        if (updates.task_code !== undefined) {
            fields.push('task_code = ?');
            values.push(updates.task_code);
        }
        if (updates.synergy_synced !== undefined) {
            fields.push('synergy_synced = ?');
            values.push(updates.synergy_synced ? 1 : 0);
        }
        if (updates.synergy_sync_date !== undefined) {
            fields.push('synergy_sync_date = ?');
            values.push(updates.synergy_sync_date);
        }
        if (updates.synergy_id !== undefined) {
            fields.push('synergy_id = ?');
            values.push(updates.synergy_id);
        }
        if (updates.synergy_submitted !== undefined) {
            fields.push('synergy_submitted = ?');
            values.push(updates.synergy_submitted ? 1 : 0);
        }
        if (updates.synergy_submission_date !== undefined) {
            fields.push('synergy_submission_date = ?');
            values.push(updates.synergy_submission_date);
        }
        if (updates.synergy_customer_id !== undefined) {
            fields.push('synergy_customer_id = ?');
            values.push(updates.synergy_customer_id);
        }
        if (updates.synergy_project_no !== undefined) {
            fields.push('synergy_project_no = ?');
            values.push(updates.synergy_project_no);
        }
        if (updates.synergy_response !== undefined) {
            fields.push('synergy_response = ?');
            values.push(updates.synergy_response);
        }

        if (fields.length > 0) {
            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            this.db.run(
                `UPDATE time_entries SET ${fields.join(', ')} WHERE id = ?`,
                values
            );

            // Recalculate old group (if it exists)
            if (oldGroupId) {
                this.recalculateGroupTotals(oldGroupId);
            }

            // If regrouped, also recalculate new group
            if (needsRegroup) {
                const updatedEntry = this.getTimeEntryById(id);
                if (updatedEntry && updatedEntry.group_id) {
                    this.recalculateGroupTotals(updatedEntry.group_id);
                }
            }

            this.saveToFile();
        }
    }

    deleteTimeEntry(id: number): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Get the entry to know which group to recalculate
        const entry = this.getTimeEntryById(id);
        const groupId = entry?.group_id;

        this.db.run('DELETE FROM time_entries WHERE id = ?', [id]);

        // Recalculate group totals (will auto-delete if no entries left)
        if (groupId) {
            this.recalculateGroupTotals(groupId);
        }

        this.saveToFile();
    }

    // Synergy sync operations
    getUnsyncedTimeEntries(): TimeEntry[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM time_entries WHERE synergy_synced = 0 AND end_time IS NOT NULL ORDER BY start_time ASC'
        );

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToTimeEntry(result[0].columns, row));
    }

    markTimeEntrySynced(id: number, synergyId?: string): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run(
            'UPDATE time_entries SET synergy_synced = 1, synergy_sync_date = CURRENT_TIMESTAMP, synergy_id = ? WHERE id = ?',
            [synergyId || null, id]
        );
        this.saveToFile();
    }

    // Activity log operations
    createActivityLog(log: ActivityLog): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run(
            'INSERT INTO activity_log (time_entry_id, activity_type, timestamp, metadata) VALUES (?, ?, ?, ?)',
            [log.time_entry_id, log.activity_type, log.timestamp, log.metadata || null]
        );

        const result = this.db.exec('SELECT last_insert_rowid() as id');
        this.saveToFile();
        return result[0].values[0][0] as number;
    }

    getActivityLogsForEntry(timeEntryId: number): ActivityLog[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM activity_log WHERE time_entry_id = ? ORDER BY timestamp ASC',
            [timeEntryId]
        );

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToActivityLog(result[0].columns, row));
    }

    // Daily summary operations
    upsertDailySummary(summary: DailySummary): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run(
            `INSERT INTO daily_summaries (project_id, date, total_duration, session_count)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(project_id, date) DO UPDATE SET
                 total_duration = total_duration + excluded.total_duration,
                 session_count = session_count + excluded.session_count,
                 updated_at = CURRENT_TIMESTAMP`,
            [summary.project_id, summary.date, summary.total_duration, summary.session_count]
        );
        this.saveToFile();
    }

    getDailySummary(projectId: number, date: string): DailySummary | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM daily_summaries WHERE project_id = ? AND date = ?',
            [projectId, date]
        );

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToDailySummary(result[0].columns, result[0].values[0]);
    }

    getDailySummariesForRange(startDate: string, endDate: string): any[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            `SELECT ds.*, p.name as project_name, p.path as project_path
             FROM daily_summaries ds
             JOIN projects p ON ds.project_id = p.id
             WHERE ds.date >= ? AND ds.date <= ?
             ORDER BY ds.date DESC, p.name ASC`,
            [startDate, endDate]
        );

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => {
            const obj: any = {};
            result[0].columns.forEach((col, i) => {
                obj[col] = row[i];
            });
            return obj;
        });
    }

    // Analytics queries
    getTotalTimeForProject(projectId: number): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT COALESCE(SUM(duration), 0) as total FROM time_entries WHERE project_id = ? AND duration IS NOT NULL',
            [projectId]
        );

        return (result[0]?.values[0]?.[0] as number) || 0;
    }

    getTotalTimeForAllProjects(): Array<{project_id: number, project_name: string, total_duration: number}> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            `SELECT p.id as project_id, p.name as project_name,
                    COALESCE(SUM(te.duration), 0) as total_duration
             FROM projects p
             LEFT JOIN time_entries te ON p.id = te.project_id
             GROUP BY p.id, p.name
             ORDER BY total_duration DESC`
        );

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => ({
            project_id: row[0] as number,
            project_name: row[1] as string,
            total_duration: row[2] as number
        }));
    }

    getTimeEntriesForDateRange(startDate: string, endDate: string): TimeEntry[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM time_entries WHERE start_time >= ? AND start_time <= ? ORDER BY start_time DESC',
            [startDate, endDate]
        );

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToTimeEntry(result[0].columns, row));
    }

    // Settings operations
    setSetting(key: string, value: string): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run(
            `INSERT INTO settings (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
            [key, value]
        );
        this.saveToFile();
    }

    getSetting(key: string): string | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT value FROM settings WHERE key = ?', [key]);

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return result[0].values[0][0] as string;
    }

    // Synergy-specific queries
    getUnsubmittedTimeEntries(): TimeEntry[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec(
            'SELECT * FROM time_entries WHERE synergy_submitted = 0 AND end_time IS NOT NULL AND duration IS NOT NULL ORDER BY start_time DESC'
        );

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToTimeEntry(result[0].columns, row));
    }

    markSynergySubmitted(entryId: number, customerId: string, projectNo: string, response?: string): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run(
            `UPDATE time_entries SET
                synergy_submitted = 1,
                synergy_submission_date = CURRENT_TIMESTAMP,
                synergy_customer_id = ?,
                synergy_project_no = ?,
                synergy_response = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
            [customerId, projectNo, response || null, entryId]
        );
        this.saveToFile();
    }

    // Customer operations
    createCustomer(customer: Customer): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run(
            'INSERT INTO customers (account_id, account_name, res_id, last_synced_at) VALUES (?, ?, ?, ?)',
            [customer.account_id, customer.account_name, customer.res_id || null, customer.last_synced_at || new Date().toISOString()]
        );

        const result = this.db.exec('SELECT last_insert_rowid() as id');
        this.saveToFile();
        return result[0].values[0][0] as number;
    }

    upsertCustomer(customer: Customer): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        // Check if customer exists
        const existing = this.getCustomerByAccountId(customer.account_id);

        if (existing) {
            // Update existing customer
            this.db.run(
                'UPDATE customers SET account_name = ?, res_id = ?, last_synced_at = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
                [customer.account_name, customer.res_id || null, new Date().toISOString(), customer.account_id]
            );
            this.saveToFile();
            return existing.id!;
        } else {
            // Create new customer
            return this.createCustomer(customer);
        }
    }

    getCustomerById(id: number): Customer | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM customers WHERE id = ?', [id]);

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToCustomer(result[0].columns, result[0].values[0]);
    }

    getCustomerByAccountId(accountId: string): Customer | undefined {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM customers WHERE account_id = ?', [accountId]);

        if (result.length === 0 || result[0].values.length === 0) {
            return undefined;
        }

        return this.rowToCustomer(result[0].columns, result[0].values[0]);
    }

    getAllCustomers(): Customer[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM customers ORDER BY account_name ASC');

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToCustomer(result[0].columns, row));
    }

    getCustomersByResId(resId: number): Customer[] {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const result = this.db.exec('SELECT * FROM customers WHERE res_id = ? ORDER BY account_name ASC', [resId]);

        if (result.length === 0) {
            return [];
        }

        return result[0].values.map(row => this.rowToCustomer(result[0].columns, row));
    }

    updateCustomer(id: number, updates: Partial<Customer>): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const fields: string[] = [];
        const values: any[] = [];

        if (updates.account_name !== undefined) {
            fields.push('account_name = ?');
            values.push(updates.account_name);
        }
        if (updates.res_id !== undefined) {
            fields.push('res_id = ?');
            values.push(updates.res_id);
        }
        if (updates.last_synced_at !== undefined) {
            fields.push('last_synced_at = ?');
            values.push(updates.last_synced_at);
        }

        if (fields.length > 0) {
            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            this.db.run(
                `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
            this.saveToFile();
        }
    }

    deleteCustomer(id: number): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        this.db.run('DELETE FROM customers WHERE id = ?', [id]);
        this.saveToFile();
    }

    // Sync customers from Synergy API
    syncCustomers(customers: Array<{account_id: string, account_name: string}>, resId?: number): number {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        let syncedCount = 0;
        const syncTime = new Date().toISOString();

        for (const customer of customers) {
            this.upsertCustomer({
                account_id: customer.account_id,
                account_name: customer.account_name,
                res_id: resId,
                last_synced_at: syncTime
            });
            syncedCount++;
        }

        return syncedCount;
    }

    // Data cleanup
    cleanupOldData(retentionDays: number): void {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        if (retentionDays > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffStr = cutoffDate.toISOString();

            this.db.run('DELETE FROM time_entries WHERE start_time < ?', [cutoffStr]);
            this.saveToFile();
        }
    }

    // Close database connection
    close(): void {
        if (this.db) {
            this.saveToFile();
            this.db.close();
            this.db = null;
            this.initialized = false;
        }
    }

    // Get database path
    getDbPath(): string {
        return this.dbPath;
    }

    // Helper methods to convert rows to objects
    private rowToProject(columns: string[], row: any[]): Project {
        const obj: any = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });

        if (obj.tags) {
            obj.tags = JSON.parse(obj.tags);
        }

        return obj as Project;
    }

    private rowToTimeEntry(columns: string[], row: any[]): TimeEntry {
        const obj: any = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });

        obj.is_manual = Boolean(obj.is_manual);
        obj.is_billable = Boolean(obj.is_billable);
        obj.synergy_synced = Boolean(obj.synergy_synced);
        obj.synergy_submitted = Boolean(obj.synergy_submitted);

        return obj as TimeEntry;
    }

    private rowToActivityLog(columns: string[], row: any[]): ActivityLog {
        const obj: any = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });

        return obj as ActivityLog;
    }

    private rowToDailySummary(columns: string[], row: any[]): DailySummary {
        const obj: any = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });

        return obj as DailySummary;
    }

    private rowToCustomer(columns: string[], row: any[]): Customer {
        const obj: any = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });

        return obj as Customer;
    }
}
