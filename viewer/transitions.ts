/**
 * Layout Transitions & Tweening (Lanum Ch. 6 Sec 6.4)
 * Governed by ADR 0028 and smooth_layout_transition_tweening-35.feature
 *
 * Provides cubic ease-out position interpolation and mid-transition retargeting
 * to avoid abrupt coordinate snaps when switching layout algorithms or expanding clusters.
 */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Cubic Ease-Out Function (Lanum Ch. 6 Sec 6.4)
 *
 * Smoothly decelerates toward target coordinates:
 * f(t) = 1 - (1 - clamped(t))^3
 *
 * At t = 0.0 -> 0.0
 * At t = 0.5 -> 0.875 (> 80% distance traveled)
 * At t = 1.0 -> 1.0
 */
export function cubicEaseOut(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * Interpolates positions between two node coordinate maps using cubic ease-out deceleration.
 *
 * - Nodes present in both maps are smoothly interpolated along x and y.
 * - Nodes present only in `to` snap to `to` coordinates.
 * - Nodes present only in `from` remain at `from` coordinates.
 */
export function interpolatePositions(
  from: Map<string, Point2D>,
  to: Map<string, Point2D>,
  rawProgress: number
): Map<string, Point2D> {
  const eased = cubicEaseOut(rawProgress);
  const result = new Map<string, Point2D>();
  const allKeys = new Set<string>([...from.keys(), ...to.keys()]);

  for (const id of allKeys) {
    const pFrom = from.get(id);
    const pTo = to.get(id);

    if (pFrom !== undefined && pTo !== undefined) {
      if (eased === 0) {
        result.set(id, { x: pFrom.x, y: pFrom.y });
      } else if (eased === 1) {
        result.set(id, { x: pTo.x, y: pTo.y });
      } else {
        result.set(id, {
          x: pFrom.x + (pTo.x - pFrom.x) * eased,
          y: pFrom.y + (pTo.y - pFrom.y) * eased,
        });
      }
    } else if (pTo !== undefined) {
      result.set(id, { x: pTo.x, y: pTo.y });
    } else if (pFrom !== undefined) {
      result.set(id, { x: pFrom.x, y: pFrom.y });
    }
  }

  return result;
}

export interface TransitionStepResult {
  positions: Map<string, Point2D>;
  progress: number;
  eased: number;
  done: boolean;
}

/**
 * Manages animated layout transitions with zero-jump mid-transition retargeting.
 */
export class LayoutTransitionManager {
  private startMap: Map<string, Point2D> = new Map();
  private targetMap: Map<string, Point2D> = new Map();
  private currentMap: Map<string, Point2D> = new Map();
  private startTimeMs = 0;
  private durationMs = 280;
  private active = false;

  public isActive(): boolean {
    return this.active;
  }

  /**
   * Starts a new layout transition from `from` coordinates to `to` coordinates.
   */
  public start(
    from: Map<string, Point2D>,
    to: Map<string, Point2D>,
    nowMs: number,
    durationMs = 280
  ): void {
    this.startMap = new Map(from);
    this.targetMap = new Map(to);
    this.startTimeMs = nowMs;
    this.durationMs = durationMs;
    this.active = true;
    this.currentMap = interpolatePositions(this.startMap, this.targetMap, 0);
  }

  /**
   * Retargets an active transition to a new set of target coordinates.
   * If already active, it interpolates the current position at `nowMs` and begins
   * the new transition from that midpoint, eliminating discontinuous backwards jumping.
   */
  public retarget(
    newTo: Map<string, Point2D>,
    nowMs: number,
    durationMs = 280
  ): void {
    if (this.active) {
      if (nowMs > this.startTimeMs && this.durationMs > 0) {
        const elapsed = nowMs - this.startTimeMs;
        const rawProgress = Math.min(1, Math.max(0, elapsed / this.durationMs));
        this.currentMap = interpolatePositions(this.startMap, this.targetMap, rawProgress);
      }
      this.startMap = new Map(this.currentMap);
      this.targetMap = new Map(newTo);
      this.startTimeMs = nowMs;
      this.durationMs = durationMs;
      this.active = true;
    } else {
      this.start(this.currentMap, newTo, nowMs, durationMs);
    }
  }

  /**
   * Advances the transition to the specified timestamp `nowMs`.
   */
  public step(nowMs: number): TransitionStepResult {
    if (!this.active) {
      return {
        positions: new Map(this.currentMap),
        progress: 1.0,
        eased: 1.0,
        done: true,
      };
    }

    const elapsed = nowMs - this.startTimeMs;
    if (elapsed >= this.durationMs) {
      this.currentMap = new Map(this.targetMap);
      this.active = false;
      return {
        positions: new Map(this.currentMap),
        progress: 1.0,
        eased: 1.0,
        done: true,
      };
    }

    const rawProgress = this.durationMs > 0 ? Math.max(0, elapsed / this.durationMs) : 1.0;
    const eased = cubicEaseOut(rawProgress);
    this.currentMap = interpolatePositions(this.startMap, this.targetMap, rawProgress);

    return {
      positions: new Map(this.currentMap),
      progress: rawProgress,
      eased,
      done: false,
    };
  }

  /**
   * Returns a snapshot of the current node coordinates.
   */
  public getCurrentPositions(): Map<string, Point2D> {
    return new Map(this.currentMap);
  }

  /**
   * Cancels the active transition, freezing nodes at their current coordinates.
   */
  public cancel(): void {
    this.active = false;
  }
}
