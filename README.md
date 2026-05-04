# pi-voice

Give a voice to your Pi agent. A [pi](https://pi.dev) package for adding voice capabilities to your coding agent.

## Quick Start

```bash
# 1. Clone this template
git clone https://github.com/S1M0N38/pi-voice.git
cd pi-voice

# 2. Install dev dependencies (for type checking)
npm install

# 3. Edit package.json — set name, description, author, repository

# 4. Start building! Edit the files in extensions/, skills/, prompts/, themes/

# 5. Test locally
pi -e .

# 6. Publish to npm
npm publish
```

## What's Included

```
pi-voice/
├── extensions/
│   └── index.ts          # Sample extension (tool + command + event)
├── skills/
│   └── hello/SKILL.md    # Sample skill
├── prompts/
│   └── hello.md          # Sample prompt template (/hello)
├── themes/
│   └── template.json     # Sample theme
├── package.json          # Pi manifest + npm config
├── tsconfig.json         # TypeScript config (type checking only)
├── .gitignore
├── LICENSE               # MIT
├── CHANGELOG.md
└── README.md             # This file
```

## Package Structure

Pi packages can contain any combination of these resources:

### Extensions (`extensions/`)

TypeScript modules that extend pi's behavior. Capabilities include:

- **Custom tools** — functions the LLM can call
- **Slash commands** — user-invoked commands like `/hello`
- **Event handlers** — react to session lifecycle events
- **Custom UI** — render custom components in the terminal
- **Keybindings** — register keyboard shortcuts
- **CLI flags** — add custom command-line options

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // Register a tool the LLM can call
  pi.registerTool({
    name: "my_tool",
    label: "My Tool",
    description: "What this tool does",
    parameters: Type.Object({
      input: Type.String({ description: "Some input" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return {
        content: [{ type: "text", text: `Result: ${params.input}` }],
        details: {},
      };
    },
  });

  // Register a slash command
  pi.registerCommand("my-cmd", {
    description: "Do something",
    handler: async (args, ctx) => {
      ctx.ui.notify("Done!", "info");
    },
  });

  // React to events
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Loaded!", "info");
  });
}
```

### Skills (`skills/`)

Markdown files with instructions the LLM loads on-demand. Place each skill in its own folder with a `SKILL.md` file.

```markdown
# My Skill

Use this skill when the user asks about X.

## Steps
1. Do this
2. Then that
```

### Prompt Templates (`prompts/`)

Markdown files that become slash commands. The filename (without `.md`) becomes the command name.

```markdown
Review the current codebase and suggest improvements.
```

Users invoke it with `/review` (if the file is `review.md`).

### Themes (`themes/`)

JSON files that define color schemes.

```json
{
  "name": "my-theme",
  "colors": {
    "primary": "#61afef",
    "success": "#98c379"
  }
}
```

## Testing Your Package

```bash
# Run without installing (ephemeral)
pi -e .

# Or install locally
pi install ./path/to/your-package

# Type check
npm run typecheck

# Lint
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format
```

## CI/CD

This template includes two GitHub Actions workflows:

### CI (`ci.yml`)

Runs on every push and PR to `main`:
- **Type check** — `tsc --noEmit`
- **Lint** — biome check

### Release (`release.yml`)

Uses [release-please](https://github.com/googleapis/release-please) to automate releases:

1. Write conventional commits (`feat:`, `fix:`, `feat!:`, etc.)
2. On push to `main`, release-please opens/updates a **Release PR** with:
   - Updated `CHANGELOG.md` (auto-generated from commits)
   - Version bump in `package.json`
3. Merge the Release PR → release-please creates a **GitHub Release** + git tag
4. The `publish` job auto-publishes to **npm** (requires `NPM_TOKEN` secret)

#### GitHub Setup

1. **Create an npm access token**
   - Go to [npmjs.com → Access Tokens](https://www.npmjs.com/settings/~/tokens)
   - Generate a new **Automation** token (bypasses 2FA for CI)

2. **Add the secret to your GitHub repo**
   - Go to your repo → **Settings** → **Secrets and variables** → **Actions**
   - Click **New repository secret**
   - Name: `NPM_TOKEN`
   - Value: paste your npm access token

3. **Allow GitHub Actions to create PRs** (required for release-please)
   - Go to your repo → **Settings** → **Actions** → **General**
   - Under **Workflow permissions**, select **Read and write permissions**
   - Check **Allow GitHub Actions to create and approve pull requests**

4. Write conventional commits — everything else is automatic!

#### How `pi update` works

Once your package is published, users can update with:

```bash
pi update                    # update pi and all packages
pi update --extensions       # update packages only
pi update npm:your-package   # update one package
```

Pi compares the installed version against `npm view <name> version` and installs `@latest` if a newer version is found. Pinned versions (e.g. `npm:pkg@1.0.0`) are never auto-updated.

#### Manual publish (alternative)

```bash
npm login
npm publish
```

## Key Concepts

- **`peerDependencies`** — Pi core packages (`@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `typebox`) must be listed as peer dependencies with `"*"` range. They are provided by pi at runtime.
- **`pi` manifest** — The `pi` key in `package.json` tells pi which directories contain resources.
- **`keywords`** — Include `"pi-package"` so your package appears in the [pi package gallery](https://pi.dev/packages).
- **`files`** — Controls what's included in the npm tarball. Only list your resource directories and docs.
- **No build step** — Pi loads TypeScript extensions directly via [jiti](https://github.com/unjs/jiti). No compilation needed.

## Learn More

- [Pi Documentation](https://pi.dev/docs/latest)
- [Extensions Guide](https://pi.dev/docs/latest/extensions)
- [Skills Guide](https://pi.dev/docs/latest/skills)
- [Package Gallery](https://pi.dev/packages)
- [Extension Examples](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions)

## License

MIT
