# Step 0: Welcome

This step displays the welcome message and gives the user an overview of what
the initialization process will do.

## Welcome message

Display the following to the user (adapt the wording naturally):

---

👋 Welcome to the **pi-package-template** initialization!

This wizard will walk you through setting up your pi package project in
**4 steps**:

| Step | What happens |
|------|-------------|
| **1. Metadata** | Extract your package name and GitHub username from the repository |
| **2. Requirements** | Verify that Node.js, npm, pi, TypeScript, and Biome are installed |
| **3. Rename** | Replace every template placeholder (`pi-package-template`, `S1M0N38`) with your package's actual name |
| **4. Docs** | Update README and AGENTS.md with your package description |

Each step asks for your confirmation before making changes. You can interrupt
at any time and resume later — progress is saved to `.pi-init.md`.

---

After displaying the overview, ask: **"Ready to start?"**

- If the user confirms → proceed to step 1 (Metadata).
- If the user declines → stop. The state file is not created yet.

## State file

Do NOT create the state file (`.pi-init.md`) until the user confirms.
Once confirmed, copy the template from `assets/template.md` to `.pi-init.md`
in the project root, then proceed to step 1.
