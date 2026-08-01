import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

type NavigateOptions = { replace?: boolean };
type NavigateFn = (to: string, options?: NavigateOptions) => void;
type RouterState = { path: string; navigate: NavigateFn };

const RouterContext = createContext<RouterState | null>(null);
const ParamsContext = createContext<Record<string, string>>({});

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

export function BrowserRouter({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const value = useMemo<RouterState>(
    () => ({
      path,
      navigate(to, options) {
        const nextPath = normalizePath(to);
        if (options?.replace) {
          window.history.replaceState(null, "", nextPath);
        } else {
          window.history.pushState(null, "", nextPath);
        }
        setPath(window.location.pathname);
      },
    }),
    [path],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function MemoryRouter({
  children,
  initialEntries = ["/"],
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) {
  const [path, setPath] = useState(() => normalizePath(initialEntries[0] ?? "/"));
  const value = useMemo<RouterState>(
    () => ({
      path,
      navigate(to) {
        setPath(normalizePath(to));
      },
    }),
    [path],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useNavigate() {
  return useRouter().navigate;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string>>() {
  return useContext(ParamsContext) as T;
}

export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();

  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
}

export function Link({
  to,
  children,
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const navigate = useNavigate();

  return (
    <a
      {...props}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey ||
          props.target
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function Routes({ children }: { children: React.ReactNode }) {
  const { path } = useRouter();
  const routeElements = React.Children.toArray(children).filter(React.isValidElement);

  for (const child of routeElements) {
    if (child.type !== Route) {
      continue;
    }

    const props = child.props as RouteProps;
    const match = matchPath(props.path, path);
    if (!match) {
      continue;
    }

    return <ParamsContext.Provider value={match}>{props.element}</ParamsContext.Provider>;
  }

  return null;
}

type RouteProps = {
  path: string;
  element: React.ReactElement;
};

export function Route(_props: RouteProps) {
  return null;
}

function useRouter() {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error("Router context is missing");
  }
  return router;
}

function matchPath(pattern: string, path: string) {
  if (pattern === "*") {
    return {};
  }

  const patternParts = normalizePath(pattern).split("/").filter(Boolean);
  const pathParts = normalizePath(path).split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }

    if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}
