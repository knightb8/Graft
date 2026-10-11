# Tripartite Linking Guide: ADRs, Features, and Implementations

Graft models codebases across three interdependent architectural pillars:
1. **Documentation / ADRs (Why)**: High-level architectural intent, decisions, and constraints (`docs/adr/*.md`).
2. **Specifications / BDD Features (What)**: Declarative, executable behavioral contracts (`features/**/*.feature`).
3. **Source Code / Implementations (How)**: Production code and step definitions (`src/**/*`, `features/steps/**/*`).

---

## Semantic Edge Taxonomy

| Edge Relation | Semantic Meaning | Source Domain | Target Domain | How to Declare |
| :--- | :--- | :--- | :--- | :--- |
| **`influences`** | An architectural decision governs a feature | Documentation (ADR) | Specification (Feature) | `@adr:<path>` on Feature or `[ADR](<path>)` link in description |
| **`covers`** | A feature or scenario specifies/exercises code | Specification (Feature / Scenario) | Source Code / Tests | `@covers:<path>` tag on Feature or Scenario |
| **`documents`** | Documentation explains or references code/specs | Documentation (Markdown) | Code / Spec / ADR | `[Title](<relative-path>)` in any `.md` doc |
| **`verifies`** | A test exercises an implementation | Test Code | Implementation Code | Test execution references |
| **`references`** | General auxiliary mention / asset | Any | Config / Asset / Spec | `@ref:<path>` tag on Feature or Scenario |

---

## Concrete Gherkin Example

```gherkin
@core
@adr:docs/adr/0001-optical-acquisition.md
@covers:src/twoflower/desk/motion.py
@covers:features/steps/desk_capture_steps.py
Feature: Physical Desk Optical Acquisition and Spread Rectification
  Governed by [ADR 0001: Optical Desk Acquisition](docs/adr/0001-optical-acquisition.md).

  As a digital preservation pictographer
  I want to optically capture physical book spreads via desk camera with motion settling
  So that physical books can be losslessly compiled into standardized PDF documents

  @covers:src/twoflower/desk/motion.py
  Scenario: Autonomous motion settling captures a physical book spread
    Given a live camera feed observing an open book spread
    When a page is flipped and motion settles for 600 milliseconds
    Then an acquisition trigger should fire

  @covers:src/twoflower/desk/occlusion.py
  Scenario: Clamping outer margins with thumbs while protecting text boundaries
    Given an open book spread with operator thumbs holding the outer margin clamp zones
    When the occlusion gatekeeper verifies that printed text boundaries are unobstructed
    Then the capture should proceed
```

---

## How It Appears in the Visualizer (`graft viz`)

1. **Force-Directed Graph**:
   - Purple documentation node (`docs/adr/0001-...md`) connects via an **`influences`** edge to the emerald green feature node (`desk_capture-40.feature`).
   - Emerald green feature node connects via **`covers`** edges to blue source code nodes (`motion.py`, `occlusion.py`).
2. **Detail Panel**:
   - Selecting the feature node highlights:
     - **Incoming ("Depended on by")**: `influences` from `ADR 0001`.
     - **Outgoing ("Depends on")**: `covers` pointing to `motion.py`, `occlusion.py`, and `desk_capture_steps.py`.
