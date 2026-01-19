// TODO: Implement run action
// This will handle:
// 1. List checkpoints; if checkpoint exists for this step_key → set skipped=true, exit 0
// 2. If rerun attempt and restore not yet done and last_ok_checkpoint_id exists:
//    - restore to last_ok_checkpoint_id
//    - mark restore done for this job attempt via $GITHUB_ENV
// 3. Execute command inside sprite (stream logs)
// 4. On success and checkpoint=true, create checkpoint with comment and output its id
// 5. On failure, propagate failure (exit non-zero)

export async function run(): Promise<void> {
  // Implementation placeholder
}

if (require.main === module) {
  run();
}
