import * as vscode from 'vscode';
import {
  CopilotMetricsReportKind,
  GITHUB_COM_API_BASE,
  defaultMetricsDay,
  fetchCopilotMetricsReportLinks,
  normalizeEnterpriseSlug,
  resolveApiBaseUrl,
} from './copilotMetrics';
import { getOutputChannel, logHeading, logLine } from '../util/output';

interface ReportPick extends vscode.QuickPickItem {
  reportKind: CopilotMetricsReportKind;
  needsDay: boolean;
}

const REPORT_PICKS: readonly ReportPick[] = [
  {
    label: 'Enterprise usage, latest 28 days',
    description: 'Official aggregate report',
    reportKind: 'enterprise-28-day-latest',
    needsDay: false,
  },
  {
    label: 'User usage, latest 28 days',
    description: 'Official per-user report',
    reportKind: 'users-28-day-latest',
    needsDay: false,
  },
  {
    label: 'Enterprise usage for one day',
    description: 'Official aggregate report',
    reportKind: 'enterprise-1-day',
    needsDay: true,
  },
  {
    label: 'User usage for one day',
    description: 'Official per-user report',
    reportKind: 'users-1-day',
    needsDay: true,
  },
];

export async function trackEnterpriseCopilotUsage(): Promise<void> {
  const config = vscode.workspace.getConfiguration('tokenmin');

  const serverUrl = await pickServerUrl(config.get<string>('github.baseUrl', ''));
  if (serverUrl === undefined) {
    return;
  }

  const enterpriseSlug = await pickEnterpriseSlug(config.get<string>('github.enterpriseSlug', ''));
  if (!enterpriseSlug) {
    return;
  }

  const pick = await vscode.window.showQuickPick(REPORT_PICKS, {
    title: 'Track Enterprise Copilot Usage',
    placeHolder: 'Choose the official GitHub Copilot metrics report to fetch',
  });
  if (!pick) {
    return;
  }

  const day = pick.needsDay ? await pickReportDay() : undefined;
  if (pick.needsDay && !day) {
    return;
  }

  await config.update('github.enterpriseSlug', enterpriseSlug, vscode.ConfigurationTarget.Global);
  await config.update('github.baseUrl', serverUrl, vscode.ConfigurationTarget.Global);

  const apiBaseUrl = resolveApiBaseUrl(serverUrl);
  const useEnterpriseServer = apiBaseUrl !== GITHUB_COM_API_BASE;
  if (useEnterpriseServer) {
    await ensureEnterpriseUri(serverUrl);
  }
  const providerId = useEnterpriseServer ? 'github-enterprise' : 'github';
  const session = await vscode.authentication.getSession(providerId, ['read:enterprise'], { createIfNone: true });

  const report = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Token Optimizer: fetching Copilot usage report...' },
    () => fetchCopilotMetricsReportLinks(session.accessToken, { enterpriseSlug, kind: pick.reportKind, day }, apiBaseUrl),
  );

  logHeading('Enterprise Copilot usage report');
  logLine(`Server: ${useEnterpriseServer ? serverUrl : 'github.com'}`);
  logLine(`Enterprise: ${enterpriseSlug}`);
  logLine(`Report: ${pick.label}`);
  if (report.reportDay) {
    logLine(`Day: ${report.reportDay}`);
  }
  if (report.reportStartDay || report.reportEndDay) {
    logLine(`Range: ${report.reportStartDay ?? '?'} to ${report.reportEndDay ?? '?'}`);
  }
  logLine('Official GitHub report links:');
  for (const link of report.downloadLinks) {
    logLine(`- ${link}`);
  }
  logLine('Note: these are official aggregate reports. TokenMin per-session savings remain local estimates.');

  if (report.downloadLinks.length === 0) {
    void vscode.window.showInformationMessage('GitHub returned no report links for that Copilot metrics request.');
    getOutputChannel().show(true);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `Token Optimizer: fetched ${report.downloadLinks.length} Copilot usage report link(s).`,
    'Open First Link',
    'Copy Links',
    'Show Logs',
  );
  if (choice === 'Open First Link') {
    await vscode.env.openExternal(vscode.Uri.parse(report.downloadLinks[0]));
  } else if (choice === 'Copy Links') {
    await vscode.env.clipboard.writeText(report.downloadLinks.join('\n'));
  } else if (choice === 'Show Logs') {
    getOutputChannel().show(true);
  }
}

async function pickServerUrl(configuredUrl: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Track Enterprise Copilot Usage',
    prompt: 'GitHub host to sign in to. Leave blank for github.com.',
    value: configuredUrl.trim(),
    placeHolder: 'https://shs.ghe.com',
    validateInput: (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        return undefined;
      }
      const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      try {
        new URL(withScheme);
        return undefined;
      } catch {
        return 'Enter a valid host, e.g. https://shs.ghe.com.';
      }
    },
  });
  if (value === undefined) {
    return undefined;
  }
  return value.trim();
}

async function pickEnterpriseSlug(configuredSlug: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: 'Track Enterprise Copilot Usage',
    prompt: 'GitHub enterprise slug',
    value: configuredSlug,
    placeHolder: 'octo-enterprise',
    validateInput: (input) => {
      try {
        normalizeEnterpriseSlug(input);
        return undefined;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
  });
  return value ? normalizeEnterpriseSlug(value) : undefined;
}

async function pickReportDay(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title: 'Track Enterprise Copilot Usage',
    prompt: 'Report day (GitHub reports are generated after a full UTC day)',
    value: defaultMetricsDay(),
    placeHolder: 'YYYY-MM-DD',
    validateInput: (input) => (/^\d{4}-\d{2}-\d{2}$/.test(input) ? undefined : 'Use YYYY-MM-DD.'),
  });
}

/**
 * VS Code's built-in GitHub Enterprise Server auth provider (`github-enterprise`)
 * authenticates against the host in the `github-enterprise.uri` setting. Point it
 * at the configured server so login targets the enterprise instance, not github.com.
 */
async function ensureEnterpriseUri(serverUrl: string): Promise<void> {
  const host = /^https?:\/\//i.test(serverUrl) ? serverUrl : `https://${serverUrl}`;
  const normalized = host.replace(/\/+$/, '');
  const gheConfig = vscode.workspace.getConfiguration('github-enterprise');
  const current = (gheConfig.get<string>('uri', '') || '').trim().replace(/\/+$/, '');
  if (current !== normalized) {
    await gheConfig.update('uri', normalized, vscode.ConfigurationTarget.Global);
  }
}