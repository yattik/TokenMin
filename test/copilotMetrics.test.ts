import * as assert from 'assert';
import {
  buildCopilotMetricsReportUrl,
  defaultMetricsDay,
  normalizeEnterpriseSlug,
  parseCopilotMetricsReportLinks,
  resolveApiBaseUrl,
} from '../src/github/copilotMetrics';

describe('copilot enterprise metrics', () => {
  it('builds the latest enterprise report URL', () => {
    assert.strictEqual(
      buildCopilotMetricsReportUrl({ enterpriseSlug: 'octo-enterprise', kind: 'enterprise-28-day-latest' }),
      'https://api.github.com/enterprises/octo-enterprise/copilot/metrics/reports/enterprise-28-day/latest',
    );
  });

  it('builds a one-day users report URL', () => {
    assert.strictEqual(
      buildCopilotMetricsReportUrl({ enterpriseSlug: 'octo-enterprise', kind: 'users-1-day', day: '2026-06-24' }),
      'https://api.github.com/enterprises/octo-enterprise/copilot/metrics/reports/users-1-day?day=2026-06-24',
    );
  });

  it('targets a GitHub Enterprise Server REST API base', () => {
    assert.strictEqual(resolveApiBaseUrl(''), 'https://api.github.com');
    assert.strictEqual(resolveApiBaseUrl('https://github.example.com'), 'https://github.example.com/api/v3');
    assert.strictEqual(resolveApiBaseUrl('github.example.com/'), 'https://github.example.com/api/v3');
    assert.strictEqual(resolveApiBaseUrl('https://github.example.com/api/v3'), 'https://github.example.com/api/v3');
    assert.strictEqual(
      buildCopilotMetricsReportUrl(
        { enterpriseSlug: 'octo-enterprise', kind: 'enterprise-28-day-latest' },
        resolveApiBaseUrl('https://github.example.com'),
      ),
      'https://github.example.com/api/v3/enterprises/octo-enterprise/copilot/metrics/reports/enterprise-28-day/latest',
    );
  });

  it('targets the api subdomain for GitHub Enterprise Cloud data residency (*.ghe.com)', () => {
    assert.strictEqual(resolveApiBaseUrl('https://shs.ghe.com'), 'https://api.shs.ghe.com');
    assert.strictEqual(resolveApiBaseUrl('shs.ghe.com/'), 'https://api.shs.ghe.com');
    assert.strictEqual(resolveApiBaseUrl('https://api.shs.ghe.com'), 'https://api.shs.ghe.com');
    assert.strictEqual(
      buildCopilotMetricsReportUrl(
        { enterpriseSlug: 'octo-enterprise', kind: 'enterprise-28-day-latest' },
        resolveApiBaseUrl('https://shs.ghe.com'),
      ),
      'https://api.shs.ghe.com/enterprises/octo-enterprise/copilot/metrics/reports/enterprise-28-day/latest',
    );
  });

  it('validates enterprise slugs and report days', () => {
    assert.strictEqual(normalizeEnterpriseSlug(' octo-enterprise '), 'octo-enterprise');
    assert.throws(() => normalizeEnterpriseSlug('not a slug'));
    assert.throws(() => buildCopilotMetricsReportUrl({ enterpriseSlug: 'octo', kind: 'users-1-day', day: 'today' }));
  });

  it('defaults one-day reports to yesterday in UTC', () => {
    assert.strictEqual(defaultMetricsDay(new Date('2026-06-25T02:00:00Z')), '2026-06-24');
  });

  it('parses GitHub report links defensively', () => {
    assert.deepStrictEqual(
      parseCopilotMetricsReportLinks({
        download_links: ['https://example.test/report.csv', 42],
        report_start_day: '2026-06-01',
        report_end_day: '2026-06-24',
      }),
      {
        downloadLinks: ['https://example.test/report.csv'],
        reportDay: undefined,
        reportStartDay: '2026-06-01',
        reportEndDay: '2026-06-24',
      },
    );
  });
});