/**
 * Validates an internal redirect query parameter to prevent open-redirect attacks.
 * Only relative in-app paths starting with a single `/` are accepted.
 */
export function getSafeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    /[\r\n]/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}
