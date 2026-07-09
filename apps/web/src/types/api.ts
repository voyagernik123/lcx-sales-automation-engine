export interface ApiResponse<T> { data: T; error?: string; meta?: { timestamp: string; version: string; }; }
export interface GraphQueryResult { nodes: import('./ontology').RegulatoryNode[]; edges: import('./ontology').OntologyGraph['edges']; }
