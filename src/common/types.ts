
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
    runAttempt: number;
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
    spriteName: string;
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

/**
 * Clean action inputs
 */
export interface CleanInputs {
    token?: string;
    apiUrl?: string;
    maxAge: number;
    dryRun: boolean;
    spritePrefix?: string;
    mode?: 'global' | 'current';
    spriteName?: string;
}

/**
 * Clean action outputs
 */
export interface CleanOutputs {
    spritesCleaned: number;
    spritesFound: number;
    dryRun: boolean;
    mode: 'global' | 'current';
}