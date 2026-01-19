# sprite-kit

GitHub Actions for persistent CI steps using Sprite checkpointing and restoration.

## Overview

sprite-kit enables persistent CI steps by leveraging Sprite checkpointing technology. When your workflow fails mid-execution and is re-run, completed steps are automatically skipped and execution resumes from the last successful checkpoint—saving time and compute resources.

## Quick Start

```yaml
name: Build and Test

on: [push, pull_request]

env:
  SPRITES_TOKEN: ${{ secrets.SPRITES_TOKEN }}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Initialize sprite for this job
      - name: Init Sprite
        id: sprite
        uses: cmbrose/sprite-kit/init@v1

      # Each step gets checkpointed on success
      - name: Install Dependencies
        uses: cmbrose/sprite-kit/run@v1
        with:
          step-key: install
          run: npm ci

      - name: Build
        uses: cmbrose/sprite-kit/run@v1
        with:
          step-key: build
          run: npm run build

      - name: Test
        uses: cmbrose/sprite-kit/run@v1
        with:
          step-key: test
          run: npm test

      # Clean up sprite after successful job completion
      - name: Clean up sprite
        if: success()  # Only clean up on success
        uses: cmbrose/sprite-kit/clean@v1
        # Automatically detects current workflow sprite from action state
```

## Core Concepts

### Sprite Identity

Each sprite is uniquely identified by a deterministic name derived from:
- Repository owner and name
- Workflow name
- Run ID
- Job name
- Matrix values (if applicable)

Format: `gh-{owner}-{repo}-{workflow}-{run_id}-{job}-{matrixHash}`

This ensures each job run gets its own isolated sprite instance.

### Checkpoint Metadata

Checkpoints are tagged with structured metadata:
```
ghrun={run_id};job={job_key};step={step_key}
```

This enables precise step matching across workflow reruns.

### Skip Logic

When a step's `step-key` matches an existing checkpoint for the current run and job, execution is skipped. This happens automatically on workflow reruns.

### Restore Logic

On reruns, the run action automatically restores from the last successful checkpoint before executing. This ensures the sprite state matches where the previous run left off.

## Actions

### Init Action (`cmbrose/sprite-kit/init`)

Establishes sprite identity and retrieves checkpoint state.

#### Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `token` | No | Sprites API token. Falls back to `SPRITES_TOKEN` env var. |
| `api-url` | No | Sprites API URL. Defaults to `https://api.sprites.dev`. |
| `job-key` | No | Custom job key for checkpoint matching. Auto-derived if not set. |
| `matrix` | No | JSON string of matrix values for unique identification. |

#### Outputs

| Output | Description |
|--------|-------------|
| `sprite-name` | Deterministic sprite name |
| `job-key` | Job key for checkpoint matching |
| `run-id` | GitHub run ID |
| `last-checkpoint-id` | Last successful checkpoint ID (if any) |
| `needs-restore` | Whether restore is needed (`true`/`false`) |

### Run Action (`cmbrose/sprite-kit/run`)

Executes a step with checkpoint management.

#### Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `step-key` | Yes | Unique step identifier within the job |
| `run` | Yes | Bash command(s) to execute |
| `token` | No | Sprites API token. Falls back to `SPRITES_TOKEN` env var. |
| `api-url` | No | Sprites API URL |
| `sprite-name` | No | Sprite name (auto-retrieved from init state) |
| `job-key` | No | Job key (auto-retrieved from init state) |
| `run-id` | No | Run ID (auto-retrieved from init state) |
| `last-checkpoint-id` | No | Checkpoint to restore from |
| `workdir` | No | Working directory for command execution |

#### Outputs

| Output | Description |
|--------|-------------|
| `skipped` | Whether step was skipped (`true`/`false`) |
| `checkpoint-id` | Created checkpoint ID (or existing if skipped) |
| `restored` | Whether restore occurred (`true`/`false`) |
| `exit-code` | Command exit code (0 if skipped) |

### Clean Action (`cmbrose/sprite-kit/clean`)

Cleans up old sprites that were missed in previous CI runs. Typically run on a cron schedule.

#### Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `token` | No | Sprites API token. Falls back to `SPRITES_TOKEN` env var. |
| `api-url` | No | Sprites API URL. Defaults to `https://api.sprites.dev`. |
| `max-age` | No | Maximum age in hours for sprites to keep. Default: 24 |
| `dry-run` | No | If true, only list sprites that would be deleted without deleting. Default: false |
| `sprite-prefix` | No | Only clean sprites with names starting with this prefix. Defaults to repo-specific prefix. |

#### Outputs

| Output | Description |
|--------|-------------|
| `sprites-cleaned` | Number of sprites that were actually deleted |
| `sprites-found` | Total number of old sprites found |
| `dry-run` | Whether this was a dry run (`true`/`false`) |

#### Usage

```yaml
# Scheduled cleanup
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./clean
        with:
          token: ${{ secrets.SPRITES_TOKEN }}
          max-age: '24'
```

## Usage Guide

### Basic Usage

The simplest setup requires just the `SPRITES_TOKEN` environment variable:

```yaml
env:
  SPRITES_TOKEN: ${{ secrets.SPRITES_TOKEN }}

steps:
  - uses: cmbrose/sprite-kit/init@v1

  - uses: cmbrose/sprite-kit/run@v1
    with:
      step-key: my-step
      run: echo "Hello, World!"
```

### Matrix Jobs

For matrix jobs, pass the matrix context to ensure unique sprite identification:

```yaml
jobs:
  build:
    strategy:
      matrix:
        node: [18, 20]
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: cmbrose/sprite-kit/init@v1
        with:
          matrix: ${{ toJson(matrix) }}

      - uses: cmbrose/sprite-kit/run@v1
        with:
          step-key: install
          run: npm ci
```

### Multi-line Commands

Use YAML multi-line syntax for complex scripts:

```yaml
- uses: cmbrose/sprite-kit/run@v1
  with:
    step-key: setup
    run: |
      apt-get update
      apt-get install -y build-essential
      npm ci
      npm run build
```

### Conditional Steps

Combine with GitHub Actions conditionals:

```yaml
- uses: cmbrose/sprite-kit/run@v1
  if: github.event_name == 'push'
  with:
    step-key: deploy
    run: npm run deploy
```

### Custom Working Directory

Specify a working directory for command execution:

```yaml
- uses: cmbrose/sprite-kit/run@v1
  with:
    step-key: build-frontend
    workdir: /app/frontend
    run: npm run build
```

### Using Outputs

Access step outputs for conditional logic:

```yaml
- name: Build
  id: build
  uses: cmbrose/sprite-kit/run@v1
  with:
    step-key: build
    run: npm run build

- name: Report
  run: |
    if [ "${{ steps.build.outputs.skipped }}" == "true" ]; then
      echo "Build was skipped (already completed)"
    else
      echo "Build completed with exit code ${{ steps.build.outputs.exit-code }}"
    fi
```

### clean After Job

Clean up sprites after successful job completion:

```yaml
steps:
  - name: Init Sprite
    id: sprite
    uses: cmbrose/sprite-kit/init@v1

  # ... your run steps ...

  - name: clean
    uses: cmbrose/sprite-kit/clean@v1
    with:
      sprite-name: ${{ steps.sprite.outputs.sprite-name }}
```

> **Important**: Do not use `if: always()` for clean. If a job fails and you retry it, the checkpoint must still exist to restore state. Cleaning up on failure would delete the checkpoint and break retry functionality. Use the scheduled clean (below) to handle sprites from failed jobs that are never retried.

### Scheduled clean

For additional safety, set up a scheduled workflow to clean up old sprites:

```yaml
name: clean Old Sprites

on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM UTC
  workflow_dispatch:

jobs:
  clean:
    runs-on: ubuntu-latest
    steps:
      - uses: cmbrose/sprite-kit/clean@v1
        with:
          max-age-days: 3  # Delete sprites older than 3 days
```

### Dry Run

Test clean without actually deleting:

```yaml
- uses: cmbrose/sprite-kit/clean@v1
  with:
    max-age-days: 1
    dry-run: true  # Only log, don't delete
```

## Troubleshooting

### Steps Not Skipping on Rerun

1. **Check step-key uniqueness**: Each step must have a unique `step-key` within a job.
2. **Verify token**: Ensure `SPRITES_TOKEN` is correctly set.
3. **Check run ID**: Skipping only occurs within the same workflow run.

### Naming Collisions in Matrix Jobs

If you see unexpected behavior in matrix jobs:
1. Explicitly pass matrix context: `matrix: ${{ toJson(matrix) }}`
2. Or use a custom job-key that includes matrix discriminators.

### Checkpoint Not Found

If restore fails with "checkpoint not found":
1. Verify the sprite wasn't deleted between runs.
2. Check that the checkpoint wasn't created by a different run.

### Command Execution Failures

If commands fail inside the sprite:
1. Check command syntax—commands run in a bash shell.
2. Verify required tools are installed in the sprite image.
3. Review stdout/stderr in the action logs.

## Security

### Token Handling

- Store your `SPRITES_TOKEN` as a GitHub secret.
- The token is automatically masked in logs.
- Avoid logging or echoing the token in your scripts.

```yaml
# Good: Token from secrets
env:
  SPRITES_TOKEN: ${{ secrets.SPRITES_TOKEN }}

# Bad: Hardcoded token
env:
  SPRITES_TOKEN: "sk-abc123..."  # Never do this!
```

### Code Execution

- Commands execute inside isolated sprite containers.
- Be cautious with user-provided input in commands.
- Avoid executing untrusted code.

```yaml
# Safe: Static commands
- uses: cmbrose/sprite-kit/run@v1
  with:
    step-key: build
    run: npm run build

# Dangerous: User input in commands
- uses: cmbrose/sprite-kit/run@v1
  with:
    step-key: custom
    run: ${{ github.event.inputs.command }}  # Avoid this!
```

## Constraints (v1)

- **Per-job/per-run scope**: Checkpoints don't persist across runs (by design).
- **No cross-run persistence**: Each workflow run gets fresh sprites.
- **Step skipping by checkpoint only**: No conditional skip logic.
- **Basic output propagation**: Stdout/stderr streamed to logs, no artifact capture.
- **Matrix uniqueness required**: Matrix jobs must derive unique identities.

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run lint` and `npm test`
5. Submit a pull request

## License

MIT