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

export function parseDurationString(durationStr: string): number {
    // Parse duration strings like "2h 30m", "1.5h", "90m", "2h", etc.
    // Returns duration in seconds

    const input = durationStr.trim().toLowerCase();
    let totalSeconds = 0;

    // Try decimal hours format first (e.g., "1.5h" or "1.5")
    const decimalHoursMatch = input.match(/^(\d+\.?\d*)\s*h?$/);
    if (decimalHoursMatch) {
        const hours = parseFloat(decimalHoursMatch[1]);
        return Math.round(hours * 3600);
    }

    // Try minutes only format (e.g., "90m" or "90")
    const minutesMatch = input.match(/^(\d+)\s*m$/);
    if (minutesMatch) {
        const minutes = parseInt(minutesMatch[1], 10);
        return minutes * 60;
    }

    // Try compound format (e.g., "2h 30m", "1h30m", "2h 30m 15s")
    const hoursMatch = input.match(/(\d+)\s*h/);
    const minsMatch = input.match(/(\d+)\s*m/);
    const secsMatch = input.match(/(\d+)\s*s/);

    if (hoursMatch || minsMatch || secsMatch) {
        if (hoursMatch) {
            totalSeconds += parseInt(hoursMatch[1], 10) * 3600;
        }
        if (minsMatch) {
            totalSeconds += parseInt(minsMatch[1], 10) * 60;
        }
        if (secsMatch) {
            totalSeconds += parseInt(secsMatch[1], 10);
        }
        return totalSeconds;
    }

    // If no format matched, throw an error
    throw new Error('Invalid duration format. Use formats like: 2h 30m, 1.5h, or 90m');
}
