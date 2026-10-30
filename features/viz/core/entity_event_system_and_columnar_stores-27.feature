@viz @adr:docs/adr/0023-entity-event-system-and-columnar-typedarray-stores.md
Feature: Entity Event System and Columnar TypedArray Stores
  As a developer inspecting an enterprise codebase with tens of thousands of symbols in Graft
  I want galaxy graph layout, physics, and interactions to execute across contiguous columnar TypedArrays and a zero-allocation event ring buffer
  So that the visualizer maintains locked sixty frames per second without garbage collection stutter or object graph memory bottlenecks

  Background:
    Given a large codebase visualization graph containing tens of thousands of nodes and cross-cutting edges
    And the Entity Event System is initialized with pre-allocated columnar component stores

  @covers:viewer/wasm-physics.ts @covers:docs/devdocs/entity-event-system-tech-spec.md
  Scenario: Columnar component stores allocate contiguous typed memory with zero heap fragmentation
    When the graph dataset is ingested into the entity store
    Then each node should receive a dense integer entity identifier
    And node positions should be stored in contiguous Float32Array coordinate columns
    And visual attributes should be stored in packed thirty-two-bit color and radius columns
    And iterating across all node entities should process memory sequentially without pointer chasing

  @covers:viewer/wasm-physics.ts @covers:docs/devdocs/entity-event-system-tech-spec.md
  Scenario: Pre-allocated event ring buffer queues interactions with zero per-frame garbage collection
    Given the visualizer interaction loop is running at sixty frames per second
    When user pointer drag and hover interactions occur
    Then interaction signals should be packed as numeric tuples into a fixed-capacity ring buffer
    And zero JavaScript event objects should be allocated on the heap during the frame
    When the frame ticks
    Then the event dispatcher system should drain the ring buffer and update affected entity components

  @covers:viewer/graph.ts @covers:docs/devdocs/entity-event-system-tech-spec.md
  Scenario: Discrete state bitmask updates selection and pinned flags without object property mutation
    When a node entity is clicked or dragged
    Then its state bitmask should update using bitwise flag operations
    And the pinned bit should lock the node at the pointer coordinates during physics simulation
    And unselected sibling nodes should remain unmutated in memory

  @covers:viewer/layout/stress-sgd.ts @covers:viewer/relations.ts @covers:docs/devdocs/entity-event-system-tech-spec.md
  Scenario: CSR topology traversal executes causal blast propagation directly across typed index arrays
    When a blast analysis event is triggered for a seed entity
    Then the causal blast system should traverse edge connections using flat Compressed Sparse Row index arrays
    And directional relation weights should be applied from the canonical relations registry
    And terminal verification sinks should extinguish forward energy without allocating traversal objects
    And attenuated energy values should be written directly into the entity blast energy component column

  @covers:viewer/graph.ts @covers:viewer/wasm-physics.ts @covers:docs/devdocs/entity-event-system-tech-spec.md
  Scenario: Direct VBO streaming transfers entity positions into WebGL buffers without data marshalling
    Given the physics simulation updates entity positions for a dirty cluster
    When the WebGL render system prepares the frame draw call
    Then updated coordinate slices should stream directly into GPU vertex buffer objects via bufferSubData
    And zero intermediate object transformations or string serializations should be performed
