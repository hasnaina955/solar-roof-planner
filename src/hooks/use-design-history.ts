import { useCallback, useReducer } from "react";
import { initialHistory, reduceHistory } from "@/lib/design-history";

export function useDesignHistory<T extends object>(
  initial: T,
  continuousKeys: string[],
) {
  const [state, dispatch] = useReducer(reduceHistory<T>, initial, initialHistory<T>);
  const edit = useCallback((patch: Partial<T> | ((current: T) => Partial<T>)) => {
    dispatch({ type: "edit", patch, at: Date.now(), continuousKeys });
  }, [continuousKeys]);
  const replace = useCallback((value: T) => dispatch({ type: "replace", value }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    design: state.present,
    edit,
    replace,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
