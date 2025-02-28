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

    // Function to generate colors for logical schemas
    const getLogicalSchemaColor = (schemaName: string) => {
      // Define a hash function to convert schema name to a deterministic color
      const hash = (str: string) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0; // Convert to 32bit integer
        }
        return hash;
      };

      // Use hash to generate HSL color with good saturation and lightness
      const h = Math.abs(hash(schemaName)) % 360;
      return d3.hsl(h, 0.7, 0.5).toString();
    };

    // Create a color map for all logical schemas for consistency
    const schemaColorMap = new Map<string, string>();
    if (topology.logical) {
      topology.logical.forEach((schema) => {
        schemaColorMap.set(schema.name, getLogicalSchemaColor(schema.name));
      });
    }

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

    // Add circles to nodes with different sizes and colors based on type and capacity
    node
      .append("circle")
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
          if (parentNode && parentNode.physical && d.index !== undefined) {
            const source = parentNode.physical[d.index];
            if (source && source.logical) {
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
      .attr("stroke", "#fff")
      .attr("stroke-width", (d) => (d.nodeType === "main" ? 2 : 1))
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
          index: d.parentIndex,
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
          index: d.parentIndex,
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
    }

    function dragged(
      event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>,
      d: SimulationNode
    ) {
      // Update fixed position during drag
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(
      event: d3.D3DragEvent<SVGGElement, SimulationNode, SimulationNode>,
      d: SimulationNode
    ) {
      if (!event.active) simulation.alphaTarget(0);

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
          if (distance < 40) {
            // Using main node radius + some margin
            // Get node info for reassignment
            const nodeInfo = {
              sourceNodeId: d.id,
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
    </div>
  );
};

export default GraphVisualization;
