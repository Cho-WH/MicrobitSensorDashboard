// Pure assembly contract. No Three.js, DOM, measurement state or sensor branches.
// A cable's leads describe electrical paths; its kind only changes the physical presentation.
export function validateAssembly(assembly) {
  const parts = new Map(), nodes = new Map();
  const fail = message => { throw new Error(`배선 구성: ${message}`); };
  for (const part of assembly.parts) {
    if (parts.has(part.id)) fail(`중복 부품 ${part.id}`);
    parts.set(part.id, part);
    for (const [id, port] of Object.entries(part.spec.ports ?? {})) {
      if (port.point?.length !== 3 || !port.point.every(Number.isFinite) || port.direction?.length !== 3
        || !port.direction.every(Number.isFinite) || !port.direction.some(value => value !== 0)) fail(`단자 위치 ${part.id}.${id}`);
      nodes.set(`${part.id}/${id}`, { parent: `${part.id}/${id}`, port });
    }
  }
  const key = endpoint => {
    const value = `${endpoint.part}/${endpoint.port}`;
    if (!nodes.has(value)) fail(`없는 단자 ${value}`);
    return value;
  };
  const root = id => { const node = nodes.get(id); if (node.parent !== id) node.parent = root(node.parent); return node.parent; };
  const join = (a, b) => { nodes.get(root(a)).parent = root(b); };
  const boardNets = new Map();
  for (const [id, { port }] of nodes) if (port.net) {
    if (boardNets.has(port.net)) join(id, boardNets.get(port.net)); else boardNets.set(port.net, id);
  }
  for (const part of assembly.parts) for (const [a, b] of part.spec.bridges ?? []) join(key({ part: part.id, port: a }), key({ part: part.id, port: b }));
  const cableIds = new Set(), occupied = new Set();
  for (const cable of assembly.cables) {
    if (cableIds.has(cable.id) || !['individual', 'bundle', 'sheathed'].includes(cable.kind) || !cable.leads.length) fail(`케이블 ${cable.id}`);
    cableIds.add(cable.id);
    for (const lead of cable.leads) {
      if (!assembly.signals.some(signal => signal.id === lead.signal)) fail(`없는 신호 ${lead.signal}`);
      const ends = [key(lead.from), key(lead.to)];
      for (const end of ends) { if (occupied.has(end)) fail(`중복 연결 ${end}`); occupied.add(end); }
      join(...ends);
    }
    if (cable.kind === 'bundle') for (const end of ['from', 'to']) {
      const endpoints = cable.leads.map(lead => lead[end]);
      const ports = endpoints.map(endpoint => nodes.get(key(endpoint)).port);
      const first = ports[0], slots = ports.map(port => port.slot);
      // A single plug cannot join unrelated sockets or silently permute the pin order.
      if (!first.connector || endpoints.some(endpoint => endpoint.part !== endpoints[0].part)
        || ports.some(port => port.connector !== first.connector || port.pitch !== first.pitch || port.contact !== first.contact)
        || slots.some((slot, index) => index && slot - slots[index - 1] !== slots[1] - slots[0])
        || (slots.length > 1 && Math.abs(slots[1] - slots[0]) !== 1)) fail(`묶음 커넥터 핀 순서 ${cable.id}`);
    }
  }
  const assigned = new Map();
  for (const [net, id] of boardNets) {
    const group = root(id);
    if (assigned.has(group) && assigned.get(group) !== net) fail(`서로 다른 신호가 연결됨: ${net}, ${assigned.get(group)}`);
    assigned.set(group, net);
  }
  for (const part of assembly.parts) for (const [port, expected] of Object.entries(part.requires ?? {})) {
    if (assigned.get(root(key({ part: part.id, port }))) !== expected) fail(`${part.id}.${port} → ${expected} 연결 누락 또는 오류`);
  }
  return assembly;
}

export function requireInterface(board, name, signals) {
  const ports = board.interfaces[name];
  if (!ports || signals.some(signal => !board.ports[ports[signal]])) throw new Error(`${board.label}: ${name} 연결을 지원하지 않습니다.`);
  return ports;
}
