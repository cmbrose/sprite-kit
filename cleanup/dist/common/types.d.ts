/**
 * Represents a Sprite instance
 */
export interface Sprite {
    id: string;
    name: string;
    organization: string;
    url: string;
    url_settings: {
        auth?: 'sprite' | 'public';
    };
    status: 'cold' | 'warm' | 'running';
    created_at: string;
    updated_at: string;
}
/**
 * Sprite entry from list response
 */
export interface SpriteEntry {
    name: string;
    org_slug: string;
    updated_at?: string;
}
/**
 * List sprites response
 */
export interface ListSpritesResponse {
    sprites: SpriteEntry[];
    has_more: boolean;
    next_continuation_token?: string;
}
/**
 * Represents a checkpoint for a Sprite
 */
export interface Checkpoint {
    id: string;
    create_time: string;
    source_id?: string;
    comment?: string;
}
/**
 * Parsed checkpoint metadata from comment
 */
export interface CheckpointMetadata {
    runId: string;
    jobKey: string;
    stepKey: string;
}
/**
 * Command execution result
 */
export interface ExecResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}
/**
 * Options for creating a sprite
 */
export interface CreateSpriteOptions {
    name: string;
    image?: string;
}
/**
 * Options for creating a checkpoint
 */
export interface CreateCheckpointOptions {
    spriteId: string;
    comment?: string;
}
/**
 * Options for executing a command
 */
export interface ExecOptions {
    spriteId: string;
    command: string;
    workdir?: string;
    env?: Record<string, string>;
}
/**
 * API error response
 */
export interface ApiError {
    message: string;
    code?: string;
    status?: number;
}
/**
 * GitHub context for identity derivation
 */
export interface GitHubContext {
    owner: string;
    repo: string;
    workflow: string;
    runId: string;
    job: string;
    matrix?: Record<string, unknown>;
}
/**
 * Init action inputs
 */
export interface InitInputs {
    token?: string;
    apiUrl?: string;
    jobKey?: string;
    matrixJson?: string;
}
/**
 * Init action outputs
 */
export interface InitOutputs {
    spriteName: string;
    spriteId: string;
    jobKey: string;
    runId: string;
    lastCheckpointId: string;
    needsRestore: boolean;
}
/**
 * Run action inputs
 */
export interface RunInputs {
    stepKey: string;
    run: string;
    token?: string;
    apiUrl?: string;
    spriteId: string;
    jobKey: string;
    runId: string;
    lastCheckpointId?: string;
    workdir?: string;
}
/**
 * Run action outputs
 */
export interface RunOutputs {
    skipped: boolean;
    checkpointId: string;
    restored: boolean;
    exitCode: number;
}
//# sourceMappingURL=types.d.ts.map