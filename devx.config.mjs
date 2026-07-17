export default {
  projectName: 'go-gather',
  editor: {
    command: 'code',
    args: ['--profile', 'Ionic'],
  },
  branchPrefix: 'feat/',
  baseBranch: 'main',
  pr: {
    baseRef: 'origin/main',
    prepOutputFile: 'prompts/pr-prep-prompt.md',
    feedbackOutputFile: 'prompts/pr-feedback-prompt.md',
    verifyCommands: ['npm run lint', 'npm run test', 'npm run build'],
  },
};
