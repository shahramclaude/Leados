"use client";

import type { NetworkEdge, NetworkNode } from "./Network";
import NetworkGraph from "./Network";

export function NetworkLazy({ nodes, edges }: { nodes: NetworkNode[]; edges: NetworkEdge[] }) {
  return <NetworkGraph nodes={nodes} edges={edges} />;
}

export default NetworkLazy;
