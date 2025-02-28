import React, { useState, useEffect, useRef, useCallback } from 'react';
import { load, dump } from 'js-yaml';
import GraphVisualization from './components/GraphVisualization';
import TopologyEditor from './components/TopologyEditor';
import PropertyEditor from './components/PropertyEditor';
import TopologyControls from './components/TopologyControls';
import LogicalEditor from './components/LogicalEditor';
import { Topology, Node, PhysicalSource, Sink, NodeSelection, LogicalSchema } from './types';

// Default empty topology
const defaultTopology: Topology = {
  nodes: []
};

const App: React.FC = () => {
  const [topology, setTopology] = useState<Topology>(defaultTopology);
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<NodeSelection>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showTopologyEditor, setShowTopologyEditor] = useState<boolean>(false); // Default to hiding the YAML editor
  const [activeTab, setActiveTab] = useState<'editor' | 'controls' | 'logical'>('controls');

  // Load topology from file
  useEffect(() => {
    const loadTopology = async () => {
      try {
        // Fetch from file with relative path for GitHub Pages
        const response = await fetch('./topology.yaml');
        const yamlText = await response.text();
        const parsedYaml = load(yamlText) as Topology;
        
        if (parsedYaml.nodes) {
          setTopology({
            logical: parsedYaml.logical,
            nodes: parsedYaml.nodes
          });
        }
      } catch (error) {
        console.error('Failed to load topology:', error);
      }
    };

    loadTopology();
  }, []);

  // Handle node selection with proper typing
  const handleNodeSelect = (selection: NodeSelection) => {
    setSelectedNodeInfo(selection);
    
    // Update the selectedNode based on selection type
    if (selection === null) {
      setSelectedNode(null);
    } else if (selection.type === 'main') {
      const node = topology.nodes.find(n => n.connection === selection.nodeId);
      setSelectedNode(node || null);
      // Switch to properties tab when a node is selected
      setActiveTab('editor');
    } else {
      // For physical and sink nodes, we don't set a selectedNode
      setSelectedNode(null);
      // Switch to properties tab when a node is selected
      setActiveTab('editor');
    }
  };

  const handlePropertyChange = (property: string, value: any) => {
    // Handle special selection properties
    if (property === '_selectSource') {
      setSelectedNodeInfo(value);
      return;
    }
    if (property === '_selectSink') {
      setSelectedNodeInfo(value);
      return;
    }
    if (property === '_selectNode') {
      setSelectedNodeInfo(value);
      if (value.type === 'main') {
        const node = topology.nodes.find(n => n.connection === value.nodeId);
        setSelectedNode(node || null);
      }
      return;
    }

    // Handle for main nodes
    if (selectedNode) {
      const updatedNodes = topology.nodes.map(node => {
        if (node.connection === selectedNode.connection) {
          // Handle different property types
          if (property === 'capacity') {
            return { ...node, capacity: Number(value) };
          } else if (property === 'grpc') {
            return { ...node, grpc: value };
          } else if (property === 'connection') {
            return { ...node, connection: value };
          } else if (property === 'physical') {
            return { ...node, physical: value };
          } else if (property === 'sinks') {
            return { ...node, sinks: value };
          } else if (property.startsWith('physical[')) {
            // Update a specific physical source
            const matches = property.match(/physical\[(\d+)\]/);
            if (matches && matches[1]) {
              const index = parseInt(matches[1]);
              const physical = [...(node.physical || [])];
              physical[index] = value;
              return { ...node, physical };
            }
          } else if (property.startsWith('sinks[')) {
            // Update a specific sink
            const matches = property.match(/sinks\[(\d+)\]/);
            if (matches && matches[1]) {
              const index = parseInt(matches[1]);
              const sinks = [...(node.sinks || [])];
              sinks[index] = value;
              return { ...node, sinks };
            }
          }
        }
        return node;
      });

      setTopology({
        ...topology,
        nodes: updatedNodes
      });
      
      // Update selected node to reflect changes
      const updatedNode = updatedNodes.find(n => n.connection === selectedNode.connection);
      if (updatedNode) {
        setSelectedNode(updatedNode);
      }
      
      return;
    }

    // Handle for physical/sink nodes
    if (selectedNodeInfo && selectedNodeInfo.type === 'physical') {
      const { parentId, physicalSourceIndex } = selectedNodeInfo;
      const index = physicalSourceIndex; // For backward compatibility with existing code
      
      console.log('Updating physical source:', parentId, index, value);
      
      const updatedNodes = topology.nodes.map(node => {
        if (node.connection === parentId && node.physical && typeof index === 'number') {
          const updatedPhysical = [...node.physical];
          let updatedSource;
          if (property === `physical[${index}]`) {
            updatedPhysical[index] = value;
          } else if (property === 'logical') {
            // Handle direct logical property update
            updatedSource = { ...updatedPhysical[index], logical: value };
            updatedPhysical[index] = updatedSource;
            
            // Update selectedNodeInfo to reflect the name change
            setSelectedNodeInfo({
              ...selectedNodeInfo,
              name: value,
              physicalSourceIndex: index
            });
          } else if (property === 'parserType') {
            // Handle parserConfig.type update
            updatedSource = { 
              ...updatedPhysical[index], 
              parserConfig: { 
                ...updatedPhysical[index].parserConfig, 
                type: value 
              } 
            };
            updatedPhysical[index] = updatedSource;
          } else if (property === 'sourceType') {
            // Handle sourceConfig.type update
            updatedSource = { 
              ...updatedPhysical[index], 
              sourceConfig: { 
                ...updatedPhysical[index].sourceConfig, 
                type: value 
              } 
            };
            updatedPhysical[index] = updatedSource;
          }
          return { ...node, physical: updatedPhysical };
        }
        return node;
      });

      console.log(updatedNodes)
      setTopology({
        ...topology,
        nodes: updatedNodes
      });
    } else if (selectedNodeInfo && selectedNodeInfo.type === 'sink') {
      const { parentId, sinkIndex } = selectedNodeInfo;
      const index = sinkIndex; // For backward compatibility with existing code
      
      console.log(`Updating sink with parentId=${parentId}, index=${index}`);
      
      const parentNode = topology.nodes.find(n => n.connection === parentId);
      console.log("Parent node sinks:", parentNode?.sinks);
      
      const updatedNodes = topology.nodes.map(node => {
        if (node.connection === parentId && node.sinks && typeof index === 'number') {
          console.log(`Found parent node, updating sink at index ${index}`);
          const updatedSinks = [...node.sinks];
          if (property === `sinks[${index}]`) {
            if (index >= 0 && index < updatedSinks.length) {
              updatedSinks[index] = value;
            } else {
              console.error(`Index ${index} out of bounds for sinks array with length ${updatedSinks.length}`);
            }
          }
          return { ...node, sinks: updatedSinks };
        }
        return node;
      });

      setTopology({
        ...topology,
        nodes: updatedNodes
      });
    }
  };

  // Add a new source to a node
  const handleAddSource = (nodeId: string, source: PhysicalSource) => {
    // Create updated nodes array
    const updatedNodes = topology.nodes.map(node => {
      if (node.connection === nodeId) {
        const physical = node.physical ? [...node.physical, source] : [source];
        return { ...node, physical };
      }
      return node;
    });

    // Update topology
    setTopology({
      ...topology,
      nodes: updatedNodes
    });
    
    // If we're adding to the currently selected node, refresh the selected node
    if (selectedNode && selectedNode.connection === nodeId) {
      const updatedNode = updatedNodes.find(n => n.connection === nodeId);
      if (updatedNode) {
        setSelectedNode(updatedNode);
      }
      
      // Select the newly added source
      if (updatedNode && updatedNode.physical) {
        const newIndex = updatedNode.physical.length - 1;
        const newSource = updatedNode.physical[newIndex];
        setSelectedNodeInfo({
          type: 'physical',
          nodeId: `${nodeId}-physical-${newIndex}`,
          parentId: nodeId,
          name: newSource.logical,
          physicalSourceIndex: newIndex
        });
      }
    }
  };

  // Add a new sink to a node
  const handleAddSink = (nodeId: string, sink: Sink) => {
    const updatedNodes = topology.nodes.map(node => {
      if (node.connection === nodeId) {
        const sinks = node.sinks ? [...node.sinks, sink] : [sink];
        return { ...node, sinks };
      }
      return node;
    });

    setTopology({
      ...topology,
      nodes: updatedNodes
    });
    
    // If we're adding to the currently selected node, refresh the selected node
    if (selectedNode && selectedNode.connection === nodeId) {
      const updatedNode = updatedNodes.find(n => n.connection === nodeId);
      if (updatedNode) {
        setSelectedNode(updatedNode);
      }
      
      // Select the newly added sink
      if (updatedNode && updatedNode.sinks) {
        const newIndex = updatedNode.sinks.length - 1;
        const newSink = updatedNode.sinks[newIndex];
        setSelectedNodeInfo({
          type: 'sink',
          nodeId: `${nodeId}-sink-${newIndex}`,
          parentId: nodeId,
          name: newSink.name,
          sinkIndex: newIndex
        });
      }
    }
  };

  // Remove a source from a node
  const handleRemoveSource = (nodeId: string, sourceIndex: number) => {
    const updatedNodes = topology.nodes.map(node => {
      if (node.connection === nodeId && node.physical) {
        const physical = node.physical.filter((_, index) => index !== sourceIndex);
        return { ...node, physical: physical.length ? physical : undefined };
      }
      return node;
    });

    setTopology({
      ...topology,
      nodes: updatedNodes
    });
    
    // If we're removing the selected source, clear selection
    if (selectedNodeInfo?.type === 'physical') {
      const { parentId, physicalSourceIndex } = selectedNodeInfo;
      if (parentId === nodeId && typeof physicalSourceIndex === 'number' && physicalSourceIndex === sourceIndex) {
        setSelectedNodeInfo(null);
      }
    }
  };

  // Remove a sink from a node
  const handleRemoveSink = (nodeId: string, indexToRemove: number) => {
    const updatedNodes = topology.nodes.map(node => {
      if (node.connection === nodeId && node.sinks) {
        const sinks = node.sinks.filter((_, index) => index !== indexToRemove);
        return { ...node, sinks: sinks.length ? sinks : undefined };
      }
      return node;
    });

    setTopology({
      ...topology,
      nodes: updatedNodes
    });
    
    // If we're removing the selected sink, clear selection
    if (selectedNodeInfo?.type === 'sink') {
      const { parentId, sinkIndex } = selectedNodeInfo;
      if (parentId === nodeId && typeof sinkIndex === 'number' && sinkIndex === indexToRemove) {
        setSelectedNodeInfo(null);
      }
    }
  };

  // Handle node reassignment (when dragging physical/sink nodes to other main nodes)
  const handleNodeReassign = (event: CustomEvent) => {
    const { sourceNodeId, targetNodeId, nodeType } = event.detail;
    
    if (!sourceNodeId || !targetNodeId) return;
    
    // Extract info from source node ID
    const [sourceMainNodeId, nodeCategory, index] = sourceNodeId.split('-');
    const sourceIndex = parseInt(index);
    
    // Clone the topology
    const updatedNodes = [...topology.nodes];
    
    // Find source and target nodes
    const sourceMainNode = updatedNodes.find(n => n.connection === sourceMainNodeId);
    const targetMainNode = updatedNodes.find(n => n.connection === targetNodeId);
    
    if (!sourceMainNode || !targetMainNode) return;
    
    if (nodeType === 'physical' && sourceMainNode.physical && sourceIndex >= 0) {
      // Get the physical source to move
      const sourceToMove = sourceMainNode.physical[sourceIndex];
      
      // Remove from source node
      sourceMainNode.physical = sourceMainNode.physical.filter((_, i) => i !== sourceIndex);
      if (sourceMainNode.physical.length === 0) {
        delete sourceMainNode.physical;
      }
      
      // Add to target node
      if (!targetMainNode.physical) {
        targetMainNode.physical = [];
      }
      targetMainNode.physical.push(sourceToMove);
      
      // Update selection to new node
      setSelectedNodeInfo(null);
      
    } else if (nodeType === 'sink' && sourceMainNode.sinks && sourceIndex >= 0) {
      // Get the sink to move
      const sinkToMove = sourceMainNode.sinks[sourceIndex];
      
      // Remove from source node
      sourceMainNode.sinks = sourceMainNode.sinks.filter((_, i) => i !== sourceIndex);
      if (sourceMainNode.sinks.length === 0) {
        delete sourceMainNode.sinks;
      }
      
      // Add to target node
      if (!targetMainNode.sinks) {
        targetMainNode.sinks = [];
      }
      targetMainNode.sinks.push(sinkToMove);
      
      // Update selection to new node
      setSelectedNodeInfo(null);
    }
    
    setTopology({
      ...topology,
      nodes: updatedNodes
    });
  };

  // Set up event listener for node reassignment
  const graphRef = useRef<HTMLDivElement>(null);
  
  // Use a ref to hold the latest topology to avoid stale closures in event handlers
  const topologyRef = useRef(topology);
  useEffect(() => {
    topologyRef.current = topology;
  }, [topology]);
  
  // Create a stable event handler that uses the latest topology from the ref
  const stableNodeReassignHandler = useCallback((event: CustomEvent) => {
    const { sourceNodeId, targetNodeId, nodeType } = event.detail;
    
    if (!sourceNodeId || !targetNodeId) return;
    
    console.log('Node reassign event:', sourceNodeId, 'to', targetNodeId, 'type:', nodeType);
    
    // Extract info from source node ID
    const [sourceMainNodeId, nodeCategory, index] = sourceNodeId.split('-');
    const sourceIndex = parseInt(index);
    
    // Get the latest topology from ref
    const currentTopology = topologyRef.current;
    
    // Clone the nodes for immutability
    const updatedNodes = [...currentTopology.nodes];
    
    // Find source and target nodes
    const sourceMainNode = updatedNodes.find(n => n.connection === sourceMainNodeId);
    const targetMainNode = updatedNodes.find(n => n.connection === targetNodeId);
    
    if (!sourceMainNode || !targetMainNode) {
      console.log('Source or target node not found');
      return;
    }
    
    console.log('Source node:', sourceMainNode);
    console.log('Target node:', targetMainNode);
    
    if (nodeType === 'physical' && sourceMainNode.physical && sourceIndex >= 0) {
      console.log('Moving physical source at index', sourceIndex);
      
      // Get the physical source to move
      const sourceToMove = sourceMainNode.physical[sourceIndex];
      console.log('Source to move:', sourceToMove);
      
      // Remove from source node
      sourceMainNode.physical = sourceMainNode.physical.filter((_, i) => i !== sourceIndex);
      if (sourceMainNode.physical.length === 0) {
        delete sourceMainNode.physical;
      }
      
      // Add to target node
      if (!targetMainNode.physical) {
        targetMainNode.physical = [];
      }
      targetMainNode.physical.push(sourceToMove);
      
      // Update selection to new node
      setSelectedNodeInfo(null);
      
    } else if (nodeType === 'sink' && sourceMainNode.sinks && sourceIndex >= 0) {
      console.log('Moving sink at index', sourceIndex);
      
      // Get the sink to move
      const sinkToMove = sourceMainNode.sinks[sourceIndex];
      console.log('Sink to move:', sinkToMove);
      
      // Remove from source node
      sourceMainNode.sinks = sourceMainNode.sinks.filter((_, i) => i !== sourceIndex);
      if (sourceMainNode.sinks.length === 0) {
        delete sourceMainNode.sinks;
      }
      
      // Add to target node
      if (!targetMainNode.sinks) {
        targetMainNode.sinks = [];
      }
      targetMainNode.sinks.push(sinkToMove);
      
      // Update selection to new node
      setSelectedNodeInfo(null);
    }
    
    console.log('Updated nodes:', updatedNodes);
    
    // Update the topology with the modified nodes
    setTopology({
      ...currentTopology,
      nodes: updatedNodes
    });
  }, [setSelectedNodeInfo, setTopology]);
  
  useEffect(() => {
    console.log('Setting up nodeReassign event listener');
    const graphElement = graphRef.current;
    if (graphElement) {
      console.log('GraphRef element found:', graphElement);
      graphElement.addEventListener('nodeReassign', stableNodeReassignHandler as EventListener);
    } else {
      console.log('GraphRef element not found');
    }
    
    return () => {
      if (graphElement) {
        graphElement.removeEventListener('nodeReassign', stableNodeReassignHandler as EventListener);
      }
    };
  }, [stableNodeReassignHandler]);
  
  // Handle logical schema operations
  const handleAddLogicalSchema = (schema: LogicalSchema) => {
    const updatedLogical = topology.logical ? [...topology.logical, schema] : [schema];
    
    setTopology({
      ...topology,
      logical: updatedLogical
    });
  };

  const handleUpdateLogicalSchema = (index: number, schema: LogicalSchema) => {
    if (!topology.logical) return;
    
    const updatedLogical = [...topology.logical];
    updatedLogical[index] = schema;
    
    setTopology({
      ...topology,
      logical: updatedLogical
    });
  };

  const handleRemoveLogicalSchema = (index: number) => {
    if (!topology.logical) return;
    
    const updatedLogical = [...topology.logical];
    updatedLogical.splice(index, 1);
    
    setTopology({
      ...topology,
      logical: updatedLogical.length ? updatedLogical : undefined
    });
  };

  return (
    <div className="app">
      <header>
        <h1>Graph Topology Editor</h1>
        <div className="controls">
          <button onClick={() => setShowTopologyEditor(prev => !prev)}>
            {showTopologyEditor ? 'Hide YAML Editor' : 'Show YAML Editor'}
          </button>
        </div>
      </header>

      <main>
        <div ref={graphRef} className="graph-wrapper">
          <GraphVisualization 
            topology={topology} 
            onNodeSelect={handleNodeSelect} 
          />
        </div>

        {showTopologyEditor && (
          <div className="yaml-editor-container">
            <TopologyEditor 
              topology={topology} 
              setTopology={setTopology} 
            />
          </div>
        )}

        <div className="sidebar">
          <div className="tab-controls">
            <button 
              className={activeTab === 'controls' ? 'active' : ''}
              onClick={() => setActiveTab('controls')}
            >
              Controls
            </button>
            <button 
              className={activeTab === 'editor' ? 'active' : ''}
              onClick={() => setActiveTab('editor')}
            >
              Properties
            </button>
            <button 
              className={activeTab === 'logical' ? 'active' : ''}
              onClick={() => setActiveTab('logical')}
            >
              Logical
            </button>
          </div>

          {activeTab === 'controls' ? (
            <TopologyControls 
              topology={topology} 
              onTopologyChange={setTopology} 
            />
          ) : activeTab === 'editor' ? (
            <PropertyEditor 
              selectedNode={selectedNode}
              selectedNodeId={selectedNodeInfo}
              topology={topology}
              onPropertyChange={handlePropertyChange}
              onAddSource={handleAddSource}
              onAddSink={handleAddSink}
              onRemoveSource={handleRemoveSource}
              onRemoveSink={handleRemoveSink}
            />
          ) : (
            <LogicalEditor
              schemas={topology.logical || []}
              onAddSchema={handleAddLogicalSchema}
              onUpdateSchema={handleUpdateLogicalSchema}
              onRemoveSchema={handleRemoveLogicalSchema}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;