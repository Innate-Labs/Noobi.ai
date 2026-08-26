import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

await Promise.all([
  rm(resolve('dist'), { recursive: true, force: true }),
  rm(resolve('.noobi-smoke'), { recursive: true, force: true }),
]);

