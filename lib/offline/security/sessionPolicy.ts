export const OFFLINE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const APP_LOCK_GRACE_MS = 2 * 60 * 1000;

export function isOfflineSessionValid(
  lastOnlineVerifiedAt: number | null,
  now = Date.now(),
  ttlMs = OFFLINE_SESSION_TTL_MS
): boolean {
  if (!lastOnlineVerifiedAt || lastOnlineVerifiedAt <= 0) return false;
  return now - lastOnlineVerifiedAt <= ttlMs;
}

export function shouldLockApp(
  lastBackgroundAt: number | null,
  now = Date.now(),
  graceMs = APP_LOCK_GRACE_MS
): boolean {
  if (!lastBackgroundAt) return false;
  return now - lastBackgroundAt >= graceMs;
}

export function isNetworkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : String(error || '');
  return /network|fetch|failed to connect|internet|offline|timeout|timed out|network request failed/i.test(
    message
  );
}
