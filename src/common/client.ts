import * as core from '@actions/core';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  Sprite,
  Checkpoint,
  CreateSpriteOptions,
  CreateCheckpointOptions,
  ExecOptions,
  ExecResult,
  ApiError,
} from './types';

const DEFAULT_API_URL = 'https://api.sprites.dev';
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TRANSIENT_ERROR_CODES = [408, 429, 500, 502, 503, 504];

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  timeout?: number;
  stream?: boolean;
}

/**
 * Sprites API client with automatic retry for transient errors
 */
export class SpritesClient {
  private readonly apiUrl: string;
  private readonly token: string;

  constructor(token: string, apiUrl?: string) {
    this.token = token;
    this.apiUrl = apiUrl || DEFAULT_API_URL;

    // Mask the token in logs
    core.setSecret(token);
  }

  /**
   * Create a new sprite or retrieve existing one by name
   */
  async createOrGetSprite(options: CreateSpriteOptions): Promise<Sprite> {
    // First try to get existing sprite by name
    try {
      const existing = await this.getSpriteByName(options.name);
      if (existing) {
        core.info(`Found existing sprite: ${existing.id}`);
        return existing;
      }
    } catch (error) {
      // Sprite doesn't exist, create new one
      core.debug(`Sprite not found, creating new one: ${options.name}`);
    }

    const response = await this.request<Sprite>({
      method: 'POST',
      path: '/sprites',
      body: options,
    });
    core.info(`Created new sprite: ${response.id}`);
    return response;
  }

  /**
   * Get a sprite by name
   */
  async getSpriteByName(name: string): Promise<Sprite | null> {
    try {
      const sprites = await this.request<Sprite[]>({
        method: 'GET',
        path: `/sprites?name=${encodeURIComponent(name)}`,
      });
      return sprites.length > 0 ? sprites[0] : null;
    } catch (error) {
      if ((error as ApiError).status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get a sprite by ID
   */
  async getSprite(spriteId: string): Promise<Sprite> {
    return this.request<Sprite>({
      method: 'GET',
      path: `/sprites/${spriteId}`,
    });
  }

  /**
   * List checkpoints for a sprite
   */
  async listCheckpoints(spriteId: string): Promise<Checkpoint[]> {
    return this.request<Checkpoint[]>({
      method: 'GET',
      path: `/sprites/${spriteId}/checkpoints`,
    });
  }

  /**
   * Get checkpoint by ID
   */
  async getCheckpoint(spriteId: string, checkpointId: string): Promise<Checkpoint> {
    return this.request<Checkpoint>({
      method: 'GET',
      path: `/sprites/${spriteId}/checkpoints/${checkpointId}`,
    });
  }

  /**
   * Create a new checkpoint
   */
  async createCheckpoint(options: CreateCheckpointOptions): Promise<Checkpoint> {
    const response = await this.request<Checkpoint>({
      method: 'POST',
      path: `/sprites/${options.spriteId}/checkpoints`,
      body: { comment: options.comment },
    });
    core.info(`Created checkpoint: ${response.id}`);
    return response;
  }

  /**
   * Restore a sprite from a checkpoint
   */
  async restoreCheckpoint(spriteId: string, checkpointId: string): Promise<void> {
    await this.request<void>({
      method: 'POST',
      path: `/sprites/${spriteId}/checkpoints/${checkpointId}/restore`,
    });
    core.info(`Restored sprite ${spriteId} from checkpoint ${checkpointId}`);
  }

  /**
   * Execute a command in a sprite with streaming output
   */
  async exec(options: ExecOptions): Promise<ExecResult> {
    const { spriteId, command, workdir, env } = options;

    core.info(`Executing command in sprite ${spriteId}`);
    core.debug(`Command: ${command}`);

    const result = await this.execWithStreaming(spriteId, {
      command,
      workdir,
      env,
    });

    return result;
  }

  /**
   * Execute command with streaming stdout/stderr
   */
  private async execWithStreaming(
    spriteId: string,
    body: { command: string; workdir?: string; env?: Record<string, string> }
  ): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.apiUrl}/sprites/${spriteId}/exec`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestBody = JSON.stringify(body);
      const requestOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/x-ndjson',
        },
        timeout: 600000, // 10 minute timeout for exec
      };

      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      const req = httpModule.request(requestOptions, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errorBody = '';
          res.on('data', (chunk) => {
            errorBody += chunk.toString();
          });
          res.on('end', () => {
            reject({
              message: `Request failed with status ${res.statusCode}: ${errorBody}`,
              status: res.statusCode,
            } as ApiError);
          });
          return;
        }

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'stdout') {
                process.stdout.write(event.data);
                stdout += event.data;
              } else if (event.type === 'stderr') {
                process.stderr.write(event.data);
                stderr += event.data;
              } else if (event.type === 'exit') {
                exitCode = event.code;
              }
            } catch {
              // Not JSON, treat as raw output
              process.stdout.write(line);
              stdout += line;
            }
          }
        });

        res.on('end', () => {
          resolve({ exitCode, stdout, stderr });
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject({ message: 'Request timeout', code: 'TIMEOUT' } as ApiError);
      });

      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Make an HTTP request with retry logic
   */
  private async request<T>(options: RequestOptions, retries = 0): Promise<T> {
    try {
      return await this.doRequest<T>(options);
    } catch (error) {
      const apiError = error as ApiError;

      // Check if error is retryable
      if (
        retries < MAX_RETRIES &&
        (TRANSIENT_ERROR_CODES.includes(apiError.status || 0) ||
          apiError.code === 'ECONNRESET' ||
          apiError.code === 'ETIMEDOUT' ||
          apiError.code === 'TIMEOUT')
      ) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retries);
        core.warning(
          `Request failed (${apiError.message}), retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`
        );
        await this.sleep(delay);
        return this.request<T>(options, retries + 1);
      }

      throw error;
    }
  }

  /**
   * Execute HTTP request
   */
  private doRequest<T>(options: RequestOptions): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.apiUrl}${options.path}`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestBody = options.body ? JSON.stringify(options.body) : undefined;
      const requestOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(requestBody && { 'Content-Length': Buffer.byteLength(requestBody) }),
        },
        timeout: options.timeout || DEFAULT_TIMEOUT,
      };

      const req = httpModule.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            let message = `Request failed with status ${res.statusCode}`;
            try {
              const errorBody = JSON.parse(data);
              message = errorBody.message || errorBody.error || message;
            } catch {
              message = data || message;
            }
            reject({ message, status: res.statusCode } as ApiError);
            return;
          }

          if (!data) {
            resolve(undefined as T);
            return;
          }

          try {
            resolve(JSON.parse(data) as T);
          } catch {
            resolve(data as unknown as T);
          }
        });

        res.on('error', reject);
      });

      req.on('error', (error: NodeJS.ErrnoException) => {
        reject({ message: error.message, code: error.code } as ApiError);
      });

      req.on('timeout', () => {
        req.destroy();
        reject({ message: 'Request timeout', code: 'TIMEOUT' } as ApiError);
      });

      if (requestBody) {
        req.write(requestBody);
      }
      req.end();
    });
  }

  /**
   * Delete a sprite by ID
   */
  async deleteSprite(spriteId: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/sprites/${spriteId}`,
    });
    core.info(`Deleted sprite: ${spriteId}`);
  }

  /**
   * List all sprites, optionally filtered by name prefix
   */
  async listSprites(namePrefix?: string): Promise<Sprite[]> {
    let path = '/sprites';
    if (namePrefix) {
      path += `?namePrefix=${encodeURIComponent(namePrefix)}`;
    }
    return this.request<Sprite[]>({
      method: 'GET',
      path,
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
