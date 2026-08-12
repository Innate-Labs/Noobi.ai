import { release } from 'node:os';

const WINDOWS_11_MINIMUM_BUILD = 22_000;

export interface PlatformSupport {
  supported: boolean;
  message?: string;
}

export function inspectDesktopPlatform(
  platform: NodeJS.Platform = process.platform,
  architecture: NodeJS.Architecture = process.arch,
  systemRelease: string = release(),
  environment: NodeJS.ProcessEnv = process.env,
  runningUnderArm64Translation = false,
): PlatformSupport {
  if (platform === 'darwin') return { supported: true };
  if (platform !== 'win32') {
    return {
      supported: false,
      message: 'Noobi.ai 当前客户端仅支持 macOS 与 Windows 11 x64。',
    };
  }
  const nativeArchitecture = windowsNativeArchitecture(environment);
  if (
    architecture !== 'x64' ||
    nativeArchitecture === 'arm64' ||
    runningUnderArm64Translation
  ) {
    return {
      supported: false,
      message: 'Noobi.ai 当前 Windows 版本只支持 x64 架构。',
    };
  }
  const build = Number(systemRelease.split('.')[2]);
  if (!Number.isInteger(build) || build < WINDOWS_11_MINIMUM_BUILD) {
    return {
      supported: false,
      message: 'Noobi.ai 当前 Windows 版本需要 Windows 11 x64。',
    };
  }
  return { supported: true };
}

function windowsNativeArchitecture(
  environment: NodeJS.ProcessEnv,
): string | undefined {
  for (const name of ['PROCESSOR_ARCHITEW6432', 'PROCESSOR_ARCHITECTURE']) {
    const match = Object.entries(environment).find(
      ([key, value]) => key.toUpperCase() === name && Boolean(value?.trim()),
    );
    if (match?.[1]) return match[1].trim().toLowerCase();
  }
  return undefined;
}
