import React, { useState, useEffect, useCallback } from 'react';
import { load, dump } from 'js-yaml';
import { Topology } from '../types';

interface TopologyEditorProps {
  topology: Topology;
  setTopology: (topology: Topology) => void;
}

const TopologyEditor: React.FC<TopologyEditorProps> = ({ topology, setTopology }) => {
  // Initialize from provided topology
  const [yamlText, setYamlText] = useState<string>(dump(topology));
  const [error, setError] = useState<string>('');
  const [isValid, setIsValid] = useState<boolean>(true);
  const [typingTimer, setTypingTimer] = useState<NodeJS.Timeout | null>(null);

  // Function to validate and parse YAML
  const validateAndParseYaml = useCallback((text: string) => {
    try {
      const parsedYaml = load(text) as any;
      
      if (!parsedYaml.nodes) {
        throw new Error('Invalid topology format. Must include nodes.');
      }
      
      // Create the topology 
      const updatedTopology: Topology = {
        logical: parsedYaml.logical,
        nodes: parsedYaml.nodes
      };
      
      setTopology(updatedTopology);
      setError('');
      setIsValid(true);
      return true;
    } catch (err) {
      setError(`Error parsing YAML: ${err instanceof Error ? err.message : String(err)}`);
      setIsValid(false);
      return false;
    }
  }, [setTopology]);

  // Update YAML when topology changes (e.g., from other components)
  useEffect(() => {
    const newYamlText = dump(topology);
    if (newYamlText !== yamlText) {
      setYamlText(newYamlText);
      setIsValid(true);
      setError('');
    }
  }, [topology, yamlText]);

  // Handle manual import button click
  const handleImport = () => {
    validateAndParseYaml(yamlText);
  };

  // Handle export function
  const handleExport = () => {
    try {
      const yamlString = dump(topology);
      setYamlText(yamlString);
      setError('');
      setIsValid(true);
      
      // Create download link
      const blob = new Blob([yamlString], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'topology.yaml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Error exporting YAML: ${err instanceof Error ? err.message : String(err)}`);
      setIsValid(false);
    }
  };

  // Handle text changes with debouncing
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setYamlText(newText);
    
    // Clear previous timer
    if (typingTimer) {
      clearTimeout(typingTimer);
    }
    
    // Set a new timer to validate after typing stops
    const timer = setTimeout(() => {
      validateAndParseYaml(newText);
    }, 1000); // 1 second delay after typing stops
    
    setTypingTimer(timer);
  };

  return (
    <div className="topology-editor">
      <div className="editor-header">
        <div className="controls">
          <button onClick={handleImport}>Import YAML</button>
          <button onClick={handleExport}>Export YAML</button>
        </div>
        <div className={`yaml-status ${isValid ? 'valid' : 'invalid'}`}>
          {isValid ? 'Valid YAML ✓' : 'Invalid YAML ✗'}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <textarea
        value={yamlText}
        onChange={handleTextChange}
        placeholder="Paste your YAML here"
        className={`yaml-editor ${isValid ? 'valid' : 'invalid'}`}
      />
    </div>
  );
};

export default TopologyEditor;