import React, { useState } from 'react';
import { Node, Topology } from '../types';

interface TopologyControlsProps {
  topology: Topology;
  onTopologyChange: (topology: Topology) => void;
}

interface LinkDisplayItem {
  source: string;
  target: string;
  type: 'downstream' | 'upstream';
}

const TopologyControls: React.FC<TopologyControlsProps> = ({ topology, onTopologyChange }) => {
  const [showAddNode, setShowAddNode] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newNodeConnection, setNewNodeConnection] = useState('');
  const [newNodeGrpc, setNewNodeGrpc] = useState('');
  const [newNodeCapacity, setNewNodeCapacity] = useState(1);
  const [newLinkSource, setNewLinkSource] = useState('');
  const [newLinkTarget, setNewLinkTarget] = useState('');
  const [newLinkType, setNewLinkType] = useState<'downstream' | 'upstream'>('downstream');

  // Generate a list of all links for display
  const generateLinksList = (): LinkDisplayItem[] => {
    const links: LinkDisplayItem[] = [];
    
    topology.nodes.forEach(node => {
      // Add downstream links
      if (node.links?.downstreams) {
        node.links.downstreams.forEach(target => {
          links.push({
            source: node.connection,
            target,
            type: 'downstream'
          });
        });
      }
      
      // Add upstream links (if they don't already exist as downstreams in the other direction)
      if (node.links?.upstreams) {
        node.links.upstreams.forEach(source => {
          // Check if this link already exists as a downstream from the other direction
          const existsAsDownstream = topology.nodes.some(
            n => n.connection === source && 
                 n.links?.downstreams?.includes(node.connection)
          );
          
          if (!existsAsDownstream) {
            links.push({
              source,
              target: node.connection,
              type: 'upstream'
            });
          }
        });
      }
    });
    
    return links;
  };

  const handleAddNode = () => {
    if (!newNodeConnection.trim() || !newNodeGrpc.trim()) return;
    
    // Check if node already exists
    if (topology.nodes.some(node => node.connection === newNodeConnection)) {
      alert(`Node with connection '${newNodeConnection}' already exists.`);
      return;
    }

    const newNode: Node = {
      connection: newNodeConnection,
      grpc: newNodeGrpc,
      capacity: newNodeCapacity
    };

    const updatedTopology = {
      ...topology,
      nodes: [...topology.nodes, newNode]
    };

    onTopologyChange(updatedTopology);
    setNewNodeConnection('');
    setNewNodeGrpc('');
    setNewNodeCapacity(1);
    setShowAddNode(false);
  };

  const handleAddLink = () => {
    if (!newLinkSource || !newLinkTarget) return;
    
    // Check if source and target nodes exist
    const sourceExists = topology.nodes.some(node => node.connection === newLinkSource);
    const targetExists = topology.nodes.some(node => node.connection === newLinkTarget);
    
    if (!sourceExists) {
      alert(`Source node '${newLinkSource}' does not exist.`);
      return;
    }
    
    if (!targetExists) {
      alert(`Target node '${newLinkTarget}' does not exist.`);
      return;
    }
    
    // Create updated nodes array
    let updatedNodes = [...topology.nodes];
    
    if (newLinkType === 'downstream') {
      // Update the source node with a new downstream
      updatedNodes = updatedNodes.map(node => {
        if (node.connection === newLinkSource) {
          // Check if this downstream already exists
          if (node.links?.downstreams?.includes(newLinkTarget)) {
            alert(`Node ${newLinkSource} already has ${newLinkTarget} as a downstream.`);
            return node;
          }
          
          // Create or update links and downstreams
          const links = node.links || {};
          const downstreams = links.downstreams || [];
          
          return {
            ...node,
            links: {
              ...links,
              downstreams: [...downstreams, newLinkTarget]
            }
          };
        }
        return node;
      });
    } else if (newLinkType === 'upstream') {
      // Update the target node with a new upstream
      updatedNodes = updatedNodes.map(node => {
        if (node.connection === newLinkTarget) {
          // Check if this upstream already exists
          if (node.links?.upstreams?.includes(newLinkSource)) {
            alert(`Node ${newLinkTarget} already has ${newLinkSource} as an upstream.`);
            return node;
          }
          
          // Create or update links and upstreams
          const links = node.links || {};
          const upstreams = links.upstreams || [];
          
          return {
            ...node,
            links: {
              ...links,
              upstreams: [...upstreams, newLinkSource]
            }
          };
        }
        return node;
      });
    }

    onTopologyChange({
      ...topology,
      nodes: updatedNodes
    });
    
    setNewLinkSource('');
    setNewLinkTarget('');
    setShowAddLink(false);
  };

  const handleDeleteNode = (connection: string) => {
    if (!window.confirm(`Are you sure you want to delete node '${connection}'?`)) {
      return;
    }

    // Remove the node
    const updatedNodes = topology.nodes.filter(node => node.connection !== connection);
    
    // Update downstream references in other nodes
    const cleanedNodes = updatedNodes.map(node => {
      const updatedNode = { ...node };
      
      // Remove from downstreams
      if (node.links?.downstreams?.includes(connection)) {
        updatedNode.links = {
          ...node.links,
          downstreams: node.links.downstreams.filter(ds => ds !== connection)
        };
      }
      
      // Remove from upstreams
      if (node.links?.upstreams?.includes(connection)) {
        updatedNode.links = {
          ...node.links,
          upstreams: node.links.upstreams.filter(us => us !== connection)
        };
      }
      
      return updatedNode;
    });

    onTopologyChange({
      ...topology,
      nodes: cleanedNodes
    });
  };

  const handleDeleteLink = (source: string, target: string, type: 'downstream' | 'upstream') => {
    if (!window.confirm(`Are you sure you want to delete this link?`)) {
      return;
    }

    // Update nodes based on link type
    const updatedNodes = topology.nodes.map(node => {
      if (type === 'downstream' && node.connection === source) {
        // Remove from source node's downstreams
        if (node.links?.downstreams) {
          return {
            ...node,
            links: {
              ...node.links,
              downstreams: node.links.downstreams.filter(ds => ds !== target)
            }
          };
        }
      } 
      else if (type === 'upstream' && node.connection === target) {
        // Remove from target node's upstreams
        if (node.links?.upstreams) {
          return {
            ...node,
            links: {
              ...node.links,
              upstreams: node.links.upstreams.filter(us => us !== source)
            }
          };
        }
      }
      return node;
    });

    onTopologyChange({
      ...topology,
      nodes: updatedNodes
    });
  };

  // Get all links for display
  const linksList = generateLinksList();

  return (
    <div className="topology-controls">
      <div className="controls">
        <button onClick={() => setShowAddNode(true)}>Add Node</button>
        <button onClick={() => setShowAddLink(true)}>Add Link</button>
      </div>

      {showAddNode && (
        <div className="modal">
          <div className="modal-content">
            <h3>Add New Node</h3>
            <div className="property-field">
              <label>Connection:</label>
              <input
                type="text"
                value={newNodeConnection}
                onChange={(e) => setNewNodeConnection(e.target.value)}
                placeholder="e.g. 127.0.0.1:9090"
              />
            </div>
            <div className="property-field">
              <label>GRPC:</label>
              <input
                type="text"
                value={newNodeGrpc}
                onChange={(e) => setNewNodeGrpc(e.target.value)}
                placeholder="e.g. 127.0.0.1:8080"
              />
            </div>
            <div className="property-field">
              <label>Capacity:</label>
              <input
                type="number"
                value={newNodeCapacity}
                onChange={(e) => setNewNodeCapacity(Number(e.target.value))}
                min="1"
              />
            </div>
            <div className="controls">
              <button onClick={handleAddNode}>Add</button>
              <button onClick={() => setShowAddNode(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showAddLink && (
        <div className="modal">
          <div className="modal-content">
            <h3>Add New Link</h3>
            <div className="property-field">
              <label>Link Type:</label>
              <select
                value={newLinkType}
                onChange={(e) => setNewLinkType(e.target.value as 'downstream' | 'upstream')}
              >
                <option value="downstream">Downstream</option>
                <option value="upstream">Upstream</option>
              </select>
            </div>
            <div className="property-field">
              <label>Source Node:</label>
              <select
                value={newLinkSource}
                onChange={(e) => setNewLinkSource(e.target.value)}
              >
                <option value="">Select source node</option>
                {topology.nodes.map(node => (
                  <option key={node.connection} value={node.connection}>
                    {node.connection}
                  </option>
                ))}
              </select>
            </div>
            <div className="property-field">
              <label>Target Node:</label>
              <select
                value={newLinkTarget}
                onChange={(e) => setNewLinkTarget(e.target.value)}
              >
                <option value="">Select target node</option>
                {topology.nodes.map(node => (
                  <option key={node.connection} value={node.connection}>
                    {node.connection}
                  </option>
                ))}
              </select>
            </div>
            <div className="controls">
              <button onClick={handleAddLink}>Add</button>
              <button onClick={() => setShowAddLink(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="topology-lists">
        <div className="nodes-list">
          <h4>Nodes</h4>
          <ul>
            {topology.nodes.map(node => (
              <li key={node.connection}>
                {node.connection} (Capacity: {node.capacity})
                <button onClick={() => handleDeleteNode(node.connection)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="links-list">
          <h4>Links</h4>
          <ul>
            {linksList.map((link, index) => (
              <li key={index} className={link.type}>
                {link.source} → {link.target}
                <button onClick={() => handleDeleteLink(link.source, link.target, link.type)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TopologyControls;