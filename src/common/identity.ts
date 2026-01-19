import crypto from 'crypto';
import { context } from '@actions/github';
import { GitHubContext } from './types';

/**
 * Normalize a string to be suitable for use in a sprite name
 * - Convert to lowercase
 * - Replace invalid characters with hyphens
 * - Remove consecutive hyphens
 * - Trim hyphens from start/end
 */
export function normalizeNamePart(part: string): string {
    return part
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Generate a hash from a string
 */
export function hashString(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 8);
}

/**
 * Derive a matrix discriminator from GitHub context
 */
export function deriveMatrixKey(): string | undefined {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matrix = context.job ? (context as any).matrix : undefined;
    if (!matrix || Object.keys(matrix).length === 0) {
        return undefined;
    }

    // Sort keys for consistent ordering
    const sortedKeys = Object.keys(matrix).sort();
    const matrixStr = sortedKeys.map(k => `${k}=${matrix[k]}`).join(',');
    return hashString(matrixStr);
}

/**
 * Generate a sprite name from GitHub context and options
 * Format: gh-{owner}-{repo}-{workflow}-{run_id}-{job}-{matrixHash}
 * 
 * If the name would be too long, parts are truncated and a hash suffix is added
 */
export function generateSpriteName(context: GitHubContext): string {
    const parts = [
        'gh',
        normalizeNamePart(context.owner),
        normalizeNamePart(context.repo),
        normalizeNamePart(context.workflow),
        context.runId,
        normalizeNamePart(context.job),
    ];

    if (context.matrix && Object.keys(context.matrix).length > 0) {
        const matrixStr = JSON.stringify(context.matrix, Object.keys(context.matrix).sort());
        parts.push(hashString(matrixStr));
    }

    let spriteName = parts.join('-');

    // Sprite names have a max length (typically 63 chars for DNS compliance)
    // If too long, truncate and add a hash suffix for uniqueness
    const MAX_LENGTH = 63;
    if (spriteName.length > MAX_LENGTH) {
        const hash = hashString(spriteName);
        const maxBaseLength = MAX_LENGTH - hash.length - 1; // -1 for the hyphen
        spriteName = `${spriteName.slice(0, maxBaseLength)}-${hash}`;
    }

    return spriteName;
}

/**
 * Derive a job key from GitHub context
 * Used for checkpoint matching within a run
 */
export function deriveJobKey(context: GitHubContext): string {
    const parts = [context.job];

    if (context.matrix && Object.keys(context.matrix).length > 0) {
        const matrixStr = JSON.stringify(context.matrix, Object.keys(context.matrix).sort());
        parts.push(hashString(matrixStr));
    }

    return parts.join('-');
}
