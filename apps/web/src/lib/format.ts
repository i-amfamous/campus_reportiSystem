export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return 'Not set';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return 'Not set';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return 'Not set';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Not set';
  const diffMs = date.getTime() - Date.now();
  const absolute = Math.abs(diffMs);
  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60_000, 'minute'],
    [3_600_000, 'hour'],
    [86_400_000, 'day'],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (absolute < 60_000) return 'just now';
  for (let index = 0; index < units.length; index += 1) {
    const [threshold, unit] = units[index]!;
    const next = units[index + 1];
    if (!next || absolute < next[0]) {
      return formatter.format(Math.round(diffMs / threshold), unit);
    }
  }
  return formatter.format(Math.round(diffMs / 86_400_000), 'day');
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'Not set';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compact, human duration for service targets and averages: 45m, 8h, 4h 17m, 2d 1h. */
export function formatMinutesAsDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}
