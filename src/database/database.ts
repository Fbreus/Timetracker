import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';

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
    start_time: string;
    end_time?: string;
    duration?: number;
    is_manual: boolean;
    notes?: string;
    is_billable: boolean;
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

-- Time entries table
CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    duration INTEGER,
    is_manual BOOLEAN DEFAULT 0,
    notes TEXT,
    is_billable BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_time_entries_start_time ON time_entries(start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_end_time ON time_entries(end_time);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_project_date ON daily_summaries(project_id, date);
CREATE INDEX IF NOT EXISTS idx_activity_log_entry ON activity_log(time_entry_id);
`;

export class TimeTrackerDatabase {
    private db: Database.Database;
    private dbPath: string;

    constructor(storagePath: string) {
        // Ensure the storage directory exists
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }

        this.dbPath = path.join(storagePath, 'timetracker.db');
        this.db = new Database(this.dbPath);
        this.initialize();
    }

    private initialize(): void {
        // Execute schema statements
        this.db.exec(DATABASE_SCHEMA);

        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');
    }

    // Project operations
    createProject(project: Project): number {
        const stmt = this.db.prepare(`
            INSERT INTO projects (name, path, category, tags)
            VALUES (?, ?, ?, ?)
        `);

        const info = stmt.run(
            project.name,
            project.path,
            project.category || null,
            project.tags ? JSON.stringify(project.tags) : null
        );

        return info.lastInsertRowid as number;
    }

    getProjectByPath(projectPath: string): Project | undefined {
        const stmt = this.db.prepare('SELECT * FROM projects WHERE path = ?');
        const row = stmt.get(projectPath) as any;

        if (row && row.tags) {
            row.tags = JSON.parse(row.tags);
        }

        return row;
    }

    getProjectById(id: number): Project | undefined {
        const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
        const row = stmt.get(id) as any;

        if (row && row.tags) {
            row.tags = JSON.parse(row.tags);
        }

        return row;
    }

    getAllProjects(): Project[] {
        const stmt = this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC');
        const rows = stmt.all() as any[];

        return rows.map(row => {
            if (row.tags) {
                row.tags = JSON.parse(row.tags);
            }
            return row;
        });
    }

    updateProject(id: number, updates: Partial<Project>): void {
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

            const stmt = this.db.prepare(`
                UPDATE projects SET ${fields.join(', ')} WHERE id = ?
            `);
            stmt.run(...values);
        }
    }

    deleteProject(id: number): void {
        const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
        stmt.run(id);
    }

    // Time entry operations
    createTimeEntry(entry: TimeEntry): number {
        const stmt = this.db.prepare(`
            INSERT INTO time_entries (project_id, start_time, end_time, duration, is_manual, notes, is_billable)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const info = stmt.run(
            entry.project_id,
            entry.start_time,
            entry.end_time || null,
            entry.duration || null,
            entry.is_manual ? 1 : 0,
            entry.notes || null,
            entry.is_billable ? 1 : 0
        );

        return info.lastInsertRowid as number;
    }

    getTimeEntry(id: number): TimeEntry | undefined {
        const stmt = this.db.prepare('SELECT * FROM time_entries WHERE id = ?');
        return stmt.get(id) as TimeEntry;
    }

    getActiveTimeEntry(projectId: number): TimeEntry | undefined {
        const stmt = this.db.prepare(`
            SELECT * FROM time_entries
            WHERE project_id = ? AND end_time IS NULL
            ORDER BY start_time DESC LIMIT 1
        `);
        return stmt.get(projectId) as TimeEntry;
    }

    getTimeEntriesForProject(projectId: number, startDate?: string, endDate?: string): TimeEntry[] {
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

        const stmt = this.db.prepare(query);
        return stmt.all(...params) as TimeEntry[];
    }

    getAllTimeEntries(startDate?: string, endDate?: string): TimeEntry[] {
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

        const stmt = this.db.prepare(query);
        return stmt.all(...params) as TimeEntry[];
    }

    updateTimeEntry(id: number, updates: Partial<TimeEntry>): void {
        const fields: string[] = [];
        const values: any[] = [];

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

        if (fields.length > 0) {
            fields.push('updated_at = CURRENT_TIMESTAMP');
            values.push(id);

            const stmt = this.db.prepare(`
                UPDATE time_entries SET ${fields.join(', ')} WHERE id = ?
            `);
            stmt.run(...values);
        }
    }

    deleteTimeEntry(id: number): void {
        const stmt = this.db.prepare('DELETE FROM time_entries WHERE id = ?');
        stmt.run(id);
    }

    // Activity log operations
    createActivityLog(log: ActivityLog): number {
        const stmt = this.db.prepare(`
            INSERT INTO activity_log (time_entry_id, activity_type, timestamp, metadata)
            VALUES (?, ?, ?, ?)
        `);

        const info = stmt.run(
            log.time_entry_id,
            log.activity_type,
            log.timestamp,
            log.metadata || null
        );

        return info.lastInsertRowid as number;
    }

    getActivityLogsForEntry(timeEntryId: number): ActivityLog[] {
        const stmt = this.db.prepare(`
            SELECT * FROM activity_log
            WHERE time_entry_id = ?
            ORDER BY timestamp ASC
        `);
        return stmt.all(timeEntryId) as ActivityLog[];
    }

    // Daily summary operations
    upsertDailySummary(summary: DailySummary): void {
        const stmt = this.db.prepare(`
            INSERT INTO daily_summaries (project_id, date, total_duration, session_count)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(project_id, date) DO UPDATE SET
                total_duration = total_duration + excluded.total_duration,
                session_count = session_count + excluded.session_count,
                updated_at = CURRENT_TIMESTAMP
        `);

        stmt.run(summary.project_id, summary.date, summary.total_duration, summary.session_count);
    }

    getDailySummary(projectId: number, date: string): DailySummary | undefined {
        const stmt = this.db.prepare(`
            SELECT * FROM daily_summaries
            WHERE project_id = ? AND date = ?
        `);
        return stmt.get(projectId, date) as DailySummary;
    }

    getDailySummariesForRange(startDate: string, endDate: string): DailySummary[] {
        const stmt = this.db.prepare(`
            SELECT ds.*, p.name as project_name, p.path as project_path
            FROM daily_summaries ds
            JOIN projects p ON ds.project_id = p.id
            WHERE ds.date >= ? AND ds.date <= ?
            ORDER BY ds.date DESC, p.name ASC
        `);
        return stmt.all(startDate, endDate) as any[];
    }

    // Analytics queries
    getTotalTimeForProject(projectId: number): number {
        const stmt = this.db.prepare(`
            SELECT COALESCE(SUM(duration), 0) as total
            FROM time_entries
            WHERE project_id = ? AND duration IS NOT NULL
        `);
        const result = stmt.get(projectId) as any;
        return result.total;
    }

    getTotalTimeForAllProjects(): Array<{project_id: number, project_name: string, total_duration: number}> {
        const stmt = this.db.prepare(`
            SELECT p.id as project_id, p.name as project_name,
                   COALESCE(SUM(te.duration), 0) as total_duration
            FROM projects p
            LEFT JOIN time_entries te ON p.id = te.project_id
            GROUP BY p.id, p.name
            ORDER BY total_duration DESC
        `);
        return stmt.all() as any[];
    }

    getTimeEntriesForDateRange(startDate: string, endDate: string): TimeEntry[] {
        const stmt = this.db.prepare(`
            SELECT * FROM time_entries
            WHERE start_time >= ? AND start_time <= ?
            ORDER BY start_time DESC
        `);
        return stmt.all(startDate, endDate) as TimeEntry[];
    }

    // Settings operations
    setSetting(key: string, value: string): void {
        const stmt = this.db.prepare(`
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `);
        stmt.run(key, value);
    }

    getSetting(key: string): string | undefined {
        const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
        const result = stmt.get(key) as any;
        return result?.value;
    }

    // Data cleanup
    cleanupOldData(retentionDays: number): void {
        if (retentionDays > 0) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
            const cutoffStr = cutoffDate.toISOString();

            const stmt = this.db.prepare('DELETE FROM time_entries WHERE start_time < ?');
            stmt.run(cutoffStr);
        }
    }

    // Close database connection
    close(): void {
        this.db.close();
    }

    // Get database path
    getDbPath(): string {
        return this.dbPath;
    }
}
