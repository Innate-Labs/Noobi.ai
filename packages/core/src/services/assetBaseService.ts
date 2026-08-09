/**
 * Base Service Class
 * Provides common functionality for all generation services
 */

/** Loose shape returned by Tongyi/Doubao async-task polling endpoints. */
export interface TaskPollResult {
  output?: {
    task_status?: string;
    message?: string;
    task_id?: string;
    results?: Array<{ url?: string; [key: string]: unknown }>;
    choices?: Array<{
      message?: { content?: unknown };
      [key: string]: unknown;
    }>;
    video_url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export abstract class BaseService {
  protected logger: Console = console;

  protected async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    retryDelay: number = 2000,
  ): Promise<Response> {
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const res = await fetch(url, options);

        // Rate limit handling
        if (res.status === 429) {
          const delay = retryDelay * Math.pow(2, i);
          this.logger.warn(`Rate limited, retrying in ${delay}ms...`);
          await this.sleep(delay);
          continue;
        }

        if (!res.ok && i < maxRetries) {
          this.logger.warn(`Request failed with ${res.status}, retrying...`);
          await this.sleep(retryDelay);
          continue;
        }

        return res;
      } catch (error) {
        if (i === maxRetries) throw error;
        this.logger.warn(`Request error, retrying... Error: ${error}`);
        await this.sleep(retryDelay);
      }
    }
    throw new Error('Request failed after max retries');
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async downloadToBuffer(url: string): Promise<Buffer> {
    const response = await this.fetchWithRetry(url, {});
    if (!response.ok) {
      throw new Error(
        `Failed to download: ${response.status} ${response.statusText}`,
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  protected async pollTaskStatus(
    taskUrl: string,
    headers: Record<string, string>,
    timeoutMs: number = 120000,
    pollInterval: number = 2000,
  ): Promise<TaskPollResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await this.sleep(pollInterval);

      const res = await fetch(taskUrl, { headers });
      if (!res.ok) {
        this.logger.warn(`Task poll failed: ${res.status}`);
        continue;
      }

      const data = (await res.json()) as TaskPollResult;
      const status = data.output?.task_status;

      if (status === 'SUCCEEDED') {
        return data;
      }

      if (status === 'FAILED') {
        throw new Error(
          `Task failed: ${data.output?.message || 'Unknown error'}`,
        );
      }
    }

    throw new Error(`Task timed out after ${timeoutMs}ms`);
  }

  protected log(
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
  ): void {
    const prefix = `[${this.constructor.name}]`;
    switch (level) {
      case 'warn':
        this.logger.warn(`${prefix} ${message}`);
        break;
      case 'error':
        this.logger.error(`${prefix} ${message}`);
        break;
      default:
        this.logger.log(`${prefix} ${message}`);
    }
  }
}
