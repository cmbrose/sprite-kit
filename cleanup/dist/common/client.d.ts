import { Sprite, ListSpritesResponse, Checkpoint, CreateSpriteOptions, CreateCheckpointOptions, ExecOptions, ExecResult } from './types';
/**
 * Sprites API client
 *
 * All endpoints use sprite NAME (not ID) in the path according to API spec.
 * Implements retry logic for transient errors only.
 */
export declare class SpritesClient {
    private readonly apiUrl;
    private readonly token;
    constructor(token: string, apiUrl?: string);
    /**
     * Create a new sprite or retrieve existing one by name
     * GET /v1/sprites/{name} - returns 404 if not found (no retry)
     * POST /v1/sprites - creates new sprite
     */
    createOrGetSprite(options: CreateSpriteOptions): Promise<Sprite>;
    /**
     * Get a sprite by name
     * GET /v1/sprites/{name}
     * Returns 404 if not found - no retry
     */
    getSprite(spriteName: string): Promise<Sprite>;
    /**
     * Delete a sprite by name
     * DELETE /v1/sprites/{name}
     * Returns 204 on success
     */
    deleteSprite(spriteName: string): Promise<void>;
    /**
     * List sprites with optional prefix filter
     * GET /v1/sprites?prefix={prefix}
     */
    listSprites(namePrefix?: string): Promise<ListSpritesResponse>;
    /**
     * List checkpoints for a sprite
     * GET /v1/sprites/{name}/checkpoints
     */
    listCheckpoints(spriteName: string): Promise<Checkpoint[]>;
    /**
     * Get a specific checkpoint
     * GET /v1/sprites/{name}/checkpoints/{checkpoint_id}
     */
    getCheckpoint(spriteName: string, checkpointId: string): Promise<Checkpoint>;
    /**
     * Create a checkpoint
     * POST /v1/sprites/{name}/checkpoint (singular!)
     * Note: Returns streaming NDJSON but we only care about the final result
     */
    createCheckpoint(options: CreateCheckpointOptions): Promise<Checkpoint>;
    /**
     * Restore from a checkpoint
     * POST /v1/sprites/{name}/checkpoints/{checkpoint_id}/restore
     * Returns streaming NDJSON
     */
    restoreCheckpoint(spriteName: string, checkpointId: string): Promise<void>;
    /**
     * Execute a command in a sprite
     * POST /v1/sprites/{name}/exec?cmd={cmd}&dir={dir}
     */
    exec(options: ExecOptions): Promise<ExecResult>;
    /**
     * Make an HTTP request with retry logic
     * Retries on transient errors (5xx, 429, timeouts, network errors)
     * Does NOT retry on 4xx errors (except 408, 429)
     */
    private request;
    /**
     * Execute HTTP request
     */
    private doRequest;
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
}
//# sourceMappingURL=client.d.ts.map