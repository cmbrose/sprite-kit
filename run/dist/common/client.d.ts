import { Sprite, Checkpoint, CreateSpriteOptions, CreateCheckpointOptions, ExecOptions, ExecResult } from './types';
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
    getSpriteByName(name: string): Promise<Sprite | null>;
    /**
     * Get a sprite by ID or name
     */
    getSprite(spriteId: string): Promise<Sprite>;
    /**
     * List checkpoints for a sprite
     */
    listCheckpoints(spriteId: string): Promise<Checkpoint[]>;
    /**
     * Get checkpoint by ID
     */
    getCheckpoint(spriteId: string, checkpointId: string): Promise<Checkpoint>;
    /**
     * Create a new checkpoint
     */
    createCheckpoint(options: CreateCheckpointOptions): Promise<Checkpoint>;
    /**
     * Restore a sprite from a checkpoint
     */
    restoreCheckpoint(spriteId: string, checkpointId: string): Promise<void>;
    /**
     * Execute a command in a sprite with streaming output
     */
    exec(options: ExecOptions): Promise<ExecResult>;
    /**
     * Execute command with streaming stdout/stderr
     */
    private execWithStreaming;
    /**
     * Make an HTTP request with retry logic
     */
    private request;
    /**
     * Execute HTTP request
     */
    private doRequest;
    /**
     * Delete a sprite by ID
     */
    deleteSprite(spriteId: string): Promise<void>;
    /**
     * List all sprites, optionally filtered by name prefix
     */
    listSprites(namePrefix?: string): Promise<Sprite[]>;
    /**
     * Sleep for specified milliseconds
     */
    private sleep;
}
//# sourceMappingURL=client.d.ts.map