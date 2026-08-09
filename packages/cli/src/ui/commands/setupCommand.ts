/**
 * @license
 * Copyright 2025 OpenGame Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getAllProvidersStatus,
  type Modality,
  type ProviderStatus,
} from '@opengame/opengame-core';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';

const MODALITY_DESCRIPTIONS: Record<Modality, string> = {
  reasoning: 'GDD writing, archetype classification, ABC notation',
  image: 'sprites, backgrounds, tiles (text-to-image / image-edit)',
  video: 'animation frames + audio source (image-to-video)',
  audio: 'music / SFX generation (optional)',
};

const ENV_TEMPLATE: Record<Modality, string[]> = {
  reasoning: [
    'export OPENGAME_REASONING_PROVIDER=tongyi   # tongyi | doubao | openai-compat',
    'export OPENGAME_REASONING_API_KEY=sk-...',
    '# export OPENGAME_REASONING_BASE_URL=https://api.openai.com/v1   # only for openai-compat',
    '# export OPENGAME_REASONING_MODEL=gpt-4o-mini                    # only for openai-compat',
  ],
  image: [
    'export OPENGAME_IMAGE_PROVIDER=tongyi',
    'export OPENGAME_IMAGE_API_KEY=sk-...',
  ],
  video: [
    'export OPENGAME_VIDEO_PROVIDER=tongyi',
    'export OPENGAME_VIDEO_API_KEY=sk-...',
  ],
  audio: [
    'export OPENGAME_AUDIO_PROVIDER=minimax   # elevenlabs | minimax | stability | google-lyria | mureka',
    'export OPENGAME_AUDIO_API_KEY=your-provider-key',
    'export OPENGAME_AUDIO_BASE_URL=https://api.minimaxi.com',
    'export OPENGAME_AUDIO_MODEL=music-2.6-free',
  ],
};

function statusGlyph(s: ProviderStatus): string {
  return s.configured ? '[ok]  ' : '[--]  ';
}

function formatConfigured(s: ProviderStatus): string {
  const parts = [
    `${statusGlyph(s)}${s.modality.padEnd(9)}`,
    `provider=${s.provider}`,
    `model=${s.model}`,
  ];
  if (s.source && s.source !== 'env') {
    parts.push(`(via ${s.source})`);
  }
  return parts.join('  ');
}

function formatMissing(s: ProviderStatus): string {
  const lines: string[] = [];
  lines.push(`${statusGlyph(s)}${s.modality.padEnd(9)}  not configured`);
  lines.push(`        purpose: ${MODALITY_DESCRIPTIONS[s.modality]}`);
  lines.push('        quick setup (env vars):');
  for (const line of ENV_TEMPLATE[s.modality]) {
    lines.push(`          ${line}`);
  }
  return lines.join('\n');
}

export const setupCommand: SlashCommand = {
  name: 'setup',
  altNames: ['providers', 'config'],
  description:
    'show which generative-AI providers (reasoning/image/video/audio) are configured',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext) => {
    const providers = context.services.config?.getOpenGameProviders();
    const statuses = getAllProvidersStatus(providers);

    const configured = statuses.filter((s) => s.configured);
    const missing = statuses.filter((s) => !s.configured);

    const sections: string[] = [];
    sections.push('OpenGame generative-AI providers');
    sections.push('================================');
    sections.push('');

    if (configured.length > 0) {
      sections.push('Configured:');
      for (const s of configured) {
        sections.push('  ' + formatConfigured(s));
      }
      sections.push('');
    }

    if (missing.length > 0) {
      sections.push('Not configured:');
      for (const s of missing) {
        sections.push(formatMissing(s));
        sections.push('');
      }
    } else {
      sections.push('All four modalities are configured. You are good to go.');
      sections.push('');
    }

    sections.push('Persistent settings live in ~/.qwen/settings.json under');
    sections.push('  "openGame": { "providers": { "<modality>": { ... } } }');
    sections.push('');
    sections.push(
      'Full reference: docs/users/configuration/api-keys.md  ·  template: .env.example',
    );

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: sections.join('\n'),
      },
      Date.now(),
    );
  },
};
