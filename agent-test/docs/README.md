# Agent Prompts — Dual-Knowledge GDD Architecture

> GDD sub-model receives two perspectives: game design expertise + template code capabilities.
> Main agent reads full template code only at implementation time.

---

## Workflow

```
User Prompt -> Classify -> Scaffold -> GDD -> Assets -> Config -> Code -> Verify
                  |           |          |                          |        |
             (physics)   (copy)   (generate-gdd reads         (read ALL  (debug
                                   design_rules.md +           template   protocol)
                                   template_api.md)            code)
```

| Phase | Action              | Tool/Document                                                                 | Context Cost  |
| ----- | ------------------- | ----------------------------------------------------------------------------- | ------------- |
| 1     | Classify + Scaffold | `classify-game-type`, shell cp                                                | Light         |
| 2     | Generate GDD        | `generate-gdd` (auto-loads `core.md` + `design_rules.md` + `template_api.md`) | Light (agent) |
| 3     | Generate assets     | `generate-game-assets`                                                        | Light         |
| 4     | Update config       | `gameConfig.json`                                                             | Light         |
| 5     | Code Implementation | Read ALL `Base*.ts`, `_Template*.ts`, `{archetype}.md` module manual          | **HEAVY**     |
| 6     | Verify              | `debug_protocol.md`, build, test                                              | Medium        |

**Key**: Agent context stays light until Phase 5. All heavy template reading happens right before coding.

---

## Structure

```
docs/
├── README.md              # This file
├── asset_protocol.md      # Asset generation tool guide
├── debug_protocol.md      # Testing & verification workflow
├── gdd/
│   └── core.md            # (Universal) GDD format structure
└── modules/
    ├── platformer/
    │   ├── design_rules.md    # Game design guide (gameplay, levels, feel)
    │   ├── template_api.md    # Code capability list (behaviors, hooks, config)
    │   └── platformer.md      # Code implementation manual (for coding agent)
    └── ui_heavy/
        ├── design_rules.md    # Game design guide (dialogue, battle, flow)
        ├── template_api.md    # Code capability list (systems, hooks, components)
        └── ui_heavy.md        # Code implementation manual (for coding agent)
```

### Document Roles

| Document            | Read By                | When    | Purpose                                               |
| ------------------- | ---------------------- | ------- | ----------------------------------------------------- |
| `design_rules.md`   | generate-gdd sub-model | Phase 2 | Game designer knowledge: what this genre needs        |
| `template_api.md`   | generate-gdd sub-model | Phase 2 | Code awareness: what the template can do              |
| `core.md`           | generate-gdd sub-model | Phase 2 | Universal GDD format and structure                    |
| `{archetype}.md`    | Main agent             | Phase 5 | Lifecycle, exact types, API signatures, code mistakes |
| `debug_protocol.md` | Main agent             | Phase 6 | Pre-build checklists, error diagnosis                 |

---

## Key Principle

**GDD sub-model gets two complementary inputs:**

1. **Design expertise** (`design_rules.md`) — ensures the game is fun and well-designed
2. **Code awareness** (`template_api.md`) — ensures the design stays within template capabilities

**Main agent** reads full template code only at Phase 5, preserving context for implementation.
