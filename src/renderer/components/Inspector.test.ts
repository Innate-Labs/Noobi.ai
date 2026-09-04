import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { GameplayExperienceReport } from '../../shared/contracts';
import {
  ExperienceReport,
  ExperienceReportTrigger,
  shouldShowExperienceReport,
} from './Inspector';

const report: GameplayExperienceReport = {
  version: 1,
  verdict: 'pass',
  score: 100,
  checkedAt: '2026-09-02T01:00:00.000Z',
  durationMs: 145,
  reportPath: 'artifacts/playtest/latest/report.json',
  summary: '自动试玩通过。',
  checks: [
    {
      id: 'load',
      label: '加载与启动',
      status: 'pass',
      message: '本地预览已完成加载。',
      durationMs: 145,
    },
  ],
};

describe('ExperienceReport', () => {
  it('keeps the collapsed score summary in the preview toolbar', () => {
    const markup = renderToStaticMarkup(createElement(ExperienceReportTrigger, {
      report,
      projectStatus: 'completed',
      evaluating: false,
      expanded: false,
      onToggle: vi.fn(),
    }));

    expect(markup).toContain('experience-report-trigger is-pass');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('100');
    expect(markup).toContain('PASS');
    expect(markup).not.toContain('加载与启动');
    expect(markup).not.toContain('artifacts/playtest/latest/report.json');
  });

  it('renders the complete report in an independently scrollable drawer', () => {
    const markup = renderToStaticMarkup(createElement(ExperienceReport, {
      report,
      projectStatus: 'completed',
      evaluating: false,
      disabled: false,
      onClose: vi.fn(),
      onEvaluate: vi.fn(),
      onCancel: vi.fn(),
      onOpenReport: vi.fn(),
    }));

    expect(markup).toContain('experience-report is-pass');
    expect(markup).toContain('experience-report-details');
    expect(markup).toContain('加载与启动');
    expect(markup).toContain('artifacts/playtest/latest/report.json');
    expect(markup).toContain('收起');
  });

  it('keeps existing reports available for stopped and running projects', () => {
    expect(shouldShowExperienceReport(false, 'stopped', report)).toBe(true);
    expect(shouldShowExperienceReport(false, 'running', report)).toBe(true);
    expect(shouldShowExperienceReport(false, 'stopped', null)).toBe(false);
    expect(shouldShowExperienceReport(false, 'completed', null)).toBe(true);
  });

  it('distinguishes a passed playtest from a failed overall delivery', () => {
    const markup = renderToStaticMarkup(createElement(ExperienceReport, {
      report,
      projectStatus: 'failed',
      evaluating: false,
      disabled: false,
      onClose: vi.fn(),
      onEvaluate: vi.fn(),
      onCancel: vi.fn(),
      onOpenReport: vi.fn(),
    }));

    expect(markup).toContain('试玩通过 · 项目仍需处理');
    expect(markup).toContain('PASS');
  });
});
