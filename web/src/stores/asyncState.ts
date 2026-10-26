import { reactive } from 'vue';

/**
 * The one shape every asynchronous value in this application has.
 *
 * Four states rather than three, because "not started yet" is not the same
 * as "loading": a route can render before anything has been requested, and a
 * view that treats idle as loading shows a spinner for data nobody asked for.
 */
export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T;
  error: string | null;
}

/**
 * Wrap an initial value as an async state. The data is always present and
 * always of type T — an empty list, a null — so a view rendering during any
 * state other than 'ready' never has to defend against undefined.
 */
export function createAsync<T>(initial: T): AsyncState<T> {
  return reactive({ status: 'idle', data: initial, error: null }) as AsyncState<T>;
}

/**
 * Run a loader against a state, keeping the three transitions honest.
 *
 * The previous data is deliberately kept during a reload rather than being
 * cleared: replacing a list with a spinner on every refetch makes the view
 * jump, and the M1 checklist asks for a loading state, not for content to
 * disappear while it is shown.
 */
export async function run<T>(
  state: AsyncState<T>,
  loader: () => Promise<T>,
): Promise<void> {
  state.status = 'loading';
  state.error = null;
  try {
    state.data = await loader();
    state.status = 'ready';
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
    state.status = 'error';
  }
}

export function isLoading(state: AsyncState<unknown>): boolean {
  return state.status === 'loading';
}

export function hasError(state: AsyncState<unknown>): boolean {
  return state.status === 'error';
}

/** True once a request has finished and returned nothing. */
export function isEmpty(state: AsyncState<readonly unknown[]>): boolean {
  return state.status === 'ready' && state.data.length === 0;
}
