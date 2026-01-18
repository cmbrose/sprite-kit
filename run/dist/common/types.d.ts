/**
 * Represents a Sprite instance
 */
export interface Sprite {
    id: string;
    name: string;
    status: 'running' | 'stopped' | 'creating' | 'error';
    createdAt: string;
    updatedAt: string;
}
/**
 * Represents a checkpoint for a Sprite
 */
export interface Checkpoint {
    id: string;
    spriteId: string;
    comment?: string;
    createdAt: string;
    size?: number;
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