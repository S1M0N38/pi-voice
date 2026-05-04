# Skill Authoring for Pi Packages

How to write skills that ship with pi packages.

> For extension patterns, see `references/EXTENSIONS.md`.

---

## Table of Contents

1. [Skill Structure](#1-skill-structure)
2. [Frontmatter](#2-frontmatter)
3. [Progressive Disclosure Pattern](#3-progressive-disclosure-pattern)
4. [Skill Naming & Triggering](#4-skill-naming--triggering)
5. [Reference File Organization](#5-reference-file-organization)
6. [Skills in Packages](#6-skills-in-packages)

---

## 1. Skill Structure

A skill is a directory with a `SKILL.md` file:

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Helper scripts (optional)
│   └── process.sh
├── references/           # Detailed docs loaded on-demand (optional)
│   └── api-reference.md
└── assets/               # Templates and static files (optional)
    └── template.json
```

---

## 2. Frontmatter

Required fields:

```yaml
---
name: my-skill           # Must match parent directory name
description: What this skill does and when to use it. Be specific about triggering conditions.
---
```

Optional fields:

```yaml
---
name: my-skill
description: Detailed description...
license: MIT
compatibility: Requires Node.js >= 18   # Max 500 chars, environment requirements
metadata: { version: "1.0" }             # Arbitrary key-value mapping
allowed-tools: Bash read edit write      # Space-delimited pre-approved tools
disable-model-invocation: true          # Hidden from system prompt, must use /skill:name
---
```

### Name rules

- Lowercase letters, numbers, hyphens only
- No leading/trailing/consecutive hyphens
- Must match parent directory name
- Max 64 characters

### Description best practices

The description determines **when** the agent loads the skill. Be specific.
Max length: **1024 characters**. Skills with missing description are not loaded.

Good:
```yaml
description: >
  Write, update, and improve pi extension documentation. Use when the user asks
  to write docs, update README, or generate documentation for extension APIs.
```

Poor:
```yaml
description: Helps with docs.
```

---

## 3. Progressive Disclosure Pattern

Skills follow a **progressive disclosure** pattern:

1. **SKILL.md** — overview, table of contents, and high-level instructions
2. **Reference files** — detailed content loaded on-demand based on the task

```markdown
# My Skill

## Reference Files

Read these on demand based on the task. Do NOT load all at once.

### `references/RECIPES.md`
Complete code examples for every pattern.

### `references/TYPES.md`
Detailed type reference.
```

This keeps the initial load small while providing depth when needed.

---

## 4. Skill Naming & Triggering

The agent loads skills based on the `description` matching the user's request.

### Naming conventions

- Use a domain prefix: `pi-package`, `pi-doc`, `pi-init`
- Match the domain: `nvim-plugin`, `nvim-test` for Neovim plugins
- Keep it descriptive but concise

### Triggering

- **Automatic**: Agent matches the skill description to the user's task
- **Manual**: User types `/skill:my-skill`
- **From extension**: Extension calls `pi.sendUserMessage("/skill:my-skill")`

---

## 5. Reference File Organization

```
my-skill/
├── SKILL.md
└── references/
    ├── RECIPES.md       # Code examples and patterns
    ├── TYPES.md         # Type reference
    ├── GUIDE.md         # Step-by-step workflows
    └── ANTI-PATTERNS.md # What not to do
```

### Guidelines

- Each reference file should have a **table of contents** at the top
- Keep files focused on one aspect (patterns, types, testing, etc.)
- Reference files are loaded with the `read` tool using relative paths
- Total size of all reference files can be large — they're loaded individually

---

## 6. Skills in Packages

In a pi package, skills live in the `skills/` directory:

```
my-package/
├── skills/
│   ├── my-skill/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── GUIDE.md
│   └── another-skill/
│       └── SKILL.md
└── package.json         # pi.skills entry (or convention)
```

Package `package.json`:

```json
{
  "pi": {
    "skills": ["./skills"]
  }
}
```

Or use the conventional `skills/` directory without a manifest entry.
