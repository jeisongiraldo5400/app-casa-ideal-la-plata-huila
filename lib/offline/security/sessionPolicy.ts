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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message || '');
  }
  return String(error || '');
}

export function isNetworkError(error: unknown): boolean {
  return /network|fetch|failed to connect|internet|offline|timeout|timed out|network request failed/i.test(
    getErrorMessage(error)
  );
}

export function isAuthSessionMissingError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  return name === 'AuthSessionMissingError' || /auth session missing/i.test(getErrorMessage(error));
}

export function isInvalidRefreshTokenError(error: unknown): boolean {
  return /refresh token|invalid refresh token/i.test(getErrorMessage(error));
}

export function shouldKeepLocalSession(input: {
  error: unknown;
  hasStoredSession: boolean;
  lastOnlineVerifiedAt: number | null;
  now?: number;
}): boolean {
  if (!input.hasStoredSession) return false;
  if (isAuthSessionMissingError(input.error)) return false;
  if (isInvalidRefreshTokenError(input.error)) return false;
  if (!isNetworkError(input.error)) return false;
  return isOfflineSessionValid(input.lastOnlineVerifiedAt, input.now);
}
