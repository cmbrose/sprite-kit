import { GitHubContext } from './types';
/**
 * Normalize a string to be suitable for use in a sprite name
 * - Convert to lowercase
 * - Replace invalid characters with hyphens
 * - Remove consecutive hyphens
 * - Trim hyphens from start/end
 */
export declare function normalizeNamePart(part: string): string;
/**
 * Generate a hash from a string
 */
export declare function hashString(input: string): string;
/**
 * Derive a matrix discriminator from GitHub context
 */
export declare function deriveMatrixKey(): string | undefined;
/**
 * Generate a sprite name from GitHub context and options
 * Format: gh-{owner}-{repo}-{workflow}-{run_id}-{job}-{matrixHash}
 *
 * If the name would be too long, parts are truncated and a hash suffix is added
 */
export declare function generateSpriteName(context: GitHubContext): string;
/**
 * Derive a job key from GitHub context
 * Used for checkpoint matching within a run
 */
export declare function deriveJobKey(context: GitHubContext): string;
//# sourceMappingURL=identity.d.ts.map