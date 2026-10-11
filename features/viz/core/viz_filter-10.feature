@viz
Feature: Scope and Directory Filtering in Visualizer
  As a developer inspecting an architecture in the Graft visualizer
  I want to filter the canvas by scope (documentation, code, specifications) and exclude directories
  So that I can declutter dense graphs and focus on the relevant architecture

  Background:
    Given a visualization dataset containing mixed code, doc, and spec nodes across multiple folders

  Scenario: Toggling architectural scope in visualization
    When the user toggles the scope filter to "docs"
    Then the visualizer should display only documentation nodes
    And non-documentation nodes should be hidden from the canvas and counts

  Scenario: Excluding specific directories in the viewer
    When the user excludes directory "features/" from the view
    Then nodes under "features/" should be hidden from the canvas
    And outline file trees should omit the excluded directory

  Scenario: Exporting filtered visualization
    When the user exports the visualizer with scope "code" and excluded directory "test"
    Then the generated static HTML should embed only nodes matching the filter criteria
