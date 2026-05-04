# Step 2: Requirements Verification

This step checks that all required development tools are installed.

## Install dependencies first

Before checking tool versions, install the project's dev dependencies:

```bash
npm install
```

This is required so that `npx tsc --version` and `npx @biomejs/biome --version`
use the locally installed versions.

## Tools to check

| Tool | Minimum version | Command |
|------|----------------|---------|
| Node.js | ≥ 18 | `node --version` |
| npm | any | `npm --version` |
| pi | any | `pi --version` |
| TypeScript | ≥ 5.0 | `npx tsc --version` |
| Biome | any | `npx @biomejs/biome --version` |
| git | any | `git --version` |

## How to check

For each tool, run `which <tool>` to confirm existence, then the version
command from the table above.

## Recording

For each tool, record the result in the state file's Requirements table:

- ✅ `<tool> <version>` if found
- ❌ `<tool> — not found`

If any tool is missing, tell the user what to install and pause. Let them
install it and resume later (the state file will remember where you are).

## Quick verification

After tools are verified, run the project's built-in checks:

```bash
npm run typecheck && npm run lint
```

- ✅ Both pass → ready for development
- ❌ Type errors or lint failures → fix before proceeding

## Verify the package loads in pi

```bash
pi -ne -e . --no-session -p "List the tools you have available."
```

- ✅ Output shows `hello` tool → package loads correctly
- ❌ Error loading → check extension code for syntax errors
