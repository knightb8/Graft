@viz @adr:docs/adr/0017-wasm-typedarray-galaxy-physics-and-zero-alloc-rendering.md
Feature: WASM and TypedArray Vectorized Galaxy Physics and Zero-Allocation Rendering
  As a developer exploring a large, unaggregated codebase in the Graft visualizer
  I want galaxy layout, filter re-bouncing, camera navigation, and node inspection to execute in flat WebAssembly and TypedArray memory with zero per-frame heap allocations
  So that I can slice, pan, zoom, and inspect multi-thousand-node graphs at 60fps without UI freezes or architectural code-drift back to slow object loops

  Background:
    Given a large codebase graph containing thousands of nodes and edges across multiple subsystems
    And the WASM and TypedArray vector physics engine is initialized

  @covers:viewer/wasm-physics.ts @covers:viewer/data.ts @covers:test/viz-sigma.test.ts
  Scenario: Re-bouncing galaxy clusters via vectorized WASM and TypedArray buffers settles within a single frame budget
    When the user triggers a layout re-bounce across visible subsystem galaxies
    Then the vectorized physics and galaxy separation kernel should execute over contiguous Float32Array and Int32Array buffers
    And each subsystem should compact around its hub and separate from neighboring galaxies with clear void space
    And the layout calculation for a 1000-node graph should complete within a single 16-millisecond interactive frame budget

  @covers:viewer/wasm-physics.ts @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Panning and zooming with radiant galaxy blooms uses a zero-allocation integer spatial hash grid
    Given radiant subsystem blooms are enabled on the canvas
    When the user pans or zooms across dense galaxy clusters
    Then neighborhood cohesion and cluster glow radii should be computed via a flat Int32Array linked-list spatial hash grid in under 2 milliseconds per frame
    And zero string keys or dynamic bucket arrays should be allocated during the frame

  @covers:viewer/graph.ts @covers:test/viz-sigma.test.ts
  Scenario: Selecting, hovering, and searching nodes responds instantaneously without mutating Graphology edge topology
    Given active scope filters and indirect transitive connections are displayed
    When the user hovers a node, selects a node, or types in the search box
    Then visual highlighting should update immediately without dropping or re-adding edges in the underlying graph
    And indirect transitive connections should only be recalculated when the set of visible nodes actually changes


