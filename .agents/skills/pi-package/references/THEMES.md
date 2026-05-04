# Theme Creation for Pi Packages

All 51 color tokens required for a valid pi theme.

> For extension patterns, see `references/EXTENSIONS.md`.

---

## Table of Contents

1. [Theme Structure](#1-theme-structure)
2. [Color Tokens Reference](#2-color-tokens-reference)
3. [Color Values](#3-color-values)
4. [Theme Creation Workflow](#4-theme-creation-workflow)
5. [Testing Themes](#5-testing-themes)

---

## 1. Theme Structure

```json
{
  "$schema": "https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "my-theme",
  "vars": {
    "blue": "#61afef",
    "gray": 242
  },
  "colors": {
    "accent": "blue",
    "border": "blue",
    /* ... all 51 tokens ... */
  }
}
```

- `name` — required, must be unique
- `vars` — optional, define reusable colors referenced in `colors`
- `colors` — **required**, all 51 tokens must be present
- `$schema` — enables editor auto-completion

---

## 2. Color Tokens Reference

### Core UI (11 tokens)

| Token | Purpose |
|-------|---------|
| `accent` | Primary accent (logo, selected items) |
| `border` | Normal borders |
| `borderAccent` | Highlighted borders |
| `borderMuted` | Subtle borders (editor) |
| `success` | Success states |
| `error` | Error states |
| `warning` | Warning states |
| `muted` | Secondary text |
| `dim` | Tertiary text |
| `text` | Default text (usually `""`) |
| `thinkingText` | Thinking block text |

### Backgrounds & Content (11 tokens)

| Token | Purpose |
|-------|---------|
| `selectedBg` | Selected line background |
| `userMessageBg` | User message background |
| `userMessageText` | User message text |
| `customMessageBg` | Extension message background |
| `customMessageText` | Extension message text |
| `customMessageLabel` | Extension message label |
| `toolPendingBg` | Tool box (pending) |
| `toolSuccessBg` | Tool box (success) |
| `toolErrorBg` | Tool box (error) |
| `toolTitle` | Tool title |
| `toolOutput` | Tool output text |

### Markdown (10 tokens)

| Token | Purpose |
|-------|---------|
| `mdHeading` | Headings |
| `mdLink` | Link text |
| `mdLinkUrl` | Link URL |
| `mdCode` | Inline code |
| `mdCodeBlock` | Code block content |
| `mdCodeBlockBorder` | Code block fences |
| `mdQuote` | Blockquote text |
| `mdQuoteBorder` | Blockquote border |
| `mdHr` | Horizontal rule |
| `mdListBullet` | List bullets |

### Tool Diffs (3 tokens)

| Token | Purpose |
|-------|---------|
| `toolDiffAdded` | Added lines |
| `toolDiffRemoved` | Removed lines |
| `toolDiffContext` | Context lines |

### Syntax Highlighting (9 tokens)

| Token | Purpose |
|-------|---------|
| `syntaxComment` | Comments |
| `syntaxKeyword` | Keywords |
| `syntaxFunction` | Function names |
| `syntaxVariable` | Variables |
| `syntaxString` | Strings |
| `syntaxNumber` | Numbers |
| `syntaxType` | Types |
| `syntaxOperator` | Operators |
| `syntaxPunctuation` | Punctuation |

### Thinking Level Borders (6 tokens)

| Token | Purpose |
|-------|---------|
| `thinkingOff` | Thinking off |
| `thinkingMinimal` | Minimal thinking |
| `thinkingLow` | Low thinking |
| `thinkingMedium` | Medium thinking |
| `thinkingHigh` | High thinking |
| `thinkingXhigh` | Extra high thinking |

### Bash Mode (1 token)

| Token | Purpose |
|-------|---------|
| `bashMode` | Editor border in bash mode |

### HTML Export (optional)

```json
{
  "export": {
    "pageBg": "#18181e",
    "cardBg": "#1e1e24",
    "infoBg": "#3c3728"
  }
}
```

---

## 3. Color Values

Four formats:

| Format | Example | Description |
|--------|---------|-------------|
| Hex | `"#ff0000"` | 6-digit hex RGB |
| 256-color | `39` | xterm 256-color palette index (0-255) |
| Variable | `"primary"` | Reference to a `vars` entry |
| Default | `""` | Terminal's default color |

---

## 4. Theme Creation Workflow

1. Copy `themes/template.json` as a starting point
2. Define your color palette in `vars`
3. Map each of the 51 tokens to colors from your palette
4. Name the theme uniquely
5. Include the `$schema` for editor support

### Recommended approach

Define a base palette (6-8 colors) in `vars`, then reference them:

```json
{
  "name": "nord",
  "vars": {
    "frost": "#88c0d0",
    "aurora": "#a3be8c",
    "polar": "#2e3440",
    "snow": "#eceff4",
    "frostDim": "#4c566a",
    "red": "#bf616a"
  },
  "colors": {
    "accent": "frost",
    "success": "aurora",
    "error": "red",
    "muted": "frostDim",
    /* ... */
  }
}
```

---

## 5. Testing Themes

1. Install the theme: place it in `themes/` in your package
2. Load the package: `pi -ne -e .`
3. Switch theme: `/settings` → select your theme
4. Check with different content: tool results, markdown, code blocks, errors
5. Verify both compact and expanded tool views

Hot reload: editing the active theme file reloads it automatically.
