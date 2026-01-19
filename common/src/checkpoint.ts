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

/**
 * Find checkpoint for a specific step in the current run
 */
export function findCheckpointForStep(
    checkpoints: Array<Checkpoint>,
    runId: string,
    jobKey: string,
    stepKey: string
): string | null {
    for (const checkpoint of checkpoints) {
        if (!checkpoint.comment) {
            continue;
        }

        const metadata = parseCheckpointComment(checkpoint.comment);
        if (
            metadata &&
            metadata.runId === runId &&
            metadata.jobKey === jobKey &&
            metadata.stepKey === stepKey
        ) {
            return checkpoint.id;
        }
    }
    return null;
}

/**
 * Process checkpoint data stream and returns the version id
 */
export async function processCheckpointStream(stream: Response): Promise<string> {
    /**
    [
        {
            "data": "Creating checkpoint...",
            "time": "2026-01-05T10:30:00Z",
            "type": "info"
        },
        {
            "data": "Stopping services...",
            "time": "2026-01-05T10:30:00Z",
            "type": "info"
        },
        {
            "data": "Saving filesystem state...",
            "time": "2026-01-05T10:30:00Z",
            "type": "info"
        },
        {
            "data": "Checkpoint v8 created",
            "time": "2026-01-05T10:30:00Z",
            "type": "complete"
        }
    ]
    */

    if (!stream.body) {
        throw new Error('Stream body is null');
    }

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());

            for (const line of lines) {
                try {
                    const message = JSON.parse(line);

                    if (message.type === 'complete' && message.data) {
                        // Extract version from "Checkpoint v8 created" format
                        const match = message.data.match(/Checkpoint (v\d+) created/);
                        if (match) {
                            return match[1];
                        }
                    }
                } catch (e) {
                    // Skip invalid JSON lines
                    continue;
                }
            }
        }

        throw new Error('No checkpoint version found in stream');
    } finally {
        reader.releaseLock();
    }
}