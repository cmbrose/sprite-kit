import * as core from '@actions/core';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  Sprite,
  ListSpritesResponse,
  Checkpoint,
  CreateSpriteOptions,
  CreateCheckpointOptions,
  ExecOptions,
  ExecResult,
  ApiError,
} from './types';

const DEFAULT_API_URL = 'https://api.sprites.dev/v1';
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TRANSIENT_ERROR_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Sprites API client
 * 
 * All endpoints use sprite NAME (not ID) in the path according to API spec.
 * Implements retry logic for transient errors only.
 */
export class SpritesClient {
  private readonly apiUrl: string;
  private readonly token: string;

  constructor(token: string, apiUrl?: string) {
    this.token = token;
    this.apiUrl = apiUrl || DEFAULT_API_URL;
    core.setSecret(token);
  }

  /**
   * Create a new sprite or retrieve existing one by name
   * GET /v1/sprites/{name} - returns 404 if not found (no retry)
   * POST /v1/sprites - creates new sprite
   */
  async createOrGetSprite(options: CreateSpriteOptions): Promise<Sprite> {
    // Try to get existing sprite
    try {
      const sprite = await this.getSprite(options.name);
      core.info(`Found existing sprite: ${sprite.id}`);
      return sprite;
    } catch (error) {
      // If 404, sprite doesn't exist - create it
      if ((error as ApiError).status === 404) {
        core.debug(`Sprite not found, creating new one: ${options.name}`);
      } else {
        // Other errors (auth, network, etc) should bubble up
        throw error;
      }
    }

    // Create new sprite
    const sprite = await this.request<Sprite>({
      method: 'POST',
      path: '/sprites',
      body: { name: options.name },
    });
    core.info(`Created new sprite: ${sprite.id}`);
    return sprite;
  }

  /**
   * Get a sprite by name
   * GET /v1/sprites/{name}
   * Returns 404 if not found - no retry
   */
  async getSprite(spriteName: string): Promise<Sprite> {
    return this.request<Sprite>({
      method: 'GET',
      path: `/sprites/${encodeURIComponent(spriteName)}`,
      skipRetryOn404: true,
    });
  }

  /**
   * Delete a sprite by name
   * DELETE /v1/sprites/{name}
   * Returns 204 on success
   */
  async deleteSprite(spriteName: string): Promise<void> {
    await this.request<void>({
      method: 'DELETE',
      path: `/sprites/${encodeURIComponent(spriteName)}`,
    });
    core.info(`Deleted sprite: ${spriteName}`);
  }

  /**
   * List sprites with optional prefix filter
   * GET /v1/sprites?prefix={prefix}
   */
  async listSprites(namePrefix?: string): Promise<ListSpritesResponse> {
    let path = '/sprites';
    if (namePrefix) {
      path += `?prefix=${encodeURIComponent(namePrefix)}`;
    }
    return this.request<ListSpritesResponse>({
      method: 'GET',
      path,
    });
  }

  /**
   * List checkpoints for a sprite
   * GET /v1/sprites/{name}/checkpoints
   */
  async listCheckpoints(spriteName: string): Promise<Checkpoint[]> {
    return this.request<Checkpoint[]>({
      method: 'GET',
      path: `/sprites/${encodeURIComponent(spriteName)}/checkpoints`,
    });
  }

  /**
   * Get a specific checkpoint
   * GET /v1/sprites/{name}/checkpoints/{checkpoint_id}
   */
  async getCheckpoint(spriteName: string, checkpointId: string): Promise<Checkpoint> {
    return this.request<Checkpoint>({
      method: 'GET',
      path: `/sprites/${encodeURIComponent(spriteName)}/checkpoints/${encodeURIComponent(checkpointId)}`,
      skipRetryOn404: true,
    });
  }

  /**
   * Create a checkpoint
   * POST /v1/sprites/{name}/checkpoint (singular!)
   * Note: Returns streaming NDJSON but we only care about the final result
   */
  /**
   * Create a checkpoint with streaming progress
   * POST /v1/sprites/{name}/checkpoint
   * Returns streaming NDJSON with progress events
   */
  async createCheckpoint(options: CreateCheckpointOptions): Promise<Checkpoint> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.apiUrl}/sprites/${encodeURIComponent(options.spriteName)}/checkpoint`);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestBody = JSON.stringify({ comment: options.comment });
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
        timeout: 300000, // 5 minute timeout for checkpoint creation
      };

      let checkpointId = '';
      let createTime = '';

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
              req: {
                method: 'POST',
                path: url.pathname,
              },
            } as ApiError);
          });
          return;
        }

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'info') {
                core.info(event.data);
              } else if (event.type === 'complete') {
                // Extract checkpoint ID from message like "Checkpoint v8 created"
                const match = event.data.match(/Checkpoint (\S+) created/);
                if (match) {
                  checkpointId = match[1];
                  createTime = event.time;
                }
                core.info(event.data);
              } else if (event.type === 'error') {
                reject({
                  message: event.error,
                  req: {
                    method: 'POST',
                    path: url.pathname,
                  },
                } as ApiError);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        });

        res.on('end', () => {
          if (checkpointId) {
            core.info(`Created checkpoint: ${checkpointId}`);
            resolve({
              id: checkpointId,
              create_time: createTime,
              comment: options.comment,
            });
          } else {
            reject({
              message: 'Failed to parse checkpoint creation response',
              req: {
                method: 'POST',
                path: url.pathname,
              },
            } as ApiError);
          }
        });

        res.on('error', reject);
      });

      req.on('error', (error: NodeJS.ErrnoException) => {
        reject({
          message: error.message,
          code: error.code,
          req: {
            method: 'POST',
            path: url.pathname,
          },
        } as ApiError);
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          message: 'Request timeout',
          code: 'TIMEOUT',
          req: {
            method: 'POST',
            path: url.pathname,
          },
        } as ApiError);
      });

      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Restore from a checkpoint with streaming progress
   * POST /v1/sprites/{name}/checkpoints/{checkpoint_id}/restore
   * Returns streaming NDJSON with progress events
   */
  async restoreCheckpoint(spriteName: string, checkpointId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(
        `${this.apiUrl}/sprites/${encodeURIComponent(spriteName)}/checkpoints/${encodeURIComponent(checkpointId)}/restore`
      );
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const requestOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/x-ndjson',
        },
        timeout: 300000, // 5 minute timeout for restore
      };

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
              req: {
                method: 'POST',
                path: url.pathname,
              },
            } as ApiError);
          });
          return;
        }

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'info') {
                core.info(event.data);
              } else if (event.type === 'complete') {
                core.info(event.data);
              } else if (event.type === 'error') {
                reject({
                  message: event.error,
                  req: {
                    method: 'POST',
                    path: url.pathname,
                  },
                } as ApiError);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        });

        res.on('end', () => {
          core.info(`Restored sprite ${spriteName} from checkpoint ${checkpointId}`);
          resolve();
        });

        res.on('error', reject);
      });

      req.on('error', (error: NodeJS.ErrnoException) => {
        reject({
          message: error.message,
          code: error.code,
          req: {
            method: 'POST',
            path: url.pathname,
          },
        } as ApiError);
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          message: 'Request timeout',
          code: 'TIMEOUT',
          req: {
            method: 'POST',
            path: url.pathname,
          },
        } as ApiError);
      });

      req.end();
    });
  }

  /**
   * Execute a command in a sprite with streaming output
   * POST /v1/sprites/{name}/exec
   * Returns streaming NDJSON with stdout/stderr/exit events
   */
  async exec(options: ExecOptions): Promise<ExecResult> {
    const { spriteName, command, workdir, env } = options;
    
    core.info(`Executing command in sprite ${spriteName}`);
    core.debug(`Command: ${command}`);

    return this.execWithStreaming(spriteName, {
      command,
      workdir,
      env,
    });
  }

  /**
   * Execute command with streaming stdout/stderr via NDJSON
   */
  private async execWithStreaming(
    spriteName: string,
    body: { command: string; workdir?: string; env?: Record<string, string> }
  ): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.apiUrl}/sprites/${encodeURIComponent(spriteName)}/exec`);
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
              req: {
                method: 'POST',
                path: url.pathname,
              },
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

      req.on('error', (error: NodeJS.ErrnoException) => {
        reject({
          message: error.message,
          code: error.code,
          req: {
            method: 'POST',
            path: url.pathname,
          },
        } as ApiError);
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          message: 'Request timeout',
          code: 'TIMEOUT',
          req: {
            method: 'POST',
            path: url.pathname,
          },
        } as ApiError);
      });

      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Make an HTTP request with retry logic
   * Retries on transient errors (5xx, 429, timeouts, network errors)
   * Does NOT retry on 4xx errors (except 408, 429)
   */
  private async request<T>(options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
    skipRetryOn404?: boolean;
  }, retries = 0): Promise<T> {
    try {
      return await this.doRequest<T>(options);
    } catch (error) {
      const apiError = error as ApiError;

      // Never retry 404 on specific GET requests
      if (options.skipRetryOn404 && apiError.status === 404) {
        throw error;
      }

      // Check if error is retryable
      const isTransientError = TRANSIENT_ERROR_CODES.includes(apiError.status || 0);
      const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'TIMEOUT', 'ENOTFOUND'].includes(apiError.code || '');
      
      if (retries < MAX_RETRIES && (isTransientError || isNetworkError)) {
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
  private doRequest<T>(options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    body?: unknown;
  }): Promise<T> {
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
        timeout: DEFAULT_TIMEOUT,
      };

      const req = httpModule.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk.toString();
        });

        res.on('end', () => {
          // Handle error status codes
          if (res.statusCode && res.statusCode >= 400) {
            let message = `Request failed with status ${res.statusCode}`;
            try {
              const errorBody = JSON.parse(data);
              message = errorBody.message || errorBody.error || message;
            } catch {
              message = data || message;
            }
            reject({ 
              message, 
              status: res.statusCode,
              req: {
                method: options.method,
                path: options.path,
              }
            } as ApiError);
            return;
          }

          // Handle empty response (like 204 No Content)
          if (!data) {
            resolve(undefined as T);
            return;
          }

          // Parse JSON response
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            // If not JSON, return as string
            resolve(data as unknown as T);
          }
        });

        res.on('error', reject);
      });

      req.on('error', (error: NodeJS.ErrnoException) => {
        reject({ 
          message: error.message, 
          code: error.code,
          req: {
            method: options.method,
            path: options.path,
          }
        } as ApiError);
      });

      req.on('timeout', () => {
        req.destroy();
        reject({ 
          message: 'Request timeout', 
          code: 'TIMEOUT',
          req: {
            method: options.method,
            path: options.path,
          }
        } as ApiError);
      });

      if (requestBody) {
        req.write(requestBody);
      }
      req.end();
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
