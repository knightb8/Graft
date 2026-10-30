@viz @adr:docs/adr/0015-hierarchical-tree-backbone-and-curved-webgl-edges.md @adr:docs/adr/0017-wasm-typedarray-galaxy-physics-and-zero-alloc-rendering.md
Feature: Interactive Bouncy Drag Physics and Original Visualizer Parity
  As a developer exploring a codebase in the WebGL visualizer
  I want node dragging, spring-and-collision physics, curved splines, focus verb labels, contributor badges, and search focus to preserve the full interactive behavior of the original visualizer
  So that the WebGL upgrade accelerates performance without losing any tactile or visual fidelity

  Background:
    Given a visualization graph containing code, documentation, and specification nodes with contributor metadata
    And the WebGL visualizer is mounted and initialized

  @covers:viewer/graph.ts @covers:viewer/wasm-physics.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Interactive node dragging pins the dragged node and drives bouncy spring-and-collision physics on neighbors
    Given a node with connected neighbors is rendered at rest in the visualizer
    When the user drags the node to a new position on the canvas
    Then the dragged node should be pinned to the pointer coordinates even after Sigma updates graph attributes
    And the physics simulation should reheat and apply Hookean rest-length spring forces and collision repulsion
    And connected neighbor nodes should elastically follow and wobble in response to the dragged node
    When the user releases the dragged node
    Then the pin should be released and connected nodes should coast with velocity damping to a stable equilibrium

  @covers:viewer/graph.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Manual reheat and filter re-bounce energize the velocity-Verlet simulation
    When the user triggers a layout reheat or changes a filter while re-bounce mode is active
    Then the simulation alpha should re-energize and relax node positions using family rest lengths and collision radii

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Edge family grammar and focus-mode incident verb labels
    When edges are styled by relation family
    Then structural part-of edges should render thicker without arrowheads
    And dependency and contract edges should render as curved splines with directional arrowheads
    When the user selects or hovers a node
    Then outgoing dependency edges should highlight in amber and incoming dependant edges should highlight in accent teal
    And incident edges on the focused node should expose their human-readable relation verb label
    And non-incident background nodes and edges outside the direct neighborhood should dim

  @wip
  # Note: Contributor owner badge fan-out on canvas nodes deferred during WebGL migration; metadata is rendered in detail panel inspector.
  @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Contributor owner badges fan out on nodes and toggle as a pure decoration
    Given nodes in the graph carry contributor owner commit histories
    When contributor owner badges are enabled
    Then up to two contributor initials badges plus a "+N" overflow badge should fan out from each owned node's upper-right perimeter
    When the user toggles the people decoration chip off
    Then contributor badges should hide without changing the count of visible graph nodes

  @covers:viewer/graph.ts @covers:viewer/main.ts @covers:test/viz-sigma.test.ts
  Scenario: Search query dimming and focusing the first matching node
    When the user enters a search query in the visualizer search box
    Then nodes whose names do not match the query should dim while matching nodes remain at full prominence
    When the user triggers focus on the first matching node
    Then the camera should center and zoom onto the matching node and select it in the detail panel
