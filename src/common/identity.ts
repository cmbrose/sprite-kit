import * as crypto from 'crypto';
import { GitHubContext, CheckpointMetadata } from './types';

const MAX_SPRITE_NAME_LENGTH = 128;
const HASH_LENGTH = 8;

/**
 * Characters allowed in sprite names
 */
const ALLOWED_CHARS = /[^a-z0-9-]/g;

/**
 * Normalize a string for use in sprite name
 * - Convert to lowercase
 * - Replace non-alphanumeric chars with hyphens
 * - Collapse multiple hyphens
 * - Trim leading/trailing hyphens
 */
function normalizeForSpriteName(input: string): string {
  return input
    .toLowerCase()
    .replace(ALLOWED_CHARS, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Compute a short hash of a string
 */
function shortHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, HASH_LENGTH);
}

/**
 * Derive a deterministic sprite name from GitHub context
 * Format: gh-{owner}-{repo}-{workflow}-{run_id}-{job}-{matrixHash}
 */
export function deriveSpriteNameFromContext(context: GitHubContext): string {
  const parts = [
    'gh',
    normalizeForSpriteName(context.owner),
    normalizeForSpriteName(context.repo),
    normalizeForSpriteName(context.workflow),
    context.runId,
    normalizeForSpriteName(context.job),
  ];

  // Add matrix hash if matrix is present
  if (context.matrix && Object.keys(context.matrix).length > 0) {
    const matrixStr = JSON.stringify(context.matrix, Object.keys(context.matrix).sort());
    parts.push(shortHash(matrixStr));
  }

  let name = parts.join('-');

  // Truncate if too long, preserving uniqueness with hash suffix
  if (name.length > MAX_SPRITE_NAME_LENGTH) {
    const hash = shortHash(name);
    const maxBaseLength = MAX_SPRITE_NAME_LENGTH - hash.length - 1;
    name = name.substring(0, maxBaseLength) + '-' + hash;
  }

  return name;
}

/**
 * Derive a job key from GitHub context
 * Used for checkpoint matching within a run
 */
export function deriveJobKey(context: GitHubContext): string {
  const parts = [context.job];

  if (context.matrix && Object.keys(context.matrix).length > 0) {
    const matrixStr = JSON.stringify(context.matrix, Object.keys(context.matrix).sort());
    parts.push(shortHash(matrixStr));
  }

  return parts.join('-');
}

/**
 * Format checkpoint comment with metadata
 * Format: ghrun={run_id};job={job_key};step={step_key}
 */
export function formatCheckpointComment(
  runId: string,
  jobKey: string,
  stepKey: string
): string {
  return `ghrun=${runId};job=${jobKey};step=${stepKey}`;
}

/**
 * Parse checkpoint comment to extract metadata
 */
export function parseCheckpointComment(comment: string | undefined): CheckpointMetadata | null {
  if (!comment) return null;

  const runIdMatch = comment.match(/ghrun=([^;]+)/);
  const jobKeyMatch = comment.match(/job=([^;]+)/);
  const stepKeyMatch = comment.match(/step=([^;]+)/);

  if (!runIdMatch || !jobKeyMatch || !stepKeyMatch) {
    return null;
  }

  return {
    runId: runIdMatch[1],
    jobKey: jobKeyMatch[1],
    stepKey: stepKeyMatch[1],
  };
}

/**
 * Find checkpoint for a specific step in the current run
 */
export function findCheckpointForStep(
  checkpoints: Array<{ id: string; comment?: string }>,
  runId: string,
  jobKey: string,
  stepKey: string
): string | null {
  for (const checkpoint of checkpoints) {
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
 * Find the last successful checkpoint for a job in the current run
 */
export function findLastCheckpointForJob(
  checkpoints: Array<{ id: string; comment?: string; create_time: string }>,
  runId: string,
  jobKey: string
): string | null {
  // Sort by creation time descending
  const sorted = [...checkpoints].sort(
    (a, b) => new Date(b.create_time).getTime() - new Date(a.create_time).getTime()
  );

  for (const checkpoint of sorted) {
    const metadata = parseCheckpointComment(checkpoint.comment);
    if (metadata && metadata.runId === runId && metadata.jobKey === jobKey) {
      return checkpoint.id;
    }
  }
  return null;
}
