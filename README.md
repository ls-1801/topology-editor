# Graph Topology Editor

A web application for visualizing and editing graph topologies based on YAML files. The app allows you to:

- Visualize node graphs with interactive D3.js visualization
- Import/export topology from/to YAML files
- Edit node properties ("sinks")
- Add/remove nodes and connections
- Drag nodes to reorganize the graph layout

## Features

- **Interactive Graph Visualization**: Force-directed layout with panning and zooming capabilities
- **YAML Import/Export**: Load and save graph topologies in YAML format
- **Node Property Editor**: Edit node sink properties with type-appropriate editors
- **Topology Management**: Add/remove nodes and connections through an intuitive interface

## Technology Stack

- TypeScript for type safety
- React for UI components
- D3.js for interactive graph visualization
- js-yaml for YAML parsing and serialization
- Vite for fast development and building

## Development

To start the development server:

```bash
npm run dev
```

To build for production:

```bash
npm run build
```

## Project Structure

- `/src`: Source code
  - `/components`: React components
  - `types.ts`: TypeScript type definitions
  - `App.tsx`: Main application component
  - `main.tsx`: Application entry point
- `/public`: Static assets including sample topology.yaml

## YAML Format

```yaml
nodes:
  - connection: "node1"
    sinks:
      property1: "value1"
      property2: 42
  - connection: "node2"
    sinks:
      property1: "value2"
      property3: true

links:
  - source: "node1"
    target: "node2"
```

- `nodes`: Array of nodes with a `connection` name and `sinks` properties
- `links`: Array of connections between nodes, defined by `source` and `target` connection names