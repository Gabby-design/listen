---
doc: SYSTEM
purpose: "The manifest of the AI system itself: what built it, what exists, what was deliberately not built, what the owner overrode, what is still unconfirmed"
authority: reference
hosts_rules: []
mirrors_rules: [RULE-AGENT-001]
last_reviewed: "2026-09-22"
initializer_version: "v3 (gabby 2.0.0)"
initializer_source: "~/.agents/skills/gabby-system/INITIALIZER.md"
gabby_version: 2.0.0
global_system: "~/.agents"
prd_dir: "docs/ai/prd"
vendored: []
context_docs: [MEMORY, NOTES, CHANGELOG]   # derived agent-facing copies; [] = off
caveman: "inherit"                        # informational; the switch is .caveman.json (gabby caveman <mode>)
generated_at: "2026-09-22"
last_upgraded_at: null
last_amended_at: null
canonical_core: "docs/ai/AGENT-CORE.md"
package_manager: "npm"
mode_history:
  - { date: "2026-09-22", mode: "ADOPT", note: "ADOPT performed on 2026-09-22" }
agents:
  - { name: "AGENTS.md",                       link: "symlink" }
  - { name: "CLAUDE.md",                       link: "symlink" }
  - { name: "GEMINI.md",                       link: "symlink" }
  - { name: ".github/copilot-instructions.md", link: "symlink" }
  - { name: ".agents/rules/00-agent-core.md",  link: "pointer", reason: "Antigravity workspace rules directory" }
modules:
  present:
    - AGENT-CORE
    - INDEX
    - SYSTEM
    - RULES
    - CONSTITUTION
    - WORKFLOW
    - VERIFICATION
    - MEMORY
    - HANDOFF
    - NOTES
    - CHANGELOG
  pruned:
    - { module: "UPGRADES.md",   reason: "created lazily on the first upgrade" }
    - { module: "AMENDMENTS.md", reason: "created lazily on the first amendment" }
  not_applicable: []
verification_commands:
  typecheck: "npm run typecheck"
  lint: "npm run lint"
  test: "npm test"
  build: "npm run build"
customizations: []
open_confirmations: []
---

# SYSTEM — the manifest

> This document describes the **AI system**, not the product. Project knowledge never lives here. If the manifest and the repository disagree, the repository wins and this file is corrected. Written **last** in every mode, after the changes it describes have landed.

## What this system is

<!-- Two paragraphs: generated when, by which mode, over what kind of repository; what the system is for (any agent can enter, read the entry point + current-state docs, and continue without the previous agent's conversation). -->

## Initialization / adoption summary

<!-- Mode evidence; tier chosen; derived facts (all [verified]); convention conflicts found and resolved (C-01…); migration ledger dispositions. -->

## Source-of-truth hierarchy in force

See [`AGENT-CORE.md`](./AGENT-CORE.md) § 3 — including 6a, the global system.

## Module decisions and their rationale

<!-- Why each pruned / not-applicable module is absent; what would make it applicable. -->

## Owner customizations and why they are protected

<!-- One paragraph per CUST-xxx, or "None yet." -->

## Outstanding confirmations

<!-- Mirror of open_confirmations, or "None." -->

## How to upgrade this system

`agent upgrade` in the repository root repairs entry points and vendored copies and prints the UPGRADE prompt; the agent then follows INITIALIZER §24 (dry-run delta table → owner approval → additive execution → `UPGRADES.md` entry → this manifest last). Scaffolding may change; project knowledge never does.

## How to amend a rule in this system

State the rule to any agent ("AMEND: …"). It normalizes it (actor / trigger / obligation / exception / proof), reads [`RULES.md`](./RULES.md) first, cascades to every mirror and executable artifact, checks for orphaned old instructions, appends `AMENDMENTS.md`, and updates this manifest (INITIALIZER §25).
