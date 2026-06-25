export type CopilotMetricsReportKind =
  | 'enterprise-28-day-latest'
  | 'enterprise-1-day'
  | 'users-28-day-latest'
  | 'users-1-day';

export interface CopilotMetricsReportLinks {
  downloadLinks: string[];
  reportDay?: string;
  reportStartDay?: string;
  reportEndDay?: string;
}

export interface CopilotMetricsRequest {
  enterpriseSlug: string;
  kind: CopilotMetricsReportKind;
  day?: string;
}

interface GitHubReportResponse {
  download_links?: unknown;
  report_day?: unknown;
  report_start_day?: unknown;
  report_end_day?: unknown;
}

const KIND_TO_PATH: Record<CopilotMetricsReportKind, string> = {
  'enterprise-28-day-latest': 'enterprise-28-day/latest',
  'enterprise-1-day': 'enterprise-1-day',
  'users-28-day-latest': 'users-28-day/latest',
  'users-1-day': 'users-1-day',
};

export function normalizeEnterpriseSlug(input: string): string {
  const slug = input.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(slug)) {
    throw new Error('Enter a GitHub enterprise slug, e.g. "octo-enterprise".');
  }
  return slug;
}

export function defaultMetricsDay(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export const GITHUB_COM_API_BASE = 'https://api.github.com';

/**
 * Resolve the REST API base URL for the configured server.
 *
 * - github.com uses `https://api.github.com`.
 * - GitHub Enterprise Cloud with data residency (`SUBDOMAIN.ghe.com`) serves the
 *   REST API on a dedicated subdomain: `https://api.SUBDOMAIN.ghe.com` (no `/api/v3`).
 * - Self-hosted GitHub Enterprise Server (e.g. `https://github.example.com`)
 *   serves the REST API under `/api/v3` on the same host.
 *
 * An empty value falls back to github.com.
 */
export function resolveApiBaseUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return GITHUB_COM_API_BASE;
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return GITHUB_COM_API_BASE;
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'api.github.com' || hostname === 'github.com') {
    return GITHUB_COM_API_BASE;
  }
  // GitHub Enterprise Cloud with data residency: api lives on `api.<subdomain>.ghe.com`.
  if (/\.ghe\.com$/i.test(hostname)) {
    const apiHost = hostname.startsWith('api.') ? hostname : `api.${hostname}`;
    return `https://${apiHost}`;
  }
  // Self-hosted GitHub Enterprise Server: REST API under `/api/v3`.
  const base = withScheme.replace(/\/+$/, '');
  if (/\/api\/v3$/i.test(base)) {
    return base;
  }
  return `${url.protocol}//${url.host}/api/v3`;
}

export function buildCopilotMetricsReportUrl(
  request: CopilotMetricsRequest,
  apiBaseUrl: string = GITHUB_COM_API_BASE,
): string {
  const slug = encodeURIComponent(normalizeEnterpriseSlug(request.enterpriseSlug));
  const path = KIND_TO_PATH[request.kind];
  const base = apiBaseUrl.replace(/\/+$/, '');
  const url = new URL(`${base}/enterprises/${slug}/copilot/metrics/reports/${path}`);
  if (request.kind.endsWith('1-day')) {
    const day = request.day ?? defaultMetricsDay();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error('Enter the report day as YYYY-MM-DD.');
    }
    url.searchParams.set('day', day);
  }
  return url.toString();
}

export async function fetchCopilotMetricsReportLinks(
  accessToken: string,
  request: CopilotMetricsRequest,
  apiBaseUrl: string = GITHUB_COM_API_BASE,
): Promise<CopilotMetricsReportLinks> {
  const response = await fetch(buildCopilotMetricsReportUrl(request, apiBaseUrl), {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${accessToken}`,
      'X-GitHub-Api-Version': '2026-03-10',
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub Copilot metrics request failed (${response.status} ${response.statusText}).`);
  }

  const data = (await response.json()) as GitHubReportResponse;
  return parseCopilotMetricsReportLinks(data);
}

export function parseCopilotMetricsReportLinks(data: GitHubReportResponse): CopilotMetricsReportLinks {
  const downloadLinks = Array.isArray(data.download_links)
    ? data.download_links.filter((link): link is string => typeof link === 'string')
    : [];
  return {
    downloadLinks,
    reportDay: typeof data.report_day === 'string' ? data.report_day : undefined,
    reportStartDay: typeof data.report_start_day === 'string' ? data.report_start_day : undefined,
    reportEndDay: typeof data.report_end_day === 'string' ? data.report_end_day : undefined,
  };
}