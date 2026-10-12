# Script Runner

Run the scripts in your root `package.json` from a sidebar list instead of opening a terminal and typing. Each script's output lives in the sidebar too, so VS Code's own terminal panel is left alone.

- **Start, Stop, Restart, Kill** buttons on every script.
- **A Recent section at the top** with the last 5 scripts you ran, newest first, remembered per workspace.
- **A Terminal row under each script** that expands to that script's output, with colors.
- **Exact status**: running, stopping, failed (with the exit code), stopped.
- Picks `npm`, `pnpm`, `yarn` or `bun` from the `packageManager` field or the lockfile.

## How the actions behave

| Action  | What it does |
| ------- | ------------ |
| Start   | Runs `<pm> run <script>`. Output streams into the script's Terminal row. |
| Stop    | Sends Ctrl+C (SIGINT) to the script's whole process group. The row shows "stopping…" until it ends. It never escalates on its own. |
| Restart | Stop, wait up to `scriptRunner.restartTimeoutMs`, kill the process tree if it is still alive, then start again. |
| Kill    | `SIGKILL`s the script and everything under it (`taskkill /T /F` on Windows). The output stays readable. |

The title bar has **Stop all** and **Refresh**. `pre*`/`post*` scripts are hidden when the base script exists, because the package manager runs them for you.

## Settings

| Setting | Default | |
| ------- | ------- | - |
| `scriptRunner.packageManager` | `auto` | `auto`, `npm`, `pnpm`, `yarn`, `bun` |
| `scriptRunner.showPrePostScripts` | `false` | Show `pre*`/`post*` as separate rows |
| `scriptRunner.restartTimeoutMs` | `5000` | How long Restart waits before killing |

## Limits to know about

- **The output is not a real terminal.** Scripts run with piped output and `FORCE_COLOR=1`, so colors work, but there is no keyboard input and interactive prompts will not work. Use VS Code's own terminal for those.
- **Scripts stop when the window closes or reloads.** They are children of the extension, and the extension ends them on shutdown so they cannot leave a dev server holding a port.
- Scripts inherit the environment VS Code was started with. If a tool that is only on your PATH through `~/.zshrc` (for example an `nvm` Node) is not found, start VS Code from a terminal with `code .`.
- Only the root `package.json` of the first workspace folder is read.
- Windows has no Ctrl+C equivalent for a process tree, so Stop behaves like Kill there.

---

## Developing

```bash
pnpm install
pnpm typecheck
pnpm test        # unit tests plus real-process tests of Start/Stop/Kill/Restart (macOS/Linux)
pnpm build
```

### Try it locally

1. Open this folder in VS Code and press **F5**, choosing one of:
   - **Run Extension: ramcinpay-front** opens `~/Documents/projects/ramcinpay-front` in the Extension Development Host.
   - **Run Extension: fixtures/sample** opens a sample project with scripts built for testing: `ticker` (runs forever), `stubborn` (ignores Ctrl+C, so it needs Kill), `fail` (exits 3), `quick`, `dev:server` (port 4123), and a `build` with `prebuild`/`postbuild` hooks.
2. Click the Script Runner icon in the Activity Bar.

### Test the packaged build

```bash
pnpm package     # writes script-runner-<version>.vsix
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension script-runner-0.1.0.vsix
```

Reload VS Code afterwards. Uninstall with `--uninstall-extension <publisher>.script-runner`.

### Publishing

Only after the local checks above.

1. Replace `publisher` in `package.json` with your real publisher ID, and add a `repository` field.
2. VS Code Marketplace: `pnpm exec vsce publish --pre-release --no-dependencies` (needs an Azure DevOps personal access token).
3. Open VSX (Cursor, VSCodium): `pnpm dlx ovsx publish script-runner-<version>.vsix --pre-release -p <token>` (needs an Eclipse account and a namespace).
4. Promote to a stable release by bumping the version and publishing without `--pre-release`.
