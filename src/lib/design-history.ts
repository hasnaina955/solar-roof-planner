/** Pure, testable snapshot history. Only repeated edits to one scalar merge. */
export interface DesignHistory<T> {
  present: T;
  past: T[];
  future: T[];
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction<T> =
  | { type: "edit"; patch: Partial<T> | ((current: T) => Partial<T>); at: number; continuousKeys: string[] }
  | { type: "replace"; value: T }
  | { type: "undo" }
  | { type: "redo" };

export function initialHistory<T>(value: T): DesignHistory<T> {
  return { present: value, past: [], future: [], lastKey: null, lastAt: 0 };
}

export function reduceHistory<T extends object>(
  state: DesignHistory<T>,
  action: HistoryAction<T>,
): DesignHistory<T> {
  if (action.type === "replace") return initialHistory(action.value);
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      present: state.past[state.past.length - 1],
      past: state.past.slice(0, -1),
      future: [...state.future, state.present],
      lastKey: null,
      lastAt: 0,
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      present: state.future[state.future.length - 1],
      past: [...state.past, state.present].slice(-100),
      future: state.future.slice(0, -1),
      lastKey: null,
      lastAt: 0,
    };
  }
  const patch = typeof action.patch === "function" ? action.patch(state.present) : action.patch;
  const present = { ...state.present, ...patch };
  const changed = (Object.keys(patch) as (keyof T)[]).filter(
    (key) => JSON.stringify(present[key]) !== JSON.stringify(state.present[key]),
  );
  if (!changed.length) return state;
  const key = changed.length === 1 && action.continuousKeys.includes(String(changed[0]))
    ? String(changed[0]) : null;
  const merge = key !== null && state.lastKey === key && state.past.length > 0 &&
    state.future.length === 0 && action.at - state.lastAt < 600;
  return {
    present,
    past: merge ? state.past : [...state.past, state.present].slice(-100),
    future: [], // Any divergent edit invalidates redo, including slider edits.
    lastKey: key,
    lastAt: action.at,
  };
}
