# Step 1: Metadata Extraction

This step collects identifying information about the package: its name and the
GitHub username of the owner.

## Package name

The package name comes from the project directory name or `package.json`.

```bash
basename $(git rev-parse --show-toplevel)
```

Or from `package.json`:

```bash
jq -r '.name' package.json
```

The default template name is `pi-package-template`. If the name is still the
template name, suggest the user choose a name (typically starting with `pi-`
or scoped like `@scope/pi-`).

## GitHub username

Try these in order:

1. **From git remote origin** — Parse the owner from the remote URL:
   ```bash
   git remote get-url origin
   ```
   The URL can be in either format:
   - `https://github.com/OWNER/REPO.git` → OWNER
   - `git@github.com:OWNER/REPO.git` → OWNER

2. **Ask the user** — If there's no remote or the URL doesn't contain GitHub,
   ask the user directly for their GitHub username.

## Recording

Fill in the metadata section of the state file:

```markdown
## Metadata

- **Package name**: `<name>`
- **GitHub username**: `<username>`
- **Repository**: `https://github.com/<username>/<name>`
```
