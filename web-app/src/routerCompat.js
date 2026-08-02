import React, { useCallback, useMemo } from 'react';
import {
  Route as WouterRoute,
  Router,
  Switch,
  useLocation as useWouterLocation,
  useParams,
  useSearch
} from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

const MemoryStateContext = React.createContext(null);

export const BrowserRouter = ({ children }) => (
  <Router>{children}</Router>
);

export const MemoryRouter = ({
  children,
  initialEntries = ['/'],
  initialIndex = 0
}) => {
  const initialEntry = initialEntries[initialIndex] || '/';
  const initialPath = typeof initialEntry === 'string'
    ? initialEntry
    : `${initialEntry.pathname || '/'}${initialEntry.search || ''}${initialEntry.hash || ''}`;
  const initialState = typeof initialEntry === 'string' ? null : initialEntry.state;
  const memory = useMemo(
    () => memoryLocation({ path: initialPath, state: initialState, record: true }),
    [initialPath, initialState]
  );

  return (
    <MemoryStateContext.Provider value={memory}>
      <Router hook={memory.hook}>{children}</Router>
    </MemoryStateContext.Provider>
  );
};

export const Routes = ({ children }) => <Switch>{children}</Switch>;

export const Route = ({ path, element }) => (
  <WouterRoute path={path}>{element}</WouterRoute>
);

export const Navigate = ({ to, replace = false, state }) => {
  const [, navigate] = useWouterLocation();

  React.useEffect(() => {
    navigate(to, { replace, state });
  }, [navigate, replace, state, to]);

  return null;
};

export const useNavigate = () => {
  const [, navigate] = useWouterLocation();

  return useCallback((to, options = {}) => {
    if (typeof to === 'number') {
      window.history.go(to);
      return;
    }

    navigate(to, {
      replace: Boolean(options.replace),
      state: options.state
    });
  }, [navigate]);
};

export const useLocation = () => {
  const [pathname] = useWouterLocation();
  const search = useSearch();
  const memory = React.useContext(MemoryStateContext);

  return {
    pathname,
    search,
    hash: typeof window === 'undefined' ? '' : window.location.hash,
    state: memory
      ? memory.state
      : (typeof window === 'undefined' ? null : window.history.state)
  };
};

export { useParams };
