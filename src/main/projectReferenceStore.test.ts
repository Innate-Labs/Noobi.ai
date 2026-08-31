import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { importProjectReferences } from './projectReferenceStore.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'noobi-reference-test-'));
  roots.push(root);
  const project = join(root, 'project');
  const sources = join(root, 'sources');
  await Promise.all([mkdir(project), mkdir(sources)]);
  return { root, project, sources };
}

describe('project reference store', () => {
  it('copies validated UTF-8 and PDF references into the isolated project folder', async () => {
    const { project, sources } = await fixture();
    const markdown = join(sources, '玩法 说明.md');
    const pdf = join(sources, 'moodboard.pdf');
    await writeFile(markdown, '# Game brief\nBuild a card game.\n');
    await writeFile(pdf, '%PDF-1.7\n% reference\n');

    const records = await importProjectReferences(project, [markdown, pdf]);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      relativePath: 'references/uploads/玩法-说明.md',
      mimeType: 'text/markdown',
    });
    expect(records[1]).toMatchObject({
      relativePath: 'references/uploads/moodboard.pdf',
      mimeType: 'application/pdf',
    });
    await expect(readFile(join(project, records[0]!.relativePath), 'utf8')).resolves.toContain('Game brief');
  });

  it('rejects unsupported, malformed, binary, and symbolic-link references', async () => {
    const { project, sources } = await fixture();
    const executable = join(sources, 'run.sh');
    const malformedPdf = join(sources, 'fake.pdf');
    const binaryText = join(sources, 'binary.txt');
    const realText = join(sources, 'real.txt');
    const linkedText = join(sources, 'linked.txt');
    await writeFile(executable, '#!/bin/sh\n');
    await writeFile(malformedPdf, 'not a pdf');
    await writeFile(binaryText, Buffer.from([0, 1, 2, 3]));
    await writeFile(realText, 'safe');
    await symlink(realText, linkedText);

    await expect(importProjectReferences(project, [executable])).rejects.toThrow('不支持');
    await expect(importProjectReferences(project, [malformedPdf])).rejects.toThrow('签名无效');
    await expect(importProjectReferences(project, [binaryText])).rejects.toThrow('二进制');
    await expect(importProjectReferences(project, [linkedText])).rejects.toThrow('普通文件');
  });

  it('does not overwrite references with the same name', async () => {
    const { project, sources } = await fixture();
    const firstDirectory = join(sources, 'a');
    const secondDirectory = join(sources, 'b');
    await Promise.all([mkdir(firstDirectory), mkdir(secondDirectory)]);
    const first = join(firstDirectory, 'brief.txt');
    const second = join(secondDirectory, 'brief.txt');
    await writeFile(first, 'first');
    await writeFile(second, 'second');
    const records = await importProjectReferences(project, [first, second]);
    expect(records.map((record) => record.relativePath)).toEqual([
      'references/uploads/brief.txt',
      'references/uploads/brief-2.txt',
    ]);
  });
});
