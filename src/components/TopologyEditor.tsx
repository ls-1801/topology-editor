import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [typingTimer, setTypingTimer] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const lastValidYaml = useRef<string>(dump(topology));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Function to validate YAML without updating topology
  const validateYaml = useCallback((text: string): boolean => {
    try {
      const parsedYaml = load(text) as any;
      
      if (!parsedYaml.nodes) {
        throw new Error('Invalid topology format. Must include nodes.');
      }
      
      return true;
    } catch (err) {
      setError(`Error parsing YAML: ${err instanceof Error ? err.message : String(err)}`);
      setIsValid(false);
      return false;
    }
  }, []);

  // Function to update topology after validation
  const updateTopology = useCallback((text: string) => {
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
      setIsDirty(false);
      lastValidYaml.current = text;
      return true;
    } catch (err) {
      // This should not happen since we already validated
      console.error("Error updating topology:", err);
      return false;
    }
  }, [setTopology]);

  // Update YAML when topology changes (e.g., from other components)
  useEffect(() => {
    // Only update if the editor doesn't have unsaved changes
    if (!isDirty) {
      const newYamlText = dump(topology);
      if (newYamlText !== yamlText) {
        setYamlText(newYamlText);
        lastValidYaml.current = newYamlText;
        setIsValid(true);
        setError('');
      }
    }
  }, [topology, yamlText, isDirty]);

  // Handle manual import button click
  const handleImport = () => {
    if (validateYaml(yamlText)) {
      updateTopology(yamlText);
    }
  };

  // Handle export function
  const handleExport = () => {
    try {
      const yamlString = dump(topology);
      setYamlText(yamlString);
      setError('');
      setIsValid(true);
      setIsDirty(false);
      lastValidYaml.current = yamlString;
      
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

  // Reset to last valid YAML
  const handleReset = () => {
    setYamlText(lastValidYaml.current);
    setIsValid(true);
    setError('');
    setIsDirty(false);
  };

  // Handle text changes with debouncing
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setYamlText(newText);
    setIsDirty(true);
    
    // Preserve cursor position after state update
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = cursorPosition;
        textareaRef.current.selectionEnd = cursorPosition;
      }
    }, 0);
    
    // Clear previous timer
    if (typingTimer) {
      window.clearTimeout(typingTimer);
    }
    
    // Set a new timer to validate after typing stops
    const timer = window.setTimeout(() => {
      // First just validate without updating
      if (validateYaml(newText)) {
        setIsValid(true);
        setError('');
        // If valid, update the topology
        updateTopology(newText);
      }
    }, 1000); // 1 second delay after typing stops
    
    setTypingTimer(timer);
  };

  return (
    <div className="topology-editor">
      <div className="editor-header">
        <div className="controls">
          <button onClick={handleImport}>Import YAML</button>
          <button onClick={handleExport}>Export YAML</button>
          {!isValid && <button onClick={handleReset}>Reset to Valid YAML</button>}
        </div>
        <div className={`yaml-status ${isValid ? 'valid' : 'invalid'}`}>
          {isValid ? (isDirty ? 'Valid YAML (Unsaved) ✓' : 'Valid YAML ✓') : 'Invalid YAML ✗'}
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      <textarea
        ref={textareaRef}
        value={yamlText}
        onChange={handleTextChange}
        placeholder="Paste your YAML here"
        className={`yaml-editor ${isValid ? 'valid' : 'invalid'}`}
        spellCheck="false"
      />
      {isDirty && isValid && (
        <div className="yaml-info">
          Changes will be applied automatically after validation
        </div>
      )}
    </div>
  );
};

export default TopologyEditor;