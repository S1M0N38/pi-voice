# Prompt Template Authoring for Pi Packages

How to write prompt templates that ship with pi packages.

---

## Table of Contents

1. [Prompt Template Format](#1-prompt-template-format)
2. [Template Variables](#2-template-variables)
3. [Prompt Placement & Discovery](#3-prompt-placement--discovery)

---

## 1. Prompt Template Format

A prompt template is a Markdown file in `prompts/`:

```markdown
---
description: Greet the user warmly
---
Greet the user warmly and ask how you can help them today. Use the hello tool if they provide a name.
```

### Frontmatter

| Field | Required | Description |
|-------|----------|-------------|
| `description` | No | What this template does. Shown in command list. If missing, the first non-empty line of content is used. |
| `argument-hint` | No | Expected arguments shown in autocomplete. Use `<angle brackets>` for required, `[square brackets]` for optional. Example: `"<PR-URL>"`. |

### Invocation

Users type `/template-name` (filename without `.md`) to invoke:

```
/hello           # invokes prompts/hello.md
```

---

## 2. Template Variables

Templates support **positional argument substitution**:

| Variable | Meaning |
|----------|--------|
| `$1`, `$2`, ... | Positional arguments |
| `$@` or `$ARGUMENTS` | All arguments joined |
| `${@:N}` | Arguments from Nth position (1-indexed) |
| `${@:N:L}` | L arguments starting at N |

Example:

```markdown
---
description: Create a component
argument-hint: "<name> [features...]"
---
Create a React component named $1 with features: $@
```

Usage: `/component Button "onClick handler"` expands to:
> Create a React component named Button with features: onClick handler

For complex dynamic behavior, use **skills** instead (they have reference
files and can instruct the agent to perform multi-step workflows).

---

## 3. Prompt Placement & Discovery

### In packages

```
my-package/
├── prompts/
│   ├── hello.md
│   └── review.md
└── package.json
```

Package `package.json`:

```json
{
  "pi": {
    "prompts": ["./prompts"]
  }
}
```

### Discovery

- Files are discovered from `prompts/` directories
- Discovery is **non-recursive** — only top-level `.md` files are found. Use `pi.prompts` in `package.json` to add subdirectories explicitly.
- Each `.md` file becomes a `/command` with the filename (minus `.md`)
- The `description` from frontmatter is shown in the command list
