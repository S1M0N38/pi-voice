# Typebox Schema Patterns for Pi Tools

Practical schema patterns for tool parameters using `typebox`.
All tools must use `Type.Object()` for their parameters.

> For extension patterns, see `references/EXTENSIONS.md`.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Primitive Types](#2-primitive-types)
3. [String Enums (Google-compatible)](#3-string-enums-google-compatible)
4. [Object & Nested Schemas](#4-object--nested-schemas)
5. [Arrays & Tuples](#5-arrays--tuples)
6. [Optional Fields & Defaults](#6-optional-fields--defaults)
7. [Description Best Practices](#7-description-best-practices)
8. [Reusable Sub-schemas](#8-reusable-sub-schemas)
9. [Empty Parameters](#9-empty-parameters)
10. [Common Parameter Patterns](#10-common-parameter-patterns)

---

## 1. Quick Start

Every tool needs a `parameters` field using `Type.Object()`:

```typescript
import { Type } from "typebox";
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "my_tool",
  parameters: Type.Object({
    action: StringEnum(["list", "add", "remove"] as const),
    name: Type.Optional(Type.String({ description: "Item name" })),
    count: Type.Optional(Type.Number({ description: "Number of items", default: 10 })),
  }),
  // ...
});
```

### Rules

- Always use `Type.Object()` as the top-level schema
- Use `Type.String()`, `Type.Number()`, `Type.Boolean()` for primitives
- Use `StringEnum()` (not `Type.Union`/`Type.Literal`) for string enums
- Use `Type.Optional()` for optional fields
- Add `description` to every field for LLM understanding

---

## 2. Primitive Types

```typescript
Type.String()                          // string
Type.Number()                          // number
Type.Integer()                         // integer
Type.Boolean()                         // boolean
Type.String({ description: "..." })    // with description
Type.Number({ minimum: 0, maximum: 100 })  // with constraints
```

---

## 3. String Enums (Google-compatible)

**Always** use `StringEnum` from `@mariozechner/pi-ai`. `Type.Union`/`Type.Literal`
does not work with Google's API.

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

// Basic string enum
StringEnum(["create", "read", "update", "delete"] as const)

// With description and default
StringEnum(["create", "read", "update", "delete"] as const, {
  description: "CRUD action to perform",
  default: "read",
})
```

---

## 4. Object & Nested Schemas

### Nested objects

```typescript
Type.Object({
  config: Type.Object({
    name: Type.String({ description: "Config name" }),
    enabled: Type.Boolean({ description: "Whether enabled" }),
  }),
})
```

### Record types

```typescript
Type.Record(Type.String(), Type.String())           // { [key: string]: string }
Type.Record(Type.String(), Type.Any())               // { [key: string]: any }
```

---

## 5. Arrays & Tuples

```typescript
Type.Array(Type.String())                            // string[]
Type.Array(Type.Object({ name: Type.String() }))     // { name: string }[]
Type.Array(Type.String(), { minItems: 1 })           // non-empty array
```

---

## 6. Optional Fields & Defaults

```typescript
Type.Optional(Type.String())                         // string | undefined
Type.Optional(Type.String({ description: "..." }))   // optional with description
Type.Number({ default: 10 })                         // number (default: 10)
Type.Optional(Type.Number({ default: 10 }))          // number | undefined (default: 10)
```

---

## 7. Description Best Practices

- Every field should have a `description`
- Be specific: "Name of the file to process" beats "The name"
- Include valid values when constrained: "Sort order: 'asc' or 'desc'"
- Mention defaults in the description: "Max results (default: 50)"

```typescript
Type.Object({
  path: Type.String({ description: "Absolute or relative file path" }),
  pattern: Type.String({ description: "Regex pattern to search for" }),
  maxResults: Type.Optional(
    Type.Number({ description: "Maximum number of results (default: 50)", minimum: 1 })
  ),
  caseSensitive: Type.Optional(
    Type.Boolean({ description: "Whether to match case (default: false)" })
  ),
})
```

---

## 8. Reusable Sub-schemas

Extract sub-schemas as named constants for reuse and clarity:

```typescript
const TaskItem = Type.Object({
  agent: Type.String({ description: "Name of the agent to invoke" }),
  task: Type.String({ description: "Task to delegate to the agent" }),
});

pi.registerTool({
  name: "parallel",
  parameters: Type.Object({
    tasks: Type.Array(TaskItem, {
      description: "Array of {agent, task} for parallel execution",
      minItems: 1,
    }),
  }),
  // ...
});
```

## 9. Empty Parameters

For tools that take no parameters:

```typescript
pi.registerTool({
  name: "list_items",
  parameters: Type.Object({}),
  // ...
});
```

## 10. Common Parameter Patterns

### File path

```typescript
path: Type.String({ description: "File path, relative to project root or absolute" })
```

### File pattern / glob

```typescript
pattern: Type.String({ description: 'Glob pattern, e.g. "**/*.ts" or "src/**/*.lua"' })
```

### Action enum

```typescript
action: StringEnum(["list", "get", "create", "update", "delete"] as const)
```

### Pagination

```typescript
page: Type.Optional(Type.Number({ description: "Page number (1-based, default: 1)", minimum: 1 })),
limit: Type.Optional(Type.Number({ description: "Items per page (default: 20, max: 100)", maximum: 100 })),
```

### Mode / format selection

```typescript
format: StringEnum(["json", "table", "compact"] as const)
mode: StringEnum(["interactive", "batch", "dry-run"] as const)
```

### Multi-selection

```typescript
ids: Type.Array(Type.String({ description: "Item IDs to process" }), { minItems: 1 })
```

### Key-value config

```typescript
options: Type.Optional(Type.Record(Type.String(), Type.Any(), { description: "Arbitrary key-value options" }))
```
