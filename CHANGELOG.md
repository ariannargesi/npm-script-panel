# Changelog

## 0.1.0

- Sidebar list of root `package.json` scripts with Start, Stop, Restart and Kill.
- Each script's output in an expandable terminal under its row, inside the sidebar (xterm.js), so VS Code's integrated terminal is untouched.
- Recent section at the top of the list: the last 5 scripts run (Start or Restart), newest first, remembered per workspace.
- Green play button.
- Exact running, stopping, failed and stopped states, with the exit code on failure.
- Package manager detection for npm, pnpm, yarn and bun.
