# Step 3: Rename Template → Package

This step renames every occurrence of the template placeholder to the user's
actual package name and info.

## Prerequisite: clean working tree

Before starting, verify the git working tree is clean:

```bash
git status --porcelain
```

- **Clean** → proceed with the rename.
- **Dirty** → ask the user whether they want to **commit** or **discard**
  their uncommitted changes. Repeat until the tree is clean, then proceed.

## 1. Derive and confirm names

From the metadata collected in step 1, derive identifiers. Present all of them
to the user for confirmation.

| Identifier | Source | Used for | Example |
|---|---|---|---|
| **package** | Directory name or `package.json` name | npm package name, imports | `my-pi-package` |
| **description** | User input | README, package.json | "A pi package for X" |
| **author** | GitHub username | package.json author, LICENSE | `myuser` |
| **repo** | `github.com/<author>/<package>` | package.json repository | `myuser/my-pi-package` |

Also ask the user for their **package description** (1-2 sentences).

## 2. Show the rename plan

Before making any changes, present a summary of everything that will happen.

### Content replacements

In **`package.json`**:

| Pattern | Replacement |
|---|---|
| `"name": "pi-package-template"` | `"name": "<package>"` |
| `"description": "A minimal starter..."` | `"description": "<user-description>"` |
| `"author": "S1M0N38"` | `"author": "<author>"` |
| `"url": "...S1M0N38/pi-package-template"` | `"url": "...<author>/<package>"` |

In **`README.md`**:

| Pattern | Replacement |
|---|---|
| `pi-package-template` | `<package>` |
| `S1M0N38` | `<author>` |
| Template-specific descriptions | `<user-description>` |

In **`AGENTS.md`**:

| Pattern | Replacement |
|---|---|
| `pi-package-template` (in project title/refs) | `<package>` |
| `S1M0N38` | `<author>` |
| Template-specific descriptions | Replace with user's context |

In **`LICENSE`**:

| Pattern | Replacement |
|---|---|
| `Copyright (c) 2026` | `Copyright (c) <year> <author>` |

> **Note:** Read the LICENSE file first to confirm the exact copyright line, as it may vary.

### Files NOT touched

- `.agents/` — template tooling, not part of the package
- `node_modules/` — dependencies
- `biome.json`, `tsconfig.json` — no template-specific content
- `.github/workflows/` — CI configuration (update if needed)

## 3. Execute the rename

Ask the user for final confirmation, then execute in this order:

### a. Content replacements

Use the `edit` tool to perform the replacements described in section 2.
Work through each file systematically.

**Order matters** — replace longer strings before shorter ones to avoid
partial matches:

1. `S1M0N38/pi-package-template` → `<author>/<package>` (full URL first)
2. `pi-package-template` → `<package>` (package name)
3. `S1M0N38` → `<author>` (username)
4. Template-specific descriptions → user descriptions

## 4. Verify

After all replacements, run a verification sweep:

```bash
rg -l "pi-package-template" --glob '!.agents/**' --glob '!node_modules/**'
rg -l "S1M0N38" --glob '!.agents/**' --glob '!node_modules/**'
```

- **No matches** → proceed to verify the build.
- **Matches found** → report them, fix, and re-verify.

Then run:

```bash
npm run typecheck && npm run lint
```

## 5. Commit

Use a conventional commit:

```
refactor!: rename template placeholders to <package>
```

This is a `refactor!` (breaking) because it changes the package identity.

## Recording

Update the state file's checklist:

```markdown
- [ ] 3. Template renamed
  - [ ] 3a. Names derived and confirmed
  - [ ] 3b. Rename plan approved
  - [ ] 3c. Content replaced
  - [ ] 3d. Verification passed
  - [ ] 3e. Changes committed
```
