// Local shims: @types/react is not installed in this build environment, so React is typed loosely
// (enough for tsc to check this app's own logic, data shapes and store contract).
declare namespace React {
  type ReactNode = any; type SVGProps<T> = any; type InputHTMLAttributes<T> = any; type TextareaHTMLAttributes<T> = any;
  type MutableRefObject<T> = { current: T }; type FormEvent = any; type KeyboardEvent = any;
  interface Context<T> { Provider: any }
}
declare module 'react' {
  export = React;
}
declare namespace React {
  function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  function useEffect(fn: () => any, deps?: any[]): void;
  function useMemo<T>(fn: () => T, deps: any[]): T;
  function useCallback<T>(fn: T, deps: any[]): T;
  function useRef<T>(init: T | null): { current: T };
  function useRef<T = undefined>(): { current: T | undefined };
  function useContext<T>(c: Context<T>): T;
  function createContext<T>(v: T): Context<T>;
  function useId(): string;
  function lazy(f: any): any;
  const Suspense: any; const Fragment: any;
}
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any; }
declare module 'react-dom/client' { export function createRoot(el: Element): { render(n: any): void }; }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element {} interface IntrinsicAttributes { key?: any } }
