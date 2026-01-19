import { Checkpoint } from '@fly/sprites';
/**
 * Checkpoint comment format and parsing utilities
 */
export interface CheckpointMetadata {
    runId: string;
    jobKey: string;
    stepKey: string;
}
/**
 * Format checkpoint metadata into a comment string
 * Format: ghrun={run_id};job={job_key};step={step_key}
 */
export declare function formatCheckpointComment(metadata: CheckpointMetadata): string;
/**
 * Parse checkpoint comment to extract metadata
 * Returns undefined if the comment doesn't match the expected format
 */
export declare function parseCheckpointComment(comment: string): CheckpointMetadata | undefined;
/**
 * Check if a checkpoint comment matches the given criteria
 */
export declare function matchesCheckpoint(comment: string, criteria: Partial<CheckpointMetadata>): boolean;
/**
 * Find the last successful checkpoint for a job in the current run
 */
export declare function findLastCheckpointForJob(checkpoints: Array<Checkpoint>, runId: string, jobKey: string): string | null;
//# sourceMappingURL=checkpoint.d.ts.map