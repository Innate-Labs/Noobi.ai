/**
 * @license
 * Copyright 2025 OpenGame Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  getAllProvidersStatus,
  type Config,
  type ProviderStatus,
} from '@opengame/opengame-core';
import { theme } from '../semantic-colors.js';

interface ProviderStatusBannerProps {
  config: Config;
}

function statusLabel(s: ProviderStatus): string {
  if (!s.configured) return 'not set';
  return `${s.provider}/${s.model}`;
}

/**
 * Compact one-line summary of which generative-AI providers OpenGame has
 * keys for. Rendered just below the header so the user can immediately
 * see which tools will work in this session. Shows guidance to run
 * `/setup` only when at least one modality is missing.
 */
export const ProviderStatusBanner: React.FC<ProviderStatusBannerProps> = ({
  config,
}) => {
  const statuses = getAllProvidersStatus(config.getOpenGameProviders());
  const anyMissing = statuses.some((s) => !s.configured);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={theme.text.secondary}>Providers: </Text>
        {statuses.map((s, i) => (
          <Text key={s.modality}>
            {i > 0 && <Text color={theme.text.secondary}> · </Text>}
            <Text
              color={s.configured ? theme.status.success : theme.status.warning}
            >
              {s.modality}
            </Text>
            <Text color={theme.text.secondary}> {statusLabel(s)}</Text>
          </Text>
        ))}
      </Box>
      {anyMissing && (
        <Text color={theme.text.secondary}>
          Run{' '}
          <Text bold color={theme.text.accent}>
            /setup
          </Text>{' '}
          to see how to configure the missing providers.
        </Text>
      )}
    </Box>
  );
};
