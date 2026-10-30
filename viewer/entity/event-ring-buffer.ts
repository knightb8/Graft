/**
 * Fixed-Capacity Zero-Allocation Entity Event Ring Buffer.
 *
 * Encodes interaction and simulation signals into a pre-allocated Float32Array.
 * Eliminates garbage collection pressure during continuous 60fps interaction loops.
 * Governed by ADR 0023 and Feature 27.
 */

export const enum EntityOpCode {
  NONE              = 0,
  POINTER_DOWN      = 1,   // [1, entityId, clientX, clientY]
  POINTER_MOVE      = 2,   // [2, entityId, deltaX,  deltaY]
  POINTER_UP        = 3,   // [3, entityId, 0,       0]
  NODE_SELECT       = 10,  // [10, entityId, multiSelectFlag, 0]
  BLAST_TRIGGER     = 11,  // [11, seedEntityId, hopDecayGamma, 0]
  FOLDER_EXPAND     = 20,  // [20, clusterId, drillDownLevel, 0]
  FOLDER_COLLAPSE   = 21,  // [21, clusterId, 0, 0]
  SCOPE_FILTER      = 30,  // [30, scopeMask, 0, 0]
  WAKE_CLUSTER      = 40,  // [40, clusterId, reheatEnergy, 0]
}

export const EVENT_STRIDE = 4;

export class EntityEventRingBuffer {
  public readonly capacity: number;
  private buffer: Float32Array;
  private head = 0;
  private tail = 0;

  constructor(capacity = 2048) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity * EVENT_STRIDE);
  }

  size(): number {
    return this.head - this.tail;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
  }

  emit(op: EntityOpCode, entityId: number, paramA = 0, paramB = 0): void {
    const idx = (this.head % this.capacity) * EVENT_STRIDE;
    this.buffer[idx]     = op;
    this.buffer[idx + 1] = entityId;
    this.buffer[idx + 2] = paramA;
    this.buffer[idx + 3] = paramB;
    this.head++;

    // Guard against overflowing capacity
    if (this.head - this.tail > this.capacity) {
      this.tail = this.head - this.capacity;
    }
  }

  drain(callback: (op: EntityOpCode, entityId: number, a: number, b: number) => void): void {
    while (this.tail < this.head) {
      const idx = (this.tail % this.capacity) * EVENT_STRIDE;
      const op = this.buffer[idx] as EntityOpCode;
      const entityId = this.buffer[idx + 1] | 0;
      const a = this.buffer[idx + 2];
      const b = this.buffer[idx + 3];
      this.tail++;
      callback(op, entityId, a, b);
    }

    // Reset indices periodically to avoid integer precision degradation
    if (this.tail >= this.capacity * 1000) {
      this.head = this.head % this.capacity;
      this.tail = 0;
    }
  }
}
