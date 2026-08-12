import { describe, expect, it } from 'vitest';
import { inspectDesktopPlatform } from './platformSupport.js';

describe('inspectDesktopPlatform', () => {
  it('accepts Windows 11 x64 builds', () => {
    expect(inspectDesktopPlatform('win32', 'x64', '10.0.22631')).toEqual({
      supported: true,
    });
  });

  it('rejects older Windows and unsupported architectures with clear reasons', () => {
    expect(inspectDesktopPlatform('win32', 'x64', '10.0.19045')).toMatchObject({
      supported: false,
      message: expect.stringContaining('Windows 11'),
    });
    expect(
      inspectDesktopPlatform('win32', 'arm64', '10.0.26100'),
    ).toMatchObject({
      supported: false,
      message: expect.stringContaining('x64'),
    });
    expect(
      inspectDesktopPlatform('win32', 'x64', '10.0.26100', {
        PROCESSOR_ARCHITEW6432: 'ARM64',
      }),
    ).toMatchObject({
      supported: false,
      message: expect.stringContaining('x64'),
    });
    expect(
      inspectDesktopPlatform(
        'win32',
        'x64',
        '10.0.26100',
        { PROCESSOR_ARCHITECTURE: 'AMD64' },
        true,
      ),
    ).toMatchObject({
      supported: false,
      message: expect.stringContaining('x64'),
    });
  });

  it('does not change the existing macOS host contract', () => {
    expect(inspectDesktopPlatform('darwin', 'arm64', '25.0.0')).toEqual({
      supported: true,
    });
  });

  it('does not accidentally advertise a new desktop platform', () => {
    expect(inspectDesktopPlatform('linux', 'x64', '6.0.0')).toMatchObject({
      supported: false,
      message: expect.stringContaining('macOS'),
    });
  });
});
