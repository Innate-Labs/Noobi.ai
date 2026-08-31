import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { ImageGenerationAttestationStore } from './imageGenerationAttestation.js';

const roots: string[] = [];
const IMAGE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const AUDIO = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 4, 1, 2, 3, 4]);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('ImageGenerationAttestationStore', () => {
  it('rejects a forged public provider when the host has not attested the image', async () => {
    const fixture = await makeFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await writeFile(join(fixture.root, 'src/main.js'), `const hero = '/assets/images/hero.png';\n`);

    await expect(store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [{ ...fixture.asset, provider: 'codex-imagegen' }],
    })).resolves.toEqual({ ok: false, reason: 'missing-attestation' });
  });

  it('persists a host attestation and requires a byte-matched production reference', async () => {
    const fixture = await makeFixture();
    const first = new ImageGenerationAttestationStore(fixture.ledger);
    await first.init();
    await first.record({
      projectId: 'project-1',
      relativePath: fixture.asset.relativePath,
      sha256: fixture.asset.sha256,
    });
    await writeFile(
      join(fixture.root, 'src/main.js'),
      `const hero = new Image(); hero.src = '/assets/images/hero.png';\n`,
    );

    const reloaded = new ImageGenerationAttestationStore(fixture.ledger);
    await reloaded.init();
    await expect(reloaded.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toMatchObject({
      ok: true,
      asset: { relativePath: 'public/assets/images/hero.png', sha256: fixture.asset.sha256 },
      referencedBy: 'src/main.js',
    });

    const ledger = JSON.parse(await readFile(fixture.ledger, 'utf8')) as {
      attestations: Array<Record<string, unknown>>;
    };
    expect(ledger.attestations).toMatchObject([{
      projectId: 'project-1',
      relativePath: 'public/assets/images/hero.png',
      sha256: fixture.asset.sha256,
    }]);
  });

  it('accepts an externally generated image only after Main records its provider attestation', async () => {
    const fixture = await makeFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await store.record({
      projectId: 'project-1',
      relativePath: fixture.asset.relativePath,
      sha256: fixture.asset.sha256,
      provider: 'api:openai-image:provider-1',
    });
    await writeFile(join(fixture.root, 'src/main.js'), `hero.src = '/assets/images/hero.png';\n`);

    await expect(store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toMatchObject({
      ok: true,
      asset: { provider: 'api:openai-image:provider-1' },
      referencedBy: 'src/main.js',
    });
  });

  it('rejects comment-only paths while preserving real JS, CSS, and HTML references', async () => {
    const fixture = await makeFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await store.record({
      projectId: 'project-1',
      relativePath: fixture.asset.relativePath,
      sha256: fixture.asset.sha256,
      provider: 'api:openai-image:provider-1',
    });
    await writeFile(join(fixture.root, 'src/main.js'), [
      '// unused: /assets/images/hero.png',
      '/* unused: public/assets/images/hero.png */',
    ].join('\n'));
    await writeFile(join(fixture.root, 'src/style.css'), '/* background: url("/assets/images/hero.png"); */\n');
    await writeFile(join(fixture.root, 'index.html'), '<!-- <img src="/assets/images/hero.png"> -->\n');

    const verify = () => store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    });
    await expect(verify()).resolves.toEqual({
      ok: false,
      reason: 'missing-production-reference',
      candidatePaths: ['public/assets/images/hero.png'],
    });

    await writeFile(join(fixture.root, 'src/main.js'), 'const hero = "/assets/images/hero.png";\n');
    await expect(verify()).resolves.toMatchObject({ ok: true, referencedBy: 'src/main.js' });

    await writeFile(join(fixture.root, 'src/main.js'), '// no reference\n');
    await writeFile(join(fixture.root, 'src/style.css'), '.hero { background: url("/assets/images/hero.png"); }\n');
    await expect(verify()).resolves.toMatchObject({ ok: true, referencedBy: 'src/style.css' });

    await writeFile(join(fixture.root, 'src/style.css'), '/* no reference */\n');
    await writeFile(join(fixture.root, 'index.html'), '<img src="/assets/images/hero.png" alt="hero">\n');
    await expect(verify()).resolves.toMatchObject({ ok: true, referencedBy: 'index.html' });
  });

  it('recognizes real Godot resource references while rejecting comment-only GDScript paths', async () => {
    const fixture = await makeFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await store.record({
      projectId: 'project-1',
      relativePath: fixture.asset.relativePath,
      sha256: fixture.asset.sha256,
    });
    await mkdir(join(fixture.root, 'scripts'), { recursive: true });
    await mkdir(join(fixture.root, 'scenes'), { recursive: true });

    const verify = () => store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    });
    await writeFile(join(fixture.root, 'scripts/main.gd'), [
      '# unused: res://public/assets/images/hero.png',
      'var label := "# res://public/assets/images/not-a-comment.png"',
    ].join('\n'));
    await expect(verify()).resolves.toEqual({
      ok: false,
      reason: 'missing-production-reference',
      candidatePaths: ['public/assets/images/hero.png'],
    });

    await writeFile(
      join(fixture.root, 'scripts/main.gd'),
      'const HERO: Texture2D = preload("res://public/assets/images/hero.png")\n',
    );
    await expect(verify()).resolves.toMatchObject({ ok: true, referencedBy: 'scripts/main.gd' });

    await writeFile(join(fixture.root, 'scripts/main.gd'), '# no production reference\n');
    await writeFile(
      join(fixture.root, 'scenes/main.tscn'),
      '[ext_resource type="Texture2D" path="res://public/assets/images/hero.png" id="1"]\n',
    );
    await expect(verify()).resolves.toMatchObject({ ok: true, referencedBy: 'scenes/main.tscn' });
  });

  it('fails closed when the attested file changes or is mentioned only by the public manifest', async () => {
    const fixture = await makeFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await store.record({
      projectId: 'project-1',
      relativePath: fixture.asset.relativePath,
      sha256: fixture.asset.sha256,
    });
    await writeFile(
      join(fixture.root, 'public/assets/asset-pack.json'),
      JSON.stringify({ provider: 'codex-imagegen', relativePath: fixture.asset.relativePath }),
    );
    await mkdir(join(fixture.root, 'dist/assets'), { recursive: true });
    await writeFile(
      join(fixture.root, 'dist/assets/asset-pack.json'),
      JSON.stringify({ provider: 'codex-imagegen', relativePath: fixture.asset.relativePath }),
    );

    await expect(store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toEqual({
      ok: false,
      reason: 'missing-production-reference',
      candidatePaths: ['public/assets/images/hero.png'],
    });

    await writeFile(join(fixture.root, 'public/assets/images/hero.png'), Buffer.concat([IMAGE, Buffer.from([9])]));
    await writeFile(join(fixture.root, 'src/main.js'), `const hero = '/assets/images/hero.png';\n`);
    await expect(store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toEqual({ ok: false, reason: 'asset-mismatch' });
  });

  it('securely bootstraps pre-ledger assets from a same-name, byte-identical managed ImageGen output', async () => {
    const fixture = await makeFixture();
    const generatedRoot = await mkdtemp(join(tmpdir(), 'noobi-generated-images-'));
    roots.push(generatedRoot);
    await mkdir(join(generatedRoot, 'thread-1'), { recursive: true });
    await writeFile(join(generatedRoot, 'thread-1/hero.png'), IMAGE);
    await mkdir(join(fixture.root, 'dist'), { recursive: true });
    await writeFile(join(fixture.root, 'dist/index.js'), `fetch('assets/images/hero.png');\n`);
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();

    await expect(store.bootstrapFromManagedOutputs({
      projectId: 'project-1',
      root: fixture.root,
      generatedImagesRoot: generatedRoot,
      assets: [fixture.asset],
    })).resolves.toBe(1);
    await expect(store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toMatchObject({ ok: true, referencedBy: 'dist/index.js' });
  });

  it('does not follow symlinks while looking for migration proof', async () => {
    const fixture = await makeFixture();
    const generatedRoot = await mkdtemp(join(tmpdir(), 'noobi-generated-images-'));
    const outside = await mkdtemp(join(tmpdir(), 'noobi-generated-outside-'));
    roots.push(generatedRoot, outside);
    await writeFile(join(outside, 'hero.png'), IMAGE);
    await symlink(outside, join(generatedRoot, 'thread-1'));
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();

    await expect(store.bootstrapFromManagedOutputs({
      projectId: 'project-1',
      root: fixture.root,
      generatedImagesRoot: generatedRoot,
      assets: [fixture.asset],
    })).resolves.toBe(0);
    await expect(store.verify({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toEqual({ ok: false, reason: 'missing-attestation' });
  });

  it('accepts byte-matched, production-referenced audio attested by the MiniMax API', async () => {
    const fixture = await makeAudioFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await store.record({
      projectId: 'project-1',
      relativePath: fixture.asset.relativePath,
      sha256: fixture.asset.sha256,
      provider: 'api:minimax-audio:provider-1',
    });
    await writeFile(
      join(fixture.root, 'src/main.js'),
      `const impact = new Audio('/assets/audio/impact.mp3');\n`,
    );

    await expect(store.verifyAudio({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toMatchObject({
      ok: true,
      asset: {
        relativePath: 'public/assets/audio/impact.mp3',
        sha256: fixture.asset.sha256,
        provider: 'api:minimax-audio:provider-1',
      },
      referencedBy: 'src/main.js',
    });
  });

  it('does not accept a forged public MiniMax audio manifest as host proof', async () => {
    const fixture = await makeAudioFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await writeFile(
      join(fixture.root, 'public/assets/asset-pack.json'),
      JSON.stringify({
        assets: [{ ...fixture.asset, provider: 'api:minimax-audio:forged-provider' }],
      }),
    );
    await writeFile(
      join(fixture.root, 'src/main.js'),
      `const impact = new Audio('/assets/audio/impact.mp3');\n`,
    );

    await expect(store.verifyAudio({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toEqual({ ok: false, reason: 'missing-attestation' });
  });

  it('rejects privately attested audio from a non-MiniMax provider', async () => {
    const fixture = await makeAudioFixture();
    const store = new ImageGenerationAttestationStore(fixture.ledger);
    await store.init();
    await store.record({
      projectId: 'project-1',
      relativePath: fixture.asset.relativePath,
      sha256: fixture.asset.sha256,
      provider: 'api:minimax-audio-evil:provider-1',
    });
    await writeFile(
      join(fixture.root, 'src/main.js'),
      `const impact = new Audio('/assets/audio/impact.mp3');\n`,
    );

    await expect(store.verifyAudio({
      projectId: 'project-1',
      root: fixture.root,
      assets: [fixture.asset],
    })).resolves.toEqual({ ok: false, reason: 'missing-attestation' });
  });
});

async function makeFixture(): Promise<{
  root: string;
  ledger: string;
  asset: {
    kind: 'image';
    relativePath: string;
    sha256: string;
    size: number;
  };
}> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-attestation-project-'));
  const userData = await mkdtemp(join(tmpdir(), 'noobi-attestation-user-data-'));
  roots.push(root, userData);
  await mkdir(join(root, 'public/assets/images'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'public/assets/images/hero.png'), IMAGE);
  return {
    root,
    ledger: join(userData, 'image-generation-attestations.json'),
    asset: {
      kind: 'image',
      relativePath: 'public/assets/images/hero.png',
      sha256: createHash('sha256').update(IMAGE).digest('hex'),
      size: IMAGE.length,
    },
  };
}

async function makeAudioFixture(): Promise<{
  root: string;
  ledger: string;
  asset: {
    kind: 'audio';
    relativePath: string;
    sha256: string;
    size: number;
  };
}> {
  const root = await mkdtemp(join(tmpdir(), 'noobi-audio-attestation-project-'));
  const userData = await mkdtemp(join(tmpdir(), 'noobi-audio-attestation-user-data-'));
  roots.push(root, userData);
  await mkdir(join(root, 'public/assets/audio'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'public/assets/audio/impact.mp3'), AUDIO);
  return {
    root,
    ledger: join(userData, 'image-generation-attestations.json'),
    asset: {
      kind: 'audio',
      relativePath: 'public/assets/audio/impact.mp3',
      sha256: createHash('sha256').update(AUDIO).digest('hex'),
      size: AUDIO.length,
    },
  };
}
