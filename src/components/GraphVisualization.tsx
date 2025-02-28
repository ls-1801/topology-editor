import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import {
  Topology,
  SimulationNode,
  SimulationLink,
  NodeSelection,
} from "../types";

interface GraphVisualizationProps {
  topology: Topology;
  onNodeSelect: (selection: NodeSelection) => void;
}

interface NodePosition {
  [id: string]: { x: number; y: number };
}

const GraphVisualization: React.FC<GraphVisualizationProps> = ({
  topology,
  onNodeSelect,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<
    SimulationNode,
    SimulationLink
  > | null>(null);
  const [nodePositions, setNodePositions] = useState<NodePosition>({});

  // Handle container resizing
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (svgRef.current && containerRef.current) {
        svgRef.current.setAttribute("width", "100%");
        svgRef.current.setAttribute("height", "100%");
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current || !topology.nodes.length) return;

    // Clear any existing visualization
    d3.select(svgRef.current).selectAll("*").remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    // Create SVG element
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Create container for zoom/pan
    const g = svg.append("g");

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Prepare the data for D3 - including main nodes, physical sources, and sinks
    let nodes: SimulationNode[] = [];
    let additionalLinks: SimulationLink[] = [];

    // Add main nodes
    topology.nodes.forEach((node) => {
      // Get existing position if available
      const existingPos = nodePositions[node.connection];

      // Add the main node without fixed position
      nodes.push({
        id: node.connection,
        connection: node.connection,
        grpc: node.grpc,
        capacity: node.capacity,
        sinks: node.sinks,
        links: node.links,
        physical: node.physical,
        nodeType: "main",
        // Don't preserve position, let the simulation position nodes
        x: existingPos?.x,
        y: existingPos?.y,
      } as SimulationNode);

      // Add physical source nodes
      if (node.physical && node.physical.length > 0) {
        const mainPos = nodePositions[node.connection] || { x: 0, y: 0 };
        const numPhysical = node.physical.length;

        node.physical.forEach((source, index) => {
          const sourceId = `${node.connection}-physical-${index}`;
          const existingPos = nodePositions[sourceId];

          // Calculate fixed position relative to main node if no existing position
          // Place sources in a semicircle above the main node
          let px, py;
          if (existingPos) {
            px = existingPos.x;
            py = existingPos.y;
          } else {
            // Angle based on index (from -45 to -135 degrees in a semicircle)
            const angle =
              -Math.PI / 4 -
              (Math.PI / 2) * (index / (numPhysical > 1 ? numPhysical - 1 : 1));
            const radius = 60; // Shorter fixed distance from main node
            px = mainPos.x + radius * Math.cos(angle);
            py = mainPos.y + radius * Math.sin(angle);
          }

          // Add physical source node with dynamic position
          nodes.push({
            id: sourceId,
            connection: source.logical || `Source ${index + 1}`,
            nodeType: "physical",
            // Initial position but not fixed
            x: px,
            y: py,
            // Store parent info for selection
            parentId: node.connection,
            parentIndex: index,
          } as SimulationNode);

          // Add link from physical to main
          additionalLinks.push({
            source: sourceId,
            target: node.connection,
            direction: "physical",
          });
        });
      }

      // Add sink nodes
      if (node.sinks && node.sinks.length > 0) {
        const mainPos = nodePositions[node.connection] || { x: 0, y: 0 };
        const numSinks = node.sinks.length;

        // Important: Use actual array indices for sink nodes
        node.sinks.forEach((sink, index) => {
          console.log(
            `Creating sink node for ${node.connection} at index ${index}:`,
            sink
          );
          const sinkId = `${node.connection}-sink-${index}`;
          const existingPos = nodePositions[sinkId];

          // Calculate fixed position relative to main node if no existing position
          // Place sinks in a semicircle below the main node
          let sx, sy;
          if (existingPos) {
            sx = existingPos.x;
            sy = existingPos.y;
          } else {
            // Angle based on index (from 45 to 135 degrees in a semicircle)
            const angle =
              Math.PI / 4 +
              (Math.PI / 2) * (index / (numSinks > 1 ? numSinks - 1 : 1));
            const radius = 60; // Shorter fixed distance from main node
            sx = mainPos.x + radius * Math.cos(angle);
            sy = mainPos.y + radius * Math.sin(angle);
          }

          // Add sink node with dynamic position
          nodes.push({
            id: sinkId,
            connection: sink.name || `Sink ${index + 1}`,
            nodeType: "sink",
            // Initial position but not fixed
            x: sx,
            y: sy,
            // Store parent info for selection - the INDEX is critical for lookup
            parentId: node.connection,
            parentIndex: index, // This must match the index in node.sinks array
          } as SimulationNode);

          // Add link from main to sink
          additionalLinks.push({
            source: node.connection,
            target: sinkId,
            direction: "sink",
          });
        });
      }
    });

    // Generate links from nodes' downstream and upstream relationships
    const mainLinks: SimulationLink[] = [];

    // Process downstream links
    topology.nodes.forEach((node) => {
      if (node.links?.downstreams) {
        node.links.downstreams.forEach((targetId) => {
          mainLinks.push({
            source: node.connection,
            target: targetId,
            direction: "downstream",
          });
        });
      }
    });

    // Process upstream links (if any)
    topology.nodes.forEach((node) => {
      if (node.links?.upstreams) {
        node.links.upstreams.forEach((sourceId) => {
          // Check if we already have this link from downstream relationships
          const existingLink = mainLinks.find(
            (link) =>
              link.source === sourceId && link.target === node.connection
          );

          // Only add if not already added
          if (!existingLink) {
            mainLinks.push({
              source: sourceId,
              target: node.connection,
              direction: "upstream",
            });
          }
        });
      }
    });

    // Combine all links
    const links = [...mainLinks, ...additionalLinks];

    // Create the force simulation
    const simulation = d3
      .forceSimulation<SimulationNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<SimulationNode, SimulationLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            // Control distance based on link types
            const source = d.source as SimulationNode;
            const target = d.target as SimulationNode;

            // Shorter distance for physical/sink links
            if (
              source.nodeType === "physical" ||
              target.nodeType === "physical"
            )
              return 80;
            if (source.nodeType === "sink" || target.nodeType === "sink")
              return 80;

            // Longer distance for main node connections
            return 200;
          })
      )
      .force(
        "charge",
        d3.forceManyBody().strength((d) => {
          // Control repulsion based on node type
          const node = d as SimulationNode;
          if (node.nodeType === "main") return -500;
          return -100; // Less repulsion for sources/sinks but still some
        })
      )
      .force(
        "collide",
        d3.forceCollide().radius((d) => {
          // Collision radius based on node type
          const node = d as SimulationNode;
          if (node.nodeType === "main") return 70;
          return 20;
        })
      )
      .force("center", d3.forceCenter(width / 2, height / 2))
      .alpha(0.5) // Higher alpha for more dynamic movement
      .alphaDecay(0.02) // Slower cooling for longer-lasting movement
      .on("tick", ticked);

    // Store the simulation reference for later use
    simulationRef.current = simulation;

    // Create the links
    const link = g
      .append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("class", (d) => `link ${d.direction}`)
      .attr("stroke-width", (d) => {
        // Make main connection links thicker
        if (d.direction === "downstream" || d.direction === "upstream")
          return 2;
        return 1.5; // Thinner for physical/sink links
      })
      .attr("marker-end", (d) => {
        // Use different arrowheads for different link types
        if (d.direction === "downstream" || d.direction === "upstream")
          return "url(#arrowhead-main)";
        if (d.direction === "physical") return "url(#arrowhead-physical)";
        if (d.direction === "sink") return "url(#arrowhead-sink)";
        return "url(#arrowhead-main)";
      });

    // Add arrow markers for directed edges
    const defs = svg.append("defs");

    // Main connection arrow (used for both downstream and upstream)
    defs
      .append("marker")
      .attr("id", "arrowhead-main")
      .attr("viewBox", "0 -6 12 12")
      .attr("refX", (d) => 25) // Position the arrow near the target node
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 10)
      .attr("markerHeight", 10)
      .append("path")
      .attr("d", "M0,-6L12,0L0,6")
      .attr("fill", "#4f8fff");

    // Physical arrow
    defs
      .append("marker")
      .attr("id", "arrowhead-physical")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", (d) => 18)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#8BC34A");

    // Sink arrow
    defs
      .append("marker")
      .attr("id", "arrowhead-sink")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", (d) => 18)
      .attr("refY", 0)
      .attr("orient", "auto")
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#FF9800");

    // Function to generate distinct colors for logical schemas
    const getLogicalSchemaColor = (schemaName: string) => {
      // Define a better hash function to convert schema name to a deterministic color
      const hash = (str: string) => {
        // Use a more collision-resistant hash
        let h1 = 1779033703,
          h2 = 3144134277,
          h3 = 1013904242,
          h4 = 2773480762;
        for (let i = 0, k; i < str.length; i++) {
          k = str.charCodeAt(i);
          h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
          h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
          h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
          h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
        }
        return [
          (h1 ^ h2 ^ h3 ^ h4) >>> 0,
          (h2 ^ h1) >>> 0,
          (h3 ^ h1) >>> 0,
          (h4 ^ h1) >>> 0,
        ];
      };

      const hashValues = hash(schemaName);

      // Generate HSL color components from different hash values
      // This provides better distribution and more distinct colors
      const h = hashValues[0] % 360; // Hue (0-359)
      const s = 0.65 + (hashValues[1] % 20) / 100; // Saturation (0.65-0.85)
      const l = 0.45 + (hashValues[2] % 15) / 100; // Lightness (0.45-0.60)

      return d3.hsl(h, s, l).toString();
    };

    // Use a predefined color palette for better visual distinction
    const colorPalette = [
      "#1f77b4", // blue
      "#ff7f0e", // orange
      "#2ca02c", // green
      "#d62728", // red
      "#9467bd", // purple
      "#8c564b", // brown
      "#e377c2", // pink
      "#7f7f7f", // gray
      "#bcbd22", // olive
      "#17becf", // teal
      "#aec7e8", // light blue
      "#ffbb78", // light orange
      "#98df8a", // light green
      "#ff9896", // light red
      "#c5b0d5", // light purple
      "#c49c94", // light brown
      "#f7b6d2", // light pink
      "#c7c7c7", // light gray
      "#dbdb8d", // light olive
      "#9edae5", // light teal
    ];

    // Create a color map for all logical schemas for consistency
    const schemaColorMap = new Map<string, string>();
    // Track which logical schemas actually exist
    const existingSchemas = new Set<string>();

    if (topology.logical) {
      // Sort schemas alphabetically to ensure consistent color assignment regardless of order
      const sortedSchemas = [...topology.logical].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      // Assign colors to schemas
      sortedSchemas.forEach((schema, index) => {
        // Use palette colors first, then fall back to generated colors
        const color =
          index < colorPalette.length
            ? colorPalette[index]
            : getLogicalSchemaColor(schema.name);

        schemaColorMap.set(schema.name, color);
        existingSchemas.add(schema.name);
      });
    }

    // Function to check if a logical schema exists
    const logicalSchemaExists = (name: string): boolean => {
      return existingSchemas.has(name);
    };

    // Create the nodes
    const node = g
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(
        d3
          .drag<SVGGElement, SimulationNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      );

    // Add background warning pattern for invalid schemas
    const warningPattern = defs
      .append("pattern")
      .attr("id", "warning-pattern")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 10)
      .attr("height", 10)
      .attr("patternTransform", "rotate(45)");

    // Add yellow stripes to the pattern
    warningPattern
      .append("rect")
      .attr("width", 5)
      .attr("height", 10)
      .attr("transform", "translate(0,0)")
      .attr("fill", "#FFD700"); // Gold/yellow color

    // Add black background to the pattern
    warningPattern
      .append("rect")
      .attr("width", 5)
      .attr("height", 10)
      .attr("transform", "translate(5,0)")
      .attr("fill", "#000000"); // Black

    // Add drop target indicators to main nodes
    node
      .filter((d) => d.nodeType === "main")
      .append("circle")
      .attr("class", "drop-target")
      .attr("r", 35) // Slightly larger than the main node circle
      .attr("fill", "rgba(255, 255, 255, 0.1)")
      .attr("stroke", "rgba(255, 255, 255, 0.4)")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4 2")
      .style("opacity", 0) // Hidden by default, will be shown during dragging
      .style("pointer-events", "none"); // Don't interfere with mouse events

    // Add circles to nodes with different sizes and colors based on type and capacity
    node
      .append("circle")
      .attr("class", "node-circle")
      .attr("r", (d) => {
        // Size based on node type
        if (d.nodeType === "main") return 30;
        if (d.nodeType === "physical") return 15;
        if (d.nodeType === "sink") return 15;
        return 20; // Default
      })
      .attr("fill", (d) => {
        // For physical sources, color based on logical schema
        if (d.nodeType === "physical") {
          // Get parent node to find the right physical source
          const parentNode = topology.nodes.find(
            (n) => n.connection === d.parentId
          );
          if (
            parentNode &&
            parentNode.physical &&
            d.parentIndex !== undefined
          ) {
            const source = parentNode.physical[d.parentIndex];
            if (source && source.logical) {
              // Check if this logical schema actually exists
              if (!logicalSchemaExists(source.logical)) {
                return "url(#warning-pattern)"; // Use warning pattern for non-existent schema
              }

              // Use the color from the schema map if available
              if (schemaColorMap.has(source.logical)) {
                return schemaColorMap.get(source.logical)!;
              }
              // Fallback to generating a color on the fly
              return getLogicalSchemaColor(source.logical);
            }
          }
          return "#8BC34A"; // Default green if no logical schema found
        }

        if (d.nodeType === "sink") return "#FF9800"; // Orange for sinks

        // For main nodes, color based on capacity
        const baseColor = d3.rgb("#4285F4");
        const capacityScale = d3
          .scaleLinear()
          .domain([1, 10]) // Assuming capacity range from 1-10
          .range([0.7, 1.3]);

        return baseColor.darker(capacityScale(d.capacity || 1)).toString();
      })
      .attr("stroke", (d) => {
        // For physical sources with non-existent logical schemas, add black stroke
        if (d.nodeType === "physical") {
          const parentNode = topology.nodes.find(
            (n) => n.connection === d.parentId
          );
          if (
            parentNode &&
            parentNode.physical &&
            d.parentIndex !== undefined
          ) {
            const source = parentNode.physical[d.parentIndex];
            if (
              source &&
              source.logical &&
              !logicalSchemaExists(source.logical)
            ) {
              return "#000"; // Black border for warning
            }
          }
        }
        return "#fff"; // Default white stroke
      })
      .attr("stroke-width", (d) => {
        // Thicker stroke for physical sources with warning
        if (d.nodeType === "physical") {
          const parentNode = topology.nodes.find(
            (n) => n.connection === d.parentId
          );
          if (
            parentNode &&
            parentNode.physical &&
            d.parentIndex !== undefined
          ) {
            const source = parentNode.physical[d.parentIndex];
            if (
              source &&
              source.logical &&
              !logicalSchemaExists(source.logical)
            ) {
              return 2; // Thicker border for warning
            }
          }
        }
        return d.nodeType === "main" ? 2 : 1;
      })
      // Add click handler directly to the circle for better hit detection
      .on("click", function (event, d) {
        event.stopPropagation();

        // Use the central selection handler
        selectGraphNode(d);

        // Prevent event bubbling further
        if (event.cancelable) event.preventDefault();
      });

    // Add text labels to nodes - using connection as display name
    node
      .append("text")
      .text((d) => d.connection)
      .attr("dy", (d) => (d.nodeType === "main" ? 5 : 25)) // Position text below for smaller nodes
      .attr("text-anchor", "middle")
      .attr("font-size", (d) => (d.nodeType === "main" ? "12px" : "10px"))
      .style("pointer-events", "none");

    // Add a tooltip to the nodes using title element
    node.append("title").text((d) => {
      // For physical sources with non-existent logical schemas, add warning message
      if (d.nodeType === "physical") {
        const parentNode = topology.nodes.find(
          (n) => n.connection === d.parentId
        );
        if (parentNode && parentNode.physical && d.parentIndex !== undefined) {
          const source = parentNode.physical[d.parentIndex];
          if (
            source &&
            source.logical &&
            !logicalSchemaExists(source.logical)
          ) {
            return `Warning: Logical schema "${source.logical}" does not exist`;
          }
        }
      }
      return d.connection; // Default tooltip shows the node name
    });

    // Node selection handler with proper typing
    function selectGraphNode(d: SimulationNode) {
      console.log("Selecting node:", d);

      // For main nodes
      if (d.nodeType === "main") {
        // Look up the actual node in the topology
        const actualNode = topology.nodes.find(
          (node) => node.connection === d.id
        );
        if (actualNode) {
          onNodeSelect({ type: "main", nodeId: d.id });
        }
      }
      // For physical source nodes
      else if (
        d.nodeType === "physical" &&
        d.parentId !== undefined &&
        d.connection
      ) {
        console.log(
          `Selecting physical source node: parentId=${d.parentId}, name=${d.connection}`
        );
        onNodeSelect({
          type: "physical",
          nodeId: d.id,
          parentId: d.parentId,
          name: d.connection,
          physicalSourceIndex: d.parentIndex,
        });
      }
      // For sink nodes
      else if (
        d.nodeType === "sink" &&
        d.parentId !== undefined &&
        d.connection
      ) {
        console.log(
          `Selecting sink node: parentId=${d.parentId}, name=${d.connection}`
        );
        onNodeSelect({
          type: "sink",
          nodeId: d.id,
          parentId: d.parentId,
          name: d.connection,
          sinkIndex: d.parentIndex,
        });
      }
    }

    // Add click handler for node selection - allow selection of all node types
    node.on("click", function (event, d) {
      console.log("click");
      event.stopPropagation();
      selectGraphNode(d);
      if (event.cancelable) event.preventDefault();
    });

    // Clear node selection when clicking on empty space
    svg.on("click", function () {
      onNodeSelect(null);
    });

    // Update positions on each tick of the simulation
    function ticked() {
      // Let the simulation handle positions naturally
      // No need to update positions of source/sink nodes manually

      // Update links with arrows - all straight lines now
      link.attr("d", (d) => {
        const sourceX = (d.source as SimulationNode).x || 0;
        const sourceY = (d.source as SimulationNode).y || 0;
        const targetX = (d.target as SimulationNode).x || 0;
        const targetY = (d.target as SimulationNode).y || 0;

        // Straight lines for all links
        return `M${sourceX},${sourceY} L${targetX},${targetY}`;
      });

      node.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);

      // Save positions of all nodes after each tick
      // This helps maintain stability even during automatic layout adjustments
      nodes.forEach((d) => {
        if (d.x != null && d.y != null) {
          setNodePositions((prev) => {
            // Only update if position has changed significantly
            const existing = prev[d.id];
            if (
              !existing ||
              Math.abs(existing.x - d.x!) > 5 ||
              Math.abs(existing.y - d.y!) > 5
            ) {
              return {
                ...prev,
                [d.id]: { x: d.x!, y: d.y! },
              };
            }
            return prev;
          });
        }
      });
    }

    // Drag functions with position persistence
    function dragstarted(
      event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>,
      d: SimulationNode
    ) {
      if (!event.active) simulation.alphaTarget(0.3).restart();

      // Fix position during drag
      d.fx = d.x;
      d.fy = d.y;

      // If this is a physical source or sink, show all potential drop targets (main nodes)
      if (d.nodeType === "physical" || d.nodeType === "sink") {
        // Show drop targets on all main nodes except the current parent
        const originalParentId = d.id.split("-")[0];

        d3.selectAll(".drop-target")
          .filter(function () {
            // Get the parent node id from the node's data
            const nodeData = d3
              .select((this as any).parentNode)
              .datum() as SimulationNode;
            return nodeData.id !== originalParentId; // Don't show drop target on original parent
          })
          .transition()
          .duration(200)
          .style("opacity", 1);

        // Highlight the dragged node and add dragging class
        d3.select(event.sourceEvent.target.parentNode).classed(
          "dragging",
          true
        );

        d3.select(event.sourceEvent.target)
          .transition()
          .duration(200)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 3);
      }
    }

    function dragged(
      event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>,
      d: SimulationNode
    ) {
      // Update fixed position during drag
      d.fx = event.x;
      d.fy = event.y;

      // If dragging a physical source or sink, highlight the closest main node
      if (d.nodeType === "physical" || d.nodeType === "sink") {
        const originalParentId = d.id.split("-")[0];
        const mainNodes = nodes.filter(
          (n) => n.nodeType === "main" && n.id !== originalParentId
        );

        // Find the closest main node
        let closestNode: SimulationNode | null = null;
        let closestDistance = Infinity;

        for (const mainNode of mainNodes) {
          const dx = (mainNode.x || 0) - (d.x || 0);
          const dy = (mainNode.y || 0) - (d.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < closestDistance) {
            closestDistance = distance;
            closestNode = mainNode;
          }
        }

        // Highlight the closest drop target if within range
        d3.selectAll(".drop-target")
          .filter(function () {
            const nodeData = d3
              .select((this as any).parentNode)
              .datum() as SimulationNode;
            return nodeData.id !== originalParentId;
          })
          .style("stroke", "rgba(255, 255, 255, 0.4)")
          .style("stroke-width", 2);

        if (closestNode && closestDistance < 50) {
          d3.selectAll(".drop-target")
            .filter(function () {
              const nodeData = d3
                .select((this as any).parentNode)
                .datum() as SimulationNode;
              return nodeData.id === closestNode!.id;
            })
            .style("stroke", "#4CAF50") // Green highlight
            .style("stroke-width", 3);
        }
      }
    }

    function dragended(
      event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>,
      d: SimulationNode
    ) {
      if (!event.active) simulation.alphaTarget(0);

      // Hide all drop targets
      d3.selectAll(".drop-target")
        .transition()
        .duration(200)
        .style("opacity", 0);

      // Remove the dragging class
      d3.select(event.sourceEvent.target.parentNode).classed("dragging", false);

      // Reset the dragged node's appearance
      d3.select(event.sourceEvent.target)
        .transition()
        .duration(200)
        .attr(
          "stroke",
          d.nodeType === "main"
            ? "#fff"
            : d.nodeType === "physical"
            ? isSourceWithMissingSchema(d)
              ? "#000"
              : "#fff"
            : "#fff"
        )
        .attr(
          "stroke-width",
          d.nodeType === "main"
            ? 2
            : d.nodeType === "physical"
            ? isSourceWithMissingSchema(d)
              ? 2
              : 1
            : 1
        );

      // Helper function to check if a physical source has a missing schema
      function isSourceWithMissingSchema(d: SimulationNode): boolean {
        if (d.nodeType === "physical") {
          const parentNode = topology.nodes.find(
            (n) => n.connection === d.parentId
          );
          if (
            parentNode &&
            parentNode.physical &&
            d.parentIndex !== undefined
          ) {
            const source = parentNode.physical[d.parentIndex];
            if (
              source &&
              source.logical &&
              !logicalSchemaExists(source.logical)
            ) {
              return true;
            }
          }
        }
        return false;
      }

      // Check if this is a physical source or sink node that's been dragged onto a main node
      if (d.nodeType === "physical" || d.nodeType === "sink") {
        // Find all main nodes
        const mainNodes = nodes.filter((n) => n.nodeType === "main");

        // Check if dragged over a main node (other than its current parent)
        for (const mainNode of mainNodes) {
          // Skip the original parent for physical/sink nodes
          const originalParentId = d.id.split("-")[0];
          if (mainNode.id === originalParentId) continue;

          // Calculate distance to each main node's center
          const dx = (mainNode.x || 0) - (d.x || 0);
          const dy = (mainNode.y || 0) - (d.y || 0);
          const distance = Math.sqrt(dx * dx + dy * dy);

          // If within the main node's radius, trigger reassignment
          if (distance < 50) {
            // Increased drop target radius for better usability
            // Get the index of the physical source or sink being moved
            let indexValue = -1;
            if (d.parentIndex !== undefined) {
              indexValue = d.parentIndex;
            } else {
              // Fallback to parsing from ID if needed
              const parts = d.id.split("-");
              if (parts.length >= 3) {
                indexValue = parseInt(parts[2]);
              }
            }

            console.log("Dragged node info:", d);
            console.log(
              "Dragging from:",
              originalParentId,
              "to:",
              mainNode.id,
              "index:",
              indexValue
            );

            // Build the custom event with full information
            const nodeInfo = {
              sourceNodeId: `${originalParentId}-${d.nodeType}-${indexValue}`,
              targetNodeId: mainNode.id,
              nodeType: d.nodeType,
            };

            // Dispatch custom event that TopologyEditor can listen for
            const reassignEvent = new CustomEvent("nodeReassign", {
              bubbles: true,
              detail: nodeInfo,
            });
            svgRef.current?.dispatchEvent(reassignEvent);

            break; // Only reassign to the first matching node
          }
        }
      }

      // Release the node to be positioned by the simulation
      d.fx = null;
      d.fy = null;

      // Save the position for initial placement on rerender
      setNodePositions((prev) => ({
        ...prev,
        [d.id]: { x: d.x || 0, y: d.y || 0 },
      }));
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [topology, onNodeSelect]);

  return (
    <div ref={containerRef} className="graph-container">
      <svg ref={svgRef} width="100%" height="100%" />
      <div className="graph-hint">
        <div className="hint-icon">💡</div>
        <div className="hint-text">
          Drag physical sources and sinks to move them between nodes
        </div>
      </div>
    </div>
  );
};

export default GraphVisualization;
