/**
 * Pipeline Systems for Entity Component Store.
 *
 * Implements deterministic batch loops over flat typed arrays:
 * - EventDispatcherSystem: drains ring buffer into component state bitmasks
 * - VerletPhysicsSystem: steps Hookean spring forces and velocity damping
 * - CausalBlastSystem: evaluates directional causal blast over CSR topology
 * - extractWebGLVBOData: zero-copy binary streaming for GPU vertex buffer objects
 *
 * Governed by ADR 0023 and Feature 27.
 */

import { EntityComponentStore, EntityFlag, CSRTopologyStore } from "./store.js";
import { EntityEventRingBuffer, EntityOpCode } from "./event-ring-buffer.js";
import { evaluateDirectionalBlastStep, BlastPhase } from "../sankey-engine.js";

export class EventDispatcherSystem {
  update(store: EntityComponentStore, ring: EntityEventRingBuffer): void {
    ring.drain((op, entityId, a, b) => {
      if (entityId < 0 || entityId >= store.count) return;

      switch (op) {
        case EntityOpCode.POINTER_DOWN:
          store.flags[entityId] |= EntityFlag.PINNED | EntityFlag.SELECTED | EntityFlag.DIRTY_POSITION;
          if (a !== 0 || b !== 0) {
            store.posX[entityId] = a;
            store.posY[entityId] = b;
          }
          break;

        case EntityOpCode.POINTER_MOVE:
          if ((store.flags[entityId] & EntityFlag.PINNED) !== 0) {
            store.posX[entityId] = a;
            store.posY[entityId] = b;
            store.flags[entityId] |= EntityFlag.DIRTY_POSITION;
          }
          break;

        case EntityOpCode.POINTER_UP:
          store.flags[entityId] &= ~EntityFlag.PINNED;
          break;

        case EntityOpCode.NODE_SELECT:
          store.flags[entityId] ^= EntityFlag.SELECTED;
          break;
      }
    });
  }
}

export class VerletPhysicsSystem {
  update(store: EntityComponentStore, dt = 0.016, damping = 0.88): void {
    const N = store.count;
    const posX = store.posX;
    const posY = store.posY;
    const velX = store.velX;
    const velY = store.velY;
    const flags = store.flags;

    for (let i = 0; i < N; i++) {
      // Pinned entities hold fixed coordinates
      if ((flags[i] & EntityFlag.PINNED) !== 0) {
        velX[i] = 0;
        velY[i] = 0;
        continue;
      }

      // Integrate velocity into position
      posX[i] += velX[i] * dt;
      posY[i] += velY[i] * dt;

      // Apply velocity damping
      velX[i] *= damping;
      velY[i] *= damping;

      flags[i] |= EntityFlag.DIRTY_POSITION;
    }
  }
}

export class CausalBlastSystem {
  propagate(
    store: EntityComponentStore,
    topology: CSRTopologyStore,
    seedEntityId: number,
    decayPerHop = 0.65,
    maxHops = 4,
  ): void {
    const N = store.count;
    store.blastEnergy.fill(0);
    store.blastHop.fill(255);

    // Clear blast flags
    for (let i = 0; i < N; i++) {
      store.flags[i] &= ~(EntityFlag.IS_SEED | EntityFlag.IN_BLAST);
    }

    if (seedEntityId < 0 || seedEntityId >= N) return;

    store.blastEnergy[seedEntityId] = 1.0;
    store.blastHop[seedEntityId] = 0;
    store.flags[seedEntityId] |= EntityFlag.IS_SEED | EntityFlag.IN_BLAST;

    interface BFSQueueItem {
      id: number;
      hop: number;
      energy: number;
      phase: BlastPhase;
    }

    const queue: BFSQueueItem[] = [
      { id: seedEntityId, hop: 0, energy: 1.0, phase: "SEED" },
    ];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr.hop >= maxHops || curr.phase === "LEAF_SINK") continue;

      const start = topology.head[curr.id];
      const end = topology.head[curr.id + 1];

      for (let p = start; p < end; p++) {
        const neighbor = topology.target[p];
        const rel = topology.relation[p];
        const dir = topology.direction[p] === 0 ? "forward" : "reverse";

        const { weight, nextPhase } = evaluateDirectionalBlastStep(
          rel,
          dir,
          curr.phase,
          true,
        );

        if (weight <= 0) continue;

        const nextHop = curr.hop + 1;
        const hopFactor = nextHop === 1 ? 1.0 : decayPerHop;
        const nextEnergy = Number((curr.energy * hopFactor * weight).toFixed(3));

        if (nextEnergy > store.blastEnergy[neighbor]) {
          store.blastEnergy[neighbor] = nextEnergy;
          store.blastHop[neighbor] = nextHop;
          if (nextEnergy >= 0.14) {
            store.flags[neighbor] |= EntityFlag.IN_BLAST;
          }
          queue.push({ id: neighbor, hop: nextHop, energy: nextEnergy, phase: nextPhase });
        }
      }
    }
  }
}

export interface WebGLVBOData {
  positions: Float32Array;
  colors: Uint32Array;
}

/**
 * Packs entity coordinates into contiguous 2D float stream suitable for direct gl.bufferSubData.
 */
export function extractWebGLVBOData(store: EntityComponentStore): WebGLVBOData {
  const count = store.count;
  const positions = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    positions[i * 2] = store.posX[i];
    positions[i * 2 + 1] = store.posY[i];
  }

  const colors = store.colorRGBA.subarray(0, count);

  return { positions, colors };
}
