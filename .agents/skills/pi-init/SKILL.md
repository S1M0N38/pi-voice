---
name: pi-init
description: >
  Initialize a pi package project after cloning from pi-package-template. Run
  once at the start of development to verify the development environment is set up
  correctly. Use when the user says "init", "setup", "initialize", "check environment",
  "pi-init", or asks to verify their pi package development setup. Also use when the
  user says they just cloned the template or wants to start developing a pi package.
  Do not use for general pi package development tasks (use pi-package) or for
  running tests.
---

# Pi Package Project Initialization

This skill walks through a checklist to verify that a pi package development
environment is correctly configured. It writes findings to a state file in the
project root (`.pi-init.md`) so progress is persisted between sessions.

## Official Pi Documentation

If you need to look up APIs or verify behavior during initialization, see pi's
installed docs:

```bash
# Find the docs directory
npm root -g  # → <dir>/@mariozechner/pi-coding-agent/docs/
```

Key documents: `extensions.md`, `skills.md`, `themes.md`, `packages.md`.

## Overview

The checklist has a welcome step followed by four execution steps. Each step
collects information and records the result in the state file. If the skill is
interrupted, it reads the state file on the next invocation and resumes from
where it left off.

0. **Welcome** — Display overview and ask user to confirm readiness
1. **Metadata** — Extract package name and GitHub username
2. **Requirements** — Verify required tools are installed
3. **Rename** — Replace template placeholders with the user's package name and info
4. **Docs** — Update README and AGENTS.md with the user's package description

## State file

The state file lives at `.pi-init.md` in the project root. It doubles as the
progress tracker and the final report.

- On first run: display the welcome message (step 0). Only create the state file
  after the user confirms readiness.
- On resume: read `.pi-init.md`, find the first unchecked step, and **skip** any
  already-passed steps (don't re-verify them). If the state file exists, skip step 0.
- After each sub-step: update the file with findings (fill in the sections, check off boxes)
- Add `.pi-init.md` to `.gitignore` so it doesn't pollute the repo

Steps that have sub-checks use indented checkboxes. When resuming,
skip to the first unchecked box at any level.

## Step execution

For each step, read the corresponding reference file and follow its instructions.
Update the state file after completing each step.

| Step | Reference file | What it does |
|------|---------------|--------------|
| 0. Welcome | `references/00-INTRO.md` | Display welcome message and overview, ask user to confirm |
| 1. Metadata | `references/01-METADATA.md` | Extract package name from directory, GitHub username from git remote |
| 2. Requirements | `references/02-REQUIREMENTS.md` | Check that node, npm, pi, biome, typescript are installed |
| 3. Rename | `references/03-RENAME.md` | Derive package identifiers, rename files and replace content, verify, commit |
| 4. Docs | `references/04-DOCS.md` | Collect package description, update README and AGENTS.md |

## Severity levels

- **❌ Failure** — a required check did not pass. The user must fix this.
- **⚠️ Warning** — an optional/recommended check did not pass. Suggest the fix
  but don't block progress.
- **✅ Pass** — check passed.

## Important notes

- Ask the user before proceeding through each step. Don't run the whole checklist
  silently — this is meant to be interactive and educational.
- If something fails, explain why and suggest how to fix it. The user may be new
  to pi package development.
- The state file uses markdown checkboxes (`- [ ]` / `- [x]`) to track progress.
  Keep the format consistent so resume works reliably.
- Never modify files outside the project without explicit approval.

## Completion message

When all 4 steps are complete (all checkboxes checked), display a final message:

---

🎉 **Initialization complete!** Here's what was set up:

- ✅ Package metadata extracted
- ✅ Development requirements verified
- ✅ Template renamed from `pi-package-template` → `<package-name>`
- ✅ Documentation updated with your package description

**Suggested next steps:**

1. **Review and delete `.pi-init.md`** — This file tracked progress during
   initialization. Review it if you like, then remove it. It's already in
   `.gitignore` so it won't affect your repo.

2. **Implement your extension** — Edit `extensions/index.ts` to add your tools,
   commands, and event handlers. Use the `pi-package` skill for patterns and
   best practices.

3. **Test your package** — Run `pi -ne -e . --no-session -p "Call your tool"`
   to verify tools work, or `pi -ne -e . --no-session` for interactive testing.

---

Fill in `<package-name>` with the actual package name from step 3. Adapt the recap
naturally based on what actually happened (e.g., if some steps had warnings).
