# Step 4: Update Documentation

This step replaces the template's documentation boilerplate with the user's
actual package description.

## 1. Collect package description

Ask the user:

1. **Tagline** — A one-sentence description of what the package does.
   (e.g. "A pi package that adds GitHub issue search to the agent")
2. **Description** — A longer paragraph explaining the package's purpose.
   (1-3 sentences)

Present the user's tagline alongside 2-3 proposed variations. The user picks
one (or keeps their original). The chosen tagline is used in README and
`package.json` description.

## 2. Update README.md

### Sections to keep and update

- **Title and badges** — Replace `pi-package-template` with `<package>`,
  replace `S1M0N38` with `<author>` in badge URLs. Update the tagline subtitle.
- **Installation** — Update package name references to `<package>`.

### Sections to replace with TODO markers

Replace the content of these sections with an HTML comment TODO:

- **Motivation / About** → `<!-- TODO: describe what your package does and why -->`
- **Usage** → `<!-- TODO: add usage examples and configuration -->`

### Sections to remove entirely

- **Template-specific sections** — Any sections describing the template itself
  (not the user's package) should be removed.

## 3. Update AGENTS.md

Update the project overview section to reflect the user's actual package:

- Replace template description with the user's description
- Update the tech stack if the user adds dependencies
- Keep the development commands and agentic loop sections

## 4. Verify build

After updating docs, run:

```bash
npm run typecheck && npm run lint
```

Also verify the npm tarball:

```bash
npm pack --dry-run
```

Check that the expected files are included.

## 5. Commit

Use a conventional commit:

```
docs: update documentation with package description
```

## Recording

Update the state file:

```markdown
## Docs

- **Package tagline**: `<tagline>`
- **README updated**: ✅
- **AGENTS.md updated**: ✅
- **Build verified**: ✅
- **Changes committed**: ✅
```

Check off all sub-steps in the checklist.
