@viz
Feature: Left Tree-View Picker Panel in Visualizer
  As a developer inspecting architecture in the Graft visualizer
  I want a tree-view panel on the left to select which subdirectories and files to visualize
  So that I can isolate subsystems and focus on specific parts of the codebase

  Background:
    Given a visualization dataset containing directories and files across the codebase

  Scenario: Filtering visualizer nodes by selected subdirectories
    When the user selects only directory "src/graph" in the left tree-view panel
    Then only nodes belonging to "src/graph" should be displayed on the canvas
    And nodes in other directories should be hidden from the visualizer

  Scenario: Deselecting a directory in the tree-view panel
    When the user deselects directory "test" in the tree-view panel
    Then all descendant files and symbols under "test" should be excluded from view
    And the directory checkbox should reflect the deselected state

  Scenario: Hierarchical cascade when toggling directory checkboxes
    When the user checks a parent directory in the tree-view panel
    Then all child subdirectories and files should become selected
    And selecting a subset of child files should set the parent directory to indeterminate

  Scenario: Collapsing and expanding the left tree-view panel
    When the user collapses the left tree-view panel
    Then the sidebar should be hidden to give full width to the canvas
    And the user can expand the panel again using the toggle control
