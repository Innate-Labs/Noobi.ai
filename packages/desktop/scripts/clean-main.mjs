#!/usr/bin/env node

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const mainOutput = path.resolve(scriptDirectory, '../dist/main');

await rm(mainOutput, { recursive: true, force: true });
