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