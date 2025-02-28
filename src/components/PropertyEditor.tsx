import React, { useState } from 'react';
import { Node, PhysicalSource, Sink, NodeSelection, LogicalSchema } from '../types';

interface PropertyEditorProps {
  selectedNode: Node | null;
  selectedNodeId: NodeSelection;
  topology: { nodes: Node[], logical?: LogicalSchema[] };
  onPropertyChange: (property: string, value: any) => void;
  onAddSource: (nodeId: string, source: PhysicalSource) => void;
  onAddSink: (nodeId: string, sink: Sink) => void;
  onRemoveSource: (nodeId: string, sourceIndex: number) => void;
  onRemoveSink: (nodeId: string, sinkIndex: number) => void;
}

const PropertyEditor: React.FC<PropertyEditorProps> = ({ 
  selectedNode, 
  selectedNodeId,
  topology,
  onPropertyChange, 
  onAddSource, 
  onAddSink,
  onRemoveSource,
  onRemoveSink
}) => {
  const [newSourceName, setNewSourceName] = useState('');
  const [newSinkName, setNewSinkName] = useState('');
  
  // Get logical schema options for dropdown
  const logicalSchemaOptions = topology.logical?.map(schema => schema.name) || [];

  if (!selectedNode && !selectedNodeId) {
    return <div className="property-editor">No node selected</div>;
  }
  
  // For main nodes - if we have an ID but no node object, something is wrong
  if (selectedNodeId && selectedNodeId.type === 'main' && !selectedNode) {
    return <div className="property-editor">Node data not found</div>;
  }

  // Handle physical source node selection
  if (selectedNodeId && selectedNodeId.type === 'physical') {
    const { parentId, name } = selectedNodeId;
    const mainNode = topology.nodes.find(n => n.connection === parentId);
    
    if (!mainNode || !mainNode.physical) {
      return <div className="property-editor">Source not found</div>;
    }
    
    // Find the physical source by name
    const sourceIndex = mainNode.physical.findIndex(source => source.logical === name);
    if (sourceIndex === -1) {
      return <div className="property-editor">Source not found</div>;
    }
    
    const physicalSource = mainNode.physical[sourceIndex];
    
    return (
      <div className="property-editor">
        <div className="property-header">
          <h3>Physical Source: {physicalSource.logical}</h3>
          <button 
            className="back-button"
            onClick={() => {
              // Return to the parent node's properties
              onPropertyChange('_selectNode', {
                type: 'main',
                nodeId: parentId
              });
            }}
          >
            ← Back to Node
          </button>
        </div>
        <div className="properties">
          <div className="property-section">
            <h4>Basic Properties:</h4>
            <div className="property-field">
              <label>Logical Schema:</label>
              <select
                value={physicalSource.logical}
                onChange={(e) => {
                  // Send only the logical field update
                  onPropertyChange('logical', e.target.value);
                }}
              >
                {logicalSchemaOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
                {!logicalSchemaOptions.includes(physicalSource.logical) && (
                  <option value={physicalSource.logical}>{physicalSource.logical}</option>
                )}
              </select>
            </div>
            <div className="property-field">
              <label>Parser Type:</label>
              <input
                type="text"
                value={physicalSource.parserConfig.type}
                onChange={(e) => {
                  // Use the new specific property handler
                  onPropertyChange('parserType', e.target.value);
                }}
              />
            </div>
            <div className="property-field">
              <label>Source Type:</label>
              <input
                type="text"
                value={physicalSource.sourceConfig.type}
                onChange={(e) => {
                  // Use the new specific property handler
                  onPropertyChange('sourceType', e.target.value);
                }}
              />
            </div>
            <button 
              className="remove-button"
              onClick={() => onRemoveSource(parentId, sourceIndex)}
            >
              Remove Source
            </button>
          </div>
          <div className="property-section">
            <h4>Advanced Configuration:</h4>
            <div className="complex-property">
              Edit advanced configuration in the YAML editor
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Handle sink node selection
  if (selectedNodeId && selectedNodeId.type === 'sink') {
    const { parentId, name } = selectedNodeId;
    
    const mainNode = topology.nodes.find(n => n.connection === parentId);
    console.log("Selection:", selectedNodeId);
    console.log("Main node:", mainNode);
    console.log("Sinks array:", mainNode?.sinks);
    console.log("Looking for sink with name:", name);
    
    if (!mainNode || !mainNode.sinks) {
      return <div className="property-editor">Sink not found - no sinks array</div>;
    }
    
    // Find the sink by name
    const sinkIndex = mainNode.sinks.findIndex(sink => sink.name === name);
    console.log("Found sink index:", sinkIndex);
    
    if (sinkIndex === -1) {
      return <div className="property-editor">
        Sink with name "{name}" not found
      </div>;
    }
    
    const sink = mainNode.sinks[sinkIndex];
    
    return (
      <div className="property-editor">
        <div className="property-header">
          <h3>Sink: {sink.name}</h3>
          <button 
            className="back-button"
            onClick={() => {
              // Return to the parent node's properties
              onPropertyChange('_selectNode', {
                type: 'main',
                nodeId: parentId
              });
            }}
          >
            ← Back to Node
          </button>
        </div>
        <div className="properties">
          <div className="property-section">
            <h4>Basic Properties:</h4>
            <div className="property-field">
              <label>Name:</label>
              <input
                type="text"
                value={sink.name}
                onChange={(e) => {
                  const updatedSink = {...sink, name: e.target.value};
                  onPropertyChange(`sinks[${sinkIndex}]`, updatedSink);
                }}
              />
            </div>
            <div className="property-field">
              <label>Type:</label>
              <input
                type="text"
                value={sink.type}
                onChange={(e) => {
                  const updatedSink = {...sink, type: e.target.value};
                  onPropertyChange(`sinks[${sinkIndex}]`, updatedSink);
                }}
              />
            </div>
            <button 
              className="remove-button"
              onClick={() => onRemoveSink(parentId, sinkIndex)}
            >
              Remove Sink
            </button>
          </div>
          {sink.config && (
            <div className="property-section">
              <h4>Sink Configuration:</h4>
              <div className="complex-property">
                Edit configuration in the YAML editor
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Handle main node selection
  const renderPropertyInput = (
    property: string,
    value: string | number | boolean | object | Array<any>
  ) => {
    // Skip complex objects
    if (typeof value === 'object' && !Array.isArray(value)) {
      return <div className="complex-property">Complex object (edit in YAML)</div>;
    }

    if (Array.isArray(value)) {
      return <div className="complex-property">Array (edit in YAML)</div>;
    }

    if (typeof value === 'boolean') {
      return (
        <select
          value={value.toString()}
          onChange={(e) => onPropertyChange(property, e.target.value === 'true')}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }

    if (typeof value === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => onPropertyChange(property, Number(e.target.value))}
        />
      );
    }

    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onPropertyChange(property, e.target.value)}
      />
    );
  };

  // Handler for adding a new physical source
  const handleAddSource = () => {
    if (!newSourceName) return;

    const newSource: PhysicalSource = {
      logical: newSourceName,
      parserConfig: {
        type: 'json'
      },
      sourceConfig: {
        type: 'file'
      }
    };

    onAddSource(selectedNode!.connection, newSource);
    setNewSourceName('');
  };

  // Handler for adding a new sink
  const handleAddSink = () => {
    if (!newSinkName) return;

    const newSink: Sink = {
      name: newSinkName,
      type: 'stdout'  // Default type
    };

    onAddSink(selectedNode!.connection, newSink);
    setNewSinkName('');
  };

  return (
    <div className="property-editor">
      <h3>Node: {selectedNode!.connection}</h3>
      <div className="properties">
        <div className="property-section">
          <h4>Basic Properties:</h4>
          <div className="property-field">
            <label>Connection:</label>
            {renderPropertyInput('connection', selectedNode!.connection)}
          </div>
          <div className="property-field">
            <label>GRPC:</label>
            {renderPropertyInput('grpc', selectedNode!.grpc)}
          </div>
          <div className="property-field">
            <label>Capacity:</label>
            {renderPropertyInput('capacity', selectedNode!.capacity)}
          </div>
        </div>

        <div className="property-section">
          <h4>Physical Sources:</h4>
          <div className="item-list">
            {selectedNode!.physical?.map((source, index) => (
              <div 
                key={`source-${index}`} 
                className="list-item clickable"
                onClick={() => {
                  // Switch to this specific physical source when clicked
                  onPropertyChange('_selectSource', {
                    type: 'physical',
                    nodeId: `${selectedNode!.connection}-physical-${index}`,
                    parentId: selectedNode!.connection,
                    name: source.logical
                  });
                }}
              >
                <div className="item-name">{source.logical}</div>
                <div className="item-type">{source.sourceConfig.type}</div>
                <button 
                  className="remove-button" 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent row click
                    onRemoveSource(selectedNode!.connection, index);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {(!selectedNode!.physical || selectedNode!.physical.length === 0) && (
              <div className="empty-list">No physical sources</div>
            )}
          </div>
          <div className="add-item">
            {logicalSchemaOptions.length > 0 ? (
              <>
                <select
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                >
                  <option value="">Select logical schema</option>
                  {logicalSchemaOptions.map(schema => (
                    <option key={schema} value={schema}>{schema}</option>
                  ))}
                </select>
                <button 
                  onClick={handleAddSource}
                  disabled={!newSourceName}
                >
                  Add Source
                </button>
              </>
            ) : (
              <div className="warning-message">
                Add logical schemas in the Logical tab first
              </div>
            )}
          </div>
        </div>

        <div className="property-section">
          <h4>Sinks:</h4>
          <div className="item-list">
            {selectedNode!.sinks?.map((sink, index) => (
              <div 
                key={`sink-${index}`} 
                className="list-item clickable"
                onClick={() => {
                  // Switch to this specific sink when clicked
                  onPropertyChange('_selectSink', {
                    type: 'sink',
                    nodeId: `${selectedNode!.connection}-sink-${index}`,
                    parentId: selectedNode!.connection,
                    name: sink.name
                  });
                }}
              >
                <div className="item-name">{sink.name}</div>
                <div className="item-type">{sink.type}</div>
                <button 
                  className="remove-button" 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent row click
                    onRemoveSink(selectedNode!.connection, index);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {(!selectedNode!.sinks || selectedNode!.sinks.length === 0) && (
              <div className="empty-list">No sinks</div>
            )}
          </div>
          <div className="add-item">
            <input
              type="text"
              placeholder="New sink name"
              value={newSinkName}
              onChange={(e) => setNewSinkName(e.target.value)}
            />
            <button 
              onClick={handleAddSink}
              disabled={!newSinkName}
            >
              Add Sink
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PropertyEditor;