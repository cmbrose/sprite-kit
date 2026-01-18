import {
  deriveSpriteNameFromContext,
  deriveJobKey,
  formatCheckpointComment,
  parseCheckpointComment,
  findCheckpointForStep,
  findLastCheckpointForJob,
} from './identity';
import { GitHubContext } from './types';

describe('deriveSpriteNameFromContext', () => {
  it('should derive sprite name from context without matrix', () => {
    const context: GitHubContext = {
      owner: 'my-org',
      repo: 'my-repo',
      workflow: 'CI',
      runId: '12345',
      job: 'build',
    };

    const name = deriveSpriteNameFromContext(context);
    expect(name).toBe('gh-my-org-my-repo-ci-12345-build');
  });

  it('should include matrix hash when matrix is present', () => {
    const context: GitHubContext = {
      owner: 'my-org',
      repo: 'my-repo',
      workflow: 'CI',
      runId: '12345',
      job: 'build',
      matrix: { node: 18, os: 'ubuntu' },
    };

    const name = deriveSpriteNameFromContext(context);
    expect(name).toMatch(/^gh-my-org-my-repo-ci-12345-build-[a-f0-9]{8}$/);
  });

  it('should normalize special characters', () => {
    const context: GitHubContext = {
      owner: 'My_Org',
      repo: 'My.Repo',
      workflow: 'CI/CD Pipeline',
      runId: '12345',
      job: 'build & test',
    };

    const name = deriveSpriteNameFromContext(context);
    expect(name).toBe('gh-my-org-my-repo-ci-cd-pipeline-12345-build-test');
  });

  it('should truncate long names with hash suffix', () => {
    const context: GitHubContext = {
      owner: 'very-long-organization-name-that-exceeds-limits',
      repo: 'extremely-long-repository-name-for-testing',
      workflow: 'continuous-integration-and-delivery-pipeline',
      runId: '1234567890',
      job: 'build-test-lint-format-and-deploy',
    };

    const name = deriveSpriteNameFromContext(context);
    expect(name.length).toBeLessThanOrEqual(128);
    // Should end with a hash
    expect(name).toMatch(/-[a-f0-9]{8}$/);
  });

  it('should produce consistent names for same input', () => {
    const context: GitHubContext = {
      owner: 'my-org',
      repo: 'my-repo',
      workflow: 'CI',
      runId: '12345',
      job: 'build',
      matrix: { node: 18 },
    };

    const name1 = deriveSpriteNameFromContext(context);
    const name2 = deriveSpriteNameFromContext(context);
    expect(name1).toBe(name2);
  });

  it('should produce different names for different matrix values', () => {
    const context1: GitHubContext = {
      owner: 'my-org',
      repo: 'my-repo',
      workflow: 'CI',
      runId: '12345',
      job: 'build',
      matrix: { node: 18 },
    };

    const context2: GitHubContext = {
      ...context1,
      matrix: { node: 20 },
    };

    const name1 = deriveSpriteNameFromContext(context1);
    const name2 = deriveSpriteNameFromContext(context2);
    expect(name1).not.toBe(name2);
  });
});

describe('deriveJobKey', () => {
  it('should derive job key without matrix', () => {
    const context: GitHubContext = {
      owner: 'my-org',
      repo: 'my-repo',
      workflow: 'CI',
      runId: '12345',
      job: 'build',
    };

    const key = deriveJobKey(context);
    expect(key).toBe('build');
  });

  it('should include matrix hash when matrix is present', () => {
    const context: GitHubContext = {
      owner: 'my-org',
      repo: 'my-repo',
      workflow: 'CI',
      runId: '12345',
      job: 'build',
      matrix: { node: 18 },
    };

    const key = deriveJobKey(context);
    expect(key).toMatch(/^build-[a-f0-9]{8}$/);
  });
});

describe('formatCheckpointComment', () => {
  it('should format comment with all metadata', () => {
    const comment = formatCheckpointComment('12345', 'build', 'install');
    expect(comment).toBe('ghrun=12345;job=build;step=install');
  });
});

describe('parseCheckpointComment', () => {
  it('should parse valid comment', () => {
    const metadata = parseCheckpointComment('ghrun=12345;job=build;step=install');
    expect(metadata).toEqual({
      runId: '12345',
      jobKey: 'build',
      stepKey: 'install',
    });
  });

  it('should return null for undefined comment', () => {
    const metadata = parseCheckpointComment(undefined);
    expect(metadata).toBeNull();
  });

  it('should return null for invalid comment', () => {
    const metadata = parseCheckpointComment('invalid comment');
    expect(metadata).toBeNull();
  });

  it('should return null for partial comment', () => {
    const metadata = parseCheckpointComment('ghrun=12345;job=build');
    expect(metadata).toBeNull();
  });
});

describe('findCheckpointForStep', () => {
  const checkpoints = [
    { id: 'cp1', comment: 'ghrun=12345;job=build;step=install' },
    { id: 'cp2', comment: 'ghrun=12345;job=build;step=build' },
    { id: 'cp3', comment: 'ghrun=12345;job=test;step=install' },
    { id: 'cp4', comment: 'ghrun=99999;job=build;step=install' },
  ];

  it('should find matching checkpoint', () => {
    const id = findCheckpointForStep(checkpoints, '12345', 'build', 'install');
    expect(id).toBe('cp1');
  });

  it('should return null when no match found', () => {
    const id = findCheckpointForStep(checkpoints, '12345', 'build', 'test');
    expect(id).toBeNull();
  });

  it('should not match different run ID', () => {
    const id = findCheckpointForStep(checkpoints, '99998', 'build', 'install');
    expect(id).toBeNull();
  });

  it('should not match different job', () => {
    const id = findCheckpointForStep(checkpoints, '12345', 'deploy', 'install');
    expect(id).toBeNull();
  });
});

describe('findLastCheckpointForJob', () => {
  const checkpoints = [
    { id: 'cp1', comment: 'ghrun=12345;job=build;step=install', createdAt: '2024-01-01T10:00:00Z' },
    { id: 'cp2', comment: 'ghrun=12345;job=build;step=build', createdAt: '2024-01-01T11:00:00Z' },
    { id: 'cp3', comment: 'ghrun=12345;job=test;step=install', createdAt: '2024-01-01T12:00:00Z' },
    { id: 'cp4', comment: 'ghrun=99999;job=build;step=install', createdAt: '2024-01-01T13:00:00Z' },
  ];

  it('should find the most recent checkpoint for job', () => {
    const id = findLastCheckpointForJob(checkpoints, '12345', 'build');
    expect(id).toBe('cp2');
  });

  it('should return null when no checkpoints for job', () => {
    const id = findLastCheckpointForJob(checkpoints, '12345', 'deploy');
    expect(id).toBeNull();
  });

  it('should not match different run ID', () => {
    const id = findLastCheckpointForJob(checkpoints, '11111', 'build');
    expect(id).toBeNull();
  });
});
