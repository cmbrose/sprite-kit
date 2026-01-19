import { Sprite, ListSpritesResponse, Checkpoint, CreateSpriteOptions, CreateCheckpointOptions, ExecOptions, ExecResult } from './types';
/**
 * Sprites API client with automatic retry for transient errors
 */
export declare class SpritesClient {
    private readonly apiUrl;
    private readonly token;
    constructor(token: string, apiUrl?: string);
    /**
     * Create a new sprite or retrieve existing one by name
     */
    createOrGetSprite(options: CreateSpriteOptions): Promise<Sprite>;
    /**
     * Get a sprite by name
     */
    getSprite(spriteName: string): Promise<Sprite>;
    /**
     * List checkpoints for a sprite
     */
    listCheckpoints(spriteName: string): Promise<Checkpoint[]>;
    /**
     * Get checkpoint by name
     */
    getCheckpoint(spriteName: string, checkpointId: string): Promise<Checkpoint>;
    /**
     * Create a new checkpoint using POST /v1/sprites/{name}/checkpoint
     */
    createCheckpoint(options: CreateCheckpointOptions): Promise<Checkpoint>;
    /**
     * Restore a sprite from a checkpoint
     */
    restoreCheckpoint(spriteName: string, checkpointId: string): Promise<void>;
    /**
     * Execute a command in a sprite with streaming output
     */
    exec(options: ExecOptions): Promise<ExecResult>;
    /**
     * Execute command with streaming stdout/stderr
     */
    private execWithStreaming;
    /**
     * Delete a sprite by name
     */
    deleteSprite(spriteName: string): Promise<void>;
    /**
     * List all sprites, optionally filtered by name prefix
     */
    listSprites(namePrefix?: string): Promise<ListSpritesResponse>;
    /**
     * Make an HTTP request with retry logic
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