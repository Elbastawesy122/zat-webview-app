// Pure, dependency-free so it can be unit-tested with `node --test`.
// React Native's URL polyfill is regex-based and parses `\` and `@` differently
// from WebKit/Chromium, so we parse strictly ourselves and reject anything ambiguous.

export type NavigationDecision = 'allow' | 'external' | 'block';

export interface NavigationRequest {
  url: string;
  // iOS reports iframe navigations through onShouldStartLoadWithRequest too; Android
  // only reports main-frame ones and omits this flag, so `undefined` means top frame.
  isTopFrame?: boolean;
}

// Schemes an iframe inside an allowed page may load (reCAPTCHA, payment widgets, embeds).
const SUBFRAME_SCHEMES = new Set(['https', 'about', 'blob', 'data']);

// Schemes the OS may open in another app when the main frame tries to leave the site.
const EXTERNAL_SCHEMES = new Set(['https', 'http', 'mailto', 'tel', 'sms', 'whatsapp']);

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z\d+.-]*):/;
const HOST_PATTERN = /^[a-z\d.-]+$/;

export function getScheme(url: string): string | null {
  const match = SCHEME_PATTERN.exec(url);
  return match ? match[1].toLowerCase() : null;
}

// Returns null for URLs whose authority is ambiguous (userinfo, backslashes, odd characters).
export function getHttpHost(url: string): string | null {
  const match = /^https?:\/\/([^/?#]*)/i.exec(url);
  if (!match) return null;
  const authority = match[1];
  if (authority.includes('@') || authority.includes('\\')) return null;
  const host = authority.replace(/:\d+$/, '').toLowerCase();
  return host && HOST_PATTERN.test(host) ? host : null;
}

export function isAllowedHost(host: string, allowedHosts: readonly string[]): boolean {
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function decideNavigation(
  { url, isTopFrame }: NavigationRequest,
  allowedHosts: readonly string[],
): NavigationDecision {
  const scheme = getScheme(url);
  if (!scheme) return 'block';
  if (scheme === 'about') return 'allow';

  if (isTopFrame === false) {
    return SUBFRAME_SCHEMES.has(scheme) ? 'allow' : 'block';
  }

  if (scheme === 'https') {
    const host = getHttpHost(url);
    if (!host) return 'block';
    return isAllowedHost(host, allowedHosts) ? 'allow' : 'external';
  }

  if (scheme === 'http') {
    return getHttpHost(url) ? 'external' : 'block';
  }

  return EXTERNAL_SCHEMES.has(scheme) ? 'external' : 'block';
}
