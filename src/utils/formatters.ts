export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

export function formatDurationShort(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

export function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(date: Date): string {
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(date: Date): string {
    return `${formatDate(date)} ${formatTime(date)}`;
}

export function parseTimeString(timeStr: string): Date | null {
    // Parse time strings like "14:30" or "2:30 PM"
    const time = new Date();

    // Try 24-hour format first (HH:MM)
    const match24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (match24) {
        const hours = parseInt(match24[1], 10);
        const minutes = parseInt(match24[2], 10);

        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            time.setHours(hours, minutes, 0, 0);
            return time;
        }
    }

    // Try 12-hour format (H:MM AM/PM)
    const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match12) {
        let hours = parseInt(match12[1], 10);
        const minutes = parseInt(match12[2], 10);
        const period = match12[3].toUpperCase();

        if (period === 'PM' && hours < 12) {
            hours += 12;
        } else if (period === 'AM' && hours === 12) {
            hours = 0;
        }

        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            time.setHours(hours, minutes, 0, 0);
            return time;
        }
    }

    return null;
}
