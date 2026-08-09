import { vi } from 'vitest';
import { Image } from 'canvas';

// Provide Image for Phaser to use in headless mode
globalThis.Image = Image as any;

// JSDOM occasionally needs these no-ops
globalThis.scrollTo ||= () => {};

// Use fake timers to step Phaser's main loop deterministically in tests
vi.useFakeTimers();
