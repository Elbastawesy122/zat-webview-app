import { getHttpHost, getScheme } from './navigationPolicy';

const DEFAULT_WEB_URL = 'https://zat-ksa.com/';

// EXPO_PUBLIC_* values are inlined into the JS bundle at build time, so they must never
// hold secrets. Expo only inlines direct `process.env.EXPO_PUBLIC_*` member access.
const rawWebUrl: string = process.env.EXPO_PUBLIC_WEB_URL?.trim() || DEFAULT_WEB_URL;
const rawAllowedHosts: string = process.env.EXPO_PUBLIC_ALLOWED_HOSTS?.trim() ?? '';

function resolveWebUrl(url: string): string {
  if (getScheme(url) !== 'https' || !getHttpHost(url)) {
    throw new Error(`EXPO_PUBLIC_WEB_URL must be a valid https:// URL (got "${url}")`);
  }
  return url;
}

export const WEB_URL = resolveWebUrl(rawWebUrl);

const webHost = getHttpHost(WEB_URL) as string;

// Subdomains of each entry are allowed too, so "zat-ksa.com" also covers "www.zat-ksa.com".
export const ALLOWED_HOSTS: readonly string[] = rawAllowedHosts
  ? rawAllowedHosts
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  : [webHost.replace(/^www\./, '')];
