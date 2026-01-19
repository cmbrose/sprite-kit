# Sprite Clean Action

The clean action helps you clean up sprites in two modes:

1. **Current Workflow Mode** - Clean up the sprite for the current workflow when the job completes successfully
2. **Global Cleanup Mode** - Clean up old sprites that may have been missed in previous CI runs

## Usage

### Current Workflow Mode (End of Job)

Clean up the current workflow's sprite after successful completion:

```yaml
steps:
  - name: Init Sprite
    uses: ./init
    with:
      token: ${{ secrets.SPRITES_TOKEN }}

  # ... your workflow steps ...

  - name: Clean up current sprite
    uses: ./clean
    # No inputs needed - automatically detects current mode from action state
```

Or explicitly specify current mode:

```yaml
- name: Clean up current sprite
  uses: ./clean
  with:
    mode: 'current'
    token: ${{ secrets.SPRITES_TOKEN }}
```

### Global Cleanup Mode (Scheduled)

Clean up old sprites from any workflows on a schedule:

```yaml
- name: Clean up old sprites
  uses: ./clean
  with:
    mode: 'global'
    token: ${{ secrets.SPRITES_TOKEN }}
    max-age: '24'
```

### Scheduled Cleanup

```yaml
name: 'Sprite Cleanup'

on:
  schedule:
    # Run every day at 2 AM UTC
    - cron: '0 2 * * *'

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

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `token` | Sprites API token. Can also be set via SPRITES_TOKEN environment variable | false | |
| `api-url` | Sprites API URL | false | https://api.sprites.dev |
| `mode` | Cleanup mode: "current" for current workflow, "global" for scheduled cleanup | false | `global` |
| `max-age` | Maximum age in hours for sprites to keep (global mode only) | false | `24` |
| `dry-run` | If true, only list sprites that would be deleted without actually deleting them | false | `false` |
| `sprite-prefix` | Only clean sprites with names starting with this prefix (global mode only) | false | `{owner}-{repo}` |
| `sprite-name` | Specific sprite name to delete (current mode only). Auto-detected from action state. | false | |

## Outputs

| Output | Description |
|--------|-------------|
| `sprites-cleaned` | Number of sprites that were actually deleted |
| `sprites-found` | Total number of sprites that were found |
| `dry-run` | Whether this was a dry run (true/false) |
| `mode` | The cleanup mode that was used (global/current) |

## How It Works

### Current Workflow Mode
1. **Auto-detection**: Automatically detects current mode if action state contains sprite information
2. **State Reading**: Reads sprite ID and name from action state (set by init action)
3. **Single Cleanup**: Deletes only the current workflow's sprite
4. **Job Completion**: Typically used at the end of a successful workflow

### Global Cleanup Mode
1. **Discovery**: Lists all sprites accessible with the provided token
2. **Filtering**: Filters sprites based on:
   - Name prefix (defaults to repository-specific prefix)
   - Age (based on creation time vs max-age setting)
3. **Batch Cleanup**: Deletes multiple old sprites
4. **Scheduled**: Typically used on a cron schedule

## Default Behavior

- **Sprite Prefix**: By default, only cleans sprites that start with `{owner}-{repo}` to avoid cleaning sprites from other repositories
- **Max Age**: Deletes sprites older than 24 hours by default
- **Dry Run**: Actually deletes sprites by default (set `dry-run: 'true'` to test first)

## Best Practices

1. **Start with dry-run**: Always test with `dry-run: 'true'` first to see what would be deleted
2. **Use scheduled cleanup**: Set up a cron job to run cleanup regularly
3. **Adjust max-age**: Choose an appropriate max-age based on your CI pipeline duration
4. **Monitor outputs**: Check the action outputs to ensure cleanup is working as expected

## Example Scenarios

### End-of-Job Cleanup
Clean the current sprite automatically after job completion:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Init Sprite
        uses: ./init
        with:
          token: ${{ secrets.SPRITES_TOKEN }}
      
      # ... your build/test steps ...
      
      - name: Clean up sprite
        if: success()  # Only clean up on success
        uses: ./clean
        # Auto-detects current mode from action state
```

### Daily Cleanup
Clean up sprites older than 24 hours every day:

```yaml
on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM UTC daily
```

### Manual Cleanup with Confirmation
Allow manual triggering with dry-run option:

```yaml
on:
  workflow_dispatch:
    inputs:
      dry-run:
        description: 'Dry run (list only)'
        type: boolean
        default: true
```

### Long-Running Project Cleanup
For projects with longer CI pipelines, keep sprites longer:

```yaml
with:
  max-age: '72'  # 3 days
```