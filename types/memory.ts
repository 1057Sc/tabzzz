export interface SystemMemory {
  capacityBytes: number;
  availableCapacityBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export interface MemorySnapshot {
  timestamp: number;
  system: SystemMemory;
  totalTabMemoryBytes: number;
  perTab: Record<number, number>;
  sleeping: number;
  total: number;
}

export interface MemoryHistory {
  snapshots: MemorySnapshot[];
  maxSnapshots: number;
}
