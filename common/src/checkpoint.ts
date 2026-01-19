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
export function formatCheckpointComment(metadata: CheckpointMetadata): string {
    return `ghrun=${metadata.runId};job=${metadata.jobKey};step=${metadata.stepKey}`;
}

/**
 * Parse checkpoint comment to extract metadata
 * Returns undefined if the comment doesn't match the expected format
 */
export function parseCheckpointComment(comment: string): CheckpointMetadata | undefined {
    const pattern = /ghrun=([^;]+);job=([^;]+);step=(.+)/;
    const match = comment.match(pattern);

    if (!match) {
        return undefined;
    }

    return {
        runId: match[1],
        jobKey: match[2],
        stepKey: match[3],
    };
}

/**
 * Check if a checkpoint comment matches the given criteria
 */
export function matchesCheckpoint(
    comment: string,
    criteria: Partial<CheckpointMetadata>
): boolean {
    const metadata = parseCheckpointComment(comment);
    if (!metadata) {
        return false;
    }

    if (criteria.runId && metadata.runId !== criteria.runId) {
        return false;
    }

    if (criteria.jobKey && metadata.jobKey !== criteria.jobKey) {
        return false;
    }

    if (criteria.stepKey && metadata.stepKey !== criteria.stepKey) {
        return false;
    }

    return true;
}


/** 
 * Find the last successful checkpoint for a job in the current run 
 */
export function findLastCheckpointForJob(
    checkpoints: Array<Checkpoint>,
    runId: string,
    jobKey: string
): string | null {
    // Sort by creation time descending  
    const sorted = [...checkpoints].sort((a, b) =>
        new Date(b.createTime).getTime() - new Date(a.createTime).getTime()
    );

    for (const checkpoint of sorted) {
        if (!checkpoint.comment) {
            continue;
        }

        const metadata = parseCheckpointComment(checkpoint.comment);
        if (metadata && metadata.runId === runId && metadata.jobKey === jobKey) {
            return checkpoint.id;
        }
    }

    return null;
}