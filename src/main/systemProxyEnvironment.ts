import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const EXPLICIT_PROXY_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];

/** GUI launches do not inherit shell proxy exports. Carry the user's static
 * macOS proxy into the Codex child only; never change global environment/config.
 * PAC rules cannot be represented by a single process proxy, so leave them alone. */
export async function runtimeProxyEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  readSettings = async () => (await execFileAsync('/usr/sbin/scutil', ['--proxy'], { timeout: 2000, maxBuffer: 32_768 })).stdout,
): Promise<NodeJS.ProcessEnv> {
  const result = { ...env };
  if (platform !== 'darwin' || EXPLICIT_PROXY_KEYS.some(key => env[key] !== undefined)) return result;
  let settings: string;
  try { settings = await readSettings(); } catch { return result; }
  const field = (key: string) => settings.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`, 'm'))?.[1];
  if (field('ProxyAutoConfigEnable') === '1' || field('ProxyAutoDiscoveryEnable') === '1') return result;
  for (const kind of ['HTTP', 'HTTPS'] as const) {
    if (field(`${kind}Enable`) !== '1') continue;
    const host = field(`${kind}Proxy`);
    const port = Number(field(`${kind}Port`));
    if (!host || !/^(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])$/.test(host)
      || !Number.isInteger(port) || port < 1 || port > 65535) continue;
    result[`${kind}_PROXY`] = `http://${host}:${port}`;
  }
  if (result.HTTP_PROXY || result.HTTPS_PROXY) {
    const bypass = env.NO_PROXY ?? env.no_proxy;
    result.NO_PROXY = [...new Set([...(bypass?.split(',') ?? []), 'localhost', '127.0.0.1', '::1'])].join(',');
    result.no_proxy = result.NO_PROXY;
  }
  return result;
}
