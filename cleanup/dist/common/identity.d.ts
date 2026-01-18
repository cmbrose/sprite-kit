import { GitHubContext, CheckpointMetadata } from './types';
/**
 * Derive a deterministic sprite name from GitHub context
 * Format: gh-{owner}-{repo}-{workflow}-{run_id}-{job}-{matrixHash}
 */
export declare function deriveSpriteNameFromContext(context: GitHubContext): string;
/**
 * Derive a job key from GitHub context
 * Used for checkpoint matching within a run
 */
export declare function deriveJobKey(context: GitHubContext): string;
/**
 * Format checkpoint comment with metadata
 * Format: ghrun={run_id};job={job_key};step={step_key}
 */
export declare function formatCheckpointComment(runId: string, jobKey: string, stepKey: string): string;
/**
 * Parse checkpoint comment to extract metadata
 */
export declare function parseCheckpointComment(comment: string | undefined): CheckpointMetadata | null;
/**
 * Find checkpoint for a specific step in the current run
 */
export declare function findCheckpointForStep(checkpoints: Array<{
    id: string;
    comment?: string;
}>, runId: string, jobKey: string, stepKey: string): string | null;
/**
 * Find the last successful checkpoint for a job in the current run
 */
export declare function findLastCheckpointForJob(checkpoints: Array<{
    id: string;
    comment?: string;
    create_time: string;
}>, runId: string, jobKey: string): string | null;
//# sourceMappingURL=identity.d.ts.map