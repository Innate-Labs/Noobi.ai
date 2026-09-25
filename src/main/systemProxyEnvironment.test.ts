import { describe, expect, it } from 'vitest';
import { runtimeProxyEnvironment } from './systemProxyEnvironment.js';

const settings = `HTTPEnable : 1
HTTPProxy : 127.0.0.1
HTTPPort : 1082
HTTPSEnable : 1
HTTPSProxy : 127.0.0.1
HTTPSPort : 1082
ProxyAutoConfigEnable : 0`;

describe('Codex child system proxy', () => {
  it('inherits the static system proxy and bypasses local previews without mutating the parent', async () => {
    const env = { PATH: '/bin', no_proxy: 'internal.example' };
    expect(await runtimeProxyEnvironment(env, 'darwin', async () => settings)).toEqual({
      PATH: '/bin', HTTP_PROXY: 'http://127.0.0.1:1082', HTTPS_PROXY: 'http://127.0.0.1:1082',
      NO_PROXY: 'internal.example,localhost,127.0.0.1,::1', no_proxy: 'internal.example,localhost,127.0.0.1,::1',
    });
    expect(env).toEqual({ PATH: '/bin', no_proxy: 'internal.example' });
  });
  it.each(['HTTP_PROXY', 'https_proxy', 'ALL_PROXY'])('preserves explicit %s including opt-out', async key => {
    for (const value of ['', 'http://configured:8080']) {
      const env = { [key]: value };
      expect(await runtimeProxyEnvironment(env, 'darwin', async () => { throw new Error('must not read system'); })).toEqual(env);
    }
  });
  it('does not flatten PAC rules or use disabled and malformed proxies', async () => {
    expect(await runtimeProxyEnvironment({}, 'darwin', async () => settings.replace('ProxyAutoConfigEnable : 0', 'ProxyAutoConfigEnable : 1'))).toEqual({});
    expect(await runtimeProxyEnvironment({}, 'darwin', async () => 'HTTPEnable : 0\nHTTPSEnable : 1\nHTTPSProxy : user:password@host/path\nHTTPSPort : 99999')).toEqual({});
  });
  it('leaves other systems and unavailable system settings unchanged', async () => {
    expect(await runtimeProxyEnvironment({}, 'linux', async () => settings)).toEqual({});
    expect(await runtimeProxyEnvironment({}, 'darwin', async () => { throw new Error('scutil unavailable'); })).toEqual({});
  });
});
