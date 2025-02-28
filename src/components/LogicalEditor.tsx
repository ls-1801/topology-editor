import React, { useState } from 'react';
import { LogicalSchema, SchemaField } from '../types';

interface LogicalEditorProps {
  schemas: LogicalSchema[];
  onAddSchema: (schema: LogicalSchema) => void;
  onUpdateSchema: (index: number, schema: LogicalSchema) => void;
  onRemoveSchema: (index: number) => void;
}

const LogicalEditor: React.FC<LogicalEditorProps> = ({ 
  schemas,
  onAddSchema,
  onUpdateSchema,
  onRemoveSchema
}) => {
  const [selectedSchemaIndex, setSelectedSchemaIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<'view' | 'edit' | 'add'>('view');
  const [editingSchema, setEditingSchema] = useState<LogicalSchema>({
    name: '',
    schema: []
  });
  
  // Select a schema to view/edit
  const handleSelectSchema = (index: number) => {
    setSelectedSchemaIndex(index);
    setEditMode('view');
  };
  
  // Start editing an existing schema
  const handleEditSchema = () => {
    if (selectedSchemaIndex === null) return;
    
    setEditingSchema({...schemas[selectedSchemaIndex]});
    setEditMode('edit');
  };
  
  // Start adding a new schema
  const handleAddSchemaClick = () => {
    setEditingSchema({
      name: '',
      schema: []
    });
    setEditMode('add');
    setSelectedSchemaIndex(null);
  };
  
  // Save changes to schema (add or update)
  const handleSaveSchema = () => {
    if (editMode === 'add') {
      onAddSchema(editingSchema);
      setSelectedSchemaIndex(schemas.length);
    } else if (editMode === 'edit' && selectedSchemaIndex !== null) {
      onUpdateSchema(selectedSchemaIndex, editingSchema);
    }
    
    setEditMode('view');
  };
  
  // Cancel editing/adding
  const handleCancelEdit = () => {
    setEditMode('view');
    if (selectedSchemaIndex !== null) {
      setEditingSchema({...schemas[selectedSchemaIndex]});
    }
  };
  
  // Remove a schema
  const handleRemoveSchema = () => {
    if (selectedSchemaIndex === null) return;
    
    onRemoveSchema(selectedSchemaIndex);
    setSelectedSchemaIndex(null);
    setEditMode('view');
  };
  
  // Handle schema name change
  const handleSchemaNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingSchema({
      ...editingSchema,
      name: e.target.value
    });
  };
  
  // Add a new field to the schema
  const handleAddField = () => {
    setEditingSchema({
      ...editingSchema,
      schema: [...editingSchema.schema, { name: '', type: 'UINT64' }]
    });
  };
  
  // Update a field in the schema
  const handleFieldChange = (index: number, field: SchemaField) => {
    const updatedSchema = [...editingSchema.schema];
    updatedSchema[index] = field;
    
    setEditingSchema({
      ...editingSchema,
      schema: updatedSchema
    });
  };
  
  // Remove a field from the schema
  const handleRemoveField = (index: number) => {
    const updatedSchema = editingSchema.schema.filter((_, i) => i !== index);
    
    setEditingSchema({
      ...editingSchema,
      schema: updatedSchema
    });
  };
  
  return (
    <div className="logical-editor">
      <h2>Logical Schemas</h2>
      
      <div className="schema-list">
        {schemas.length > 0 ? (
          <ul>
            {schemas.map((schema, index) => (
              <li 
                key={index}
                className={selectedSchemaIndex === index ? 'selected' : ''}
                onClick={() => handleSelectSchema(index)}
              >
                {schema.name}
              </li>
            ))}
          </ul>
        ) : (
          <p>No logical schemas defined. Create one to get started.</p>
        )}
        
        <div className="schema-actions">
          <button onClick={handleAddSchemaClick}>Add Schema</button>
        </div>
      </div>
      
      {editMode === 'view' && selectedSchemaIndex !== null && (
        <div className="schema-detail">
          <h3>{schemas[selectedSchemaIndex].name}</h3>
          
          <div className="schema-fields">
            <table>
              <thead>
                <tr>
                  <th>Field Name</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {schemas[selectedSchemaIndex].schema.map((field, index) => (
                  <tr key={index}>
                    <td>{field.name}</td>
                    <td>{field.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="schema-detail-actions">
            <button onClick={handleEditSchema}>Edit</button>
            <button onClick={handleRemoveSchema}>Remove</button>
          </div>
        </div>
      )}
      
      {(editMode === 'edit' || editMode === 'add') && (
        <div className="schema-editor">
          <h3>{editMode === 'add' ? 'Add New Schema' : 'Edit Schema'}</h3>
          
          <div className="form-group">
            <label htmlFor="schema-name">Schema Name:</label>
            <input
              id="schema-name"
              type="text"
              value={editingSchema.name}
              onChange={handleSchemaNameChange}
              placeholder="Enter schema name"
            />
          </div>
          
          <h4>Fields</h4>
          {editingSchema.schema.map((field, index) => (
            <div key={index} className="field-editor">
              <input
                type="text"
                value={field.name}
                onChange={(e) => handleFieldChange(index, {...field, name: e.target.value})}
                placeholder="Field name"
              />
              <select
                value={field.type}
                onChange={(e) => handleFieldChange(index, {...field, type: e.target.value})}
              >
                <option value="UINT64">UINT64</option>
                <option value="INT64">INT64</option>
                <option value="DOUBLE">DOUBLE</option>
                <option value="STRING">STRING</option>
                <option value="BOOLEAN">BOOLEAN</option>
              </select>
              <button onClick={() => handleRemoveField(index)}>Remove</button>
            </div>
          ))}
          
          <div className="field-actions">
            <button onClick={handleAddField}>Add Field</button>
          </div>
          
          <div className="schema-editor-actions">
            <button onClick={handleSaveSchema}>Save</button>
            <button onClick={handleCancelEdit}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogicalEditor;