/**
 * Undo/redo for the planner's design state.
 *
 * The design is a dozen independent `useState` values, so rather than rewriting
 * them into a reducer this hook snapshots them: it watches the serialised
 * design, pushes the pre-change snapshot when something meaningful changes, and
 * restores it on undo.
 *
 * Two details make it usable rather than merely correct:
 *
 *  - **Coalescing.** Dragging the tilt slider produces a change per frame. Left
 *    alone that is several hundred undo steps, so consecutive edits that share a
 *    shape and land inside `coalesceMs` merge into one step.
 *  - **Shape.** A change to the polygon, the obstructions, the appliances or the
 *    module always starts a new step, because those are discrete user actions
 *    and must never be swallowed into a slider drag.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface HistoryOptions<T> {
  /** Current design state, read fresh on every render. */
  read: () => T;
  /** Write a snapshot back into the design state. */
  apply: (value: T) => void;
  /**
   * Identity of the design's "shape". Equal shape means the edit is a
   * continuation of the previous one and may be coalesced into it.
   */
  shapeOf: (value: T) => string;
  /** Milliseconds within which consecutive edits merge into one step. */
  coalesceMs?: number;
  /** Maximum steps retained. */
  limit?: number;
}

export interface HistoryControls {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Drop both stacks, e.g. after loading a saved design. */
  reset: () => void;
}

interface Stacks {
  past: string[];
  future: string[];
}

const EMPTY: Stacks = { past: [], future: [] };

export function useDesignHistory<T>({
  read,
  apply,
  shapeOf,
  coalesceMs = 600,
  limit = 100,
}: HistoryOptions<T>): HistoryControls {
  const [stacks, setStacks] = useState<Stacks>(EMPTY);
  /** The design as of the last recorded change: the undo target. */
  const current = useRef<string | null>(null);
  const currentShape = useRef<string | null>(null);
  const lastChangeAt = useRef(0);
  /** True while undo/redo is writing, so the restore is not recorded again. */
  const restoring = useRef(false);

  // Deliberately runs after every render: the design lives in a dozen separate
  // `useState` values, so there is no single dependency to watch. The
  // serialised comparison below is what decides whether anything actually
  // happened, and it converges — once `current` matches, no state is set and
  // the effect is a no-op.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const value = read();
    const json = JSON.stringify(value);

    if (current.current === null) {
      current.current = json;
      currentShape.current = shapeOf(value);
      lastChangeAt.current = Date.now();
      return;
    }
    if (json === current.current) return;

    const shape = shapeOf(value);
    const now = Date.now();

    if (restoring.current) {
      restoring.current = false;
      current.current = json;
      currentShape.current = shape;
      lastChangeAt.current = now;
      return;
    }

    const continuesSameEdit =
      shape === currentShape.current && now - lastChangeAt.current < coalesceMs;
    if (!continuesSameEdit) {
      const target = current.current;
      setStacks((s) => ({
        past: [...s.past.slice(-(limit - 1)), target],
        future: [],
      }));
    }
    current.current = json;
    currentShape.current = shape;
    lastChangeAt.current = now;
  });

  const undo = useCallback(() => {
    const previous = stacks.past[stacks.past.length - 1];
    const leaving = current.current;
    if (previous === undefined || leaving === null) return;
    restoring.current = true;
    setStacks({
      past: stacks.past.slice(0, -1),
      future: [...stacks.future, leaving],
    });
    apply(JSON.parse(previous) as T);
  }, [apply, stacks]);

  const redo = useCallback(() => {
    const next = stacks.future[stacks.future.length - 1];
    const leaving = current.current;
    if (next === undefined || leaving === null) return;
    restoring.current = true;
    setStacks({
      past: [...stacks.past, leaving],
      future: stacks.future.slice(0, -1),
    });
    apply(JSON.parse(next) as T);
  }, [apply, stacks]);

  const reset = useCallback(() => {
    const value = read();
    restoring.current = true;
    current.current = JSON.stringify(value);
    currentShape.current = shapeOf(value);
    setStacks(EMPTY);
  }, [read, shapeOf]);

  return {
    undo,
    redo,
    canUndo: stacks.past.length > 0,
    canRedo: stacks.future.length > 0,
    reset,
  };
}
