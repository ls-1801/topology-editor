export interface SinkConfig {
  [key: string]: string | number | boolean | Array<string | number | boolean> | object;
}

export interface Sink {
  name: string;
  type: string;
  config?: SinkConfig;
}

export interface PhysicalSource {
  logical: string;
  parserConfig: {
    type: string;
    [key: string]: any;
  };
  sourceConfig: {
    type: string;
    [key: string]: any;
  };
}

export interface Node {
  connection: string;
  grpc: string;
  capacity: number;
  sinks?: Sink[];
  links?: {
    downstreams?: string[];
    upstreams?: string[];
  };
  physical?: PhysicalSource[];
}

export interface SchemaField {
  name: string;
  type: string;
}

export interface LogicalSchema {
  name: string;
  schema: SchemaField[];
}

export interface Topology {
  logical?: LogicalSchema[];
  nodes: Node[];
}

// Define a union type for all node types in the selection
export type NodeSelection = 
  | { type: 'main'; nodeId: string; }
  | { type: 'physical'; nodeId: string; parentId: string; name: string; index?: number; }
  | { type: 'sink'; nodeId: string; parentId: string; name: string; index?: number; }
  | null;

export interface SimulationNode extends d3.SimulationNodeDatum {
  id: string;
  connection: string;
  grpc?: string;
  capacity?: number;
  sinks?: Sink[];
  links?: {
    downstreams?: string[];
    upstreams?: string[];
  };
  physical?: PhysicalSource[];
  nodeType?: 'main' | 'physical' | 'sink';
  // For physical and sink nodes, we need to track their parent and index
  parentId?: string;
  index?: number;
  // Additional properties for drag handling
  _dragParent?: string;
  _dragStartX?: number;
  _dragStartY?: number;
}

export interface SimulationLink extends d3.SimulationLinkDatum<SimulationNode> {
  source: string | SimulationNode;
  target: string | SimulationNode;
  direction: 'downstream' | 'upstream' | 'physical' | 'sink';
}