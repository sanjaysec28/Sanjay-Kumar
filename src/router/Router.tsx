import React, { createContext, useContext, useEffect, useState, useTransition } from 'react';

export type AdminRoute =
  | '/admin/login'
  | '/admin'
  | '/admin/analytics'
  | '/admin/bookings'
  | '/admin/customers'
  | '/admin/services'
  | '/admin/offers'
  | '/admin/gallery'
  | '/admin/homepage'
  | '/admin/staff'
  | '/admin/settings'
  | '/admin/unauthorized'
  | '/gallery'
  | '/lookbook';

interface RouterContextType {
  currentPath: string;
  navigate: (to: string, replace?: boolean) => void;
  isPending: boolean;
}

const RouterContext = createContext<RouterContextType>({
  currentPath: '/admin',
  navigate: () => {},
  isPending: false,
});

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    const path = window.location.pathname;
    if (path === '' || path === '/') return '/admin';
    return path;
  });

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const handlePopState = () => {
      startTransition(() => {
        const path = window.location.pathname;
        setCurrentPath(path === '' || path === '/' ? '/admin' : path);
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (to: string, replace = false) => {
    startTransition(() => {
      if (replace) {
        window.history.replaceState({}, '', to);
      } else {
        window.history.pushState({}, '', to);
      }
      setCurrentPath(to);
    });
  };

  return (
    <RouterContext.Provider value={{ currentPath, navigate, isPending }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => useContext(RouterContext);

export const Link: React.FC<
  React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }
> = ({ to, children, className, onClick, ...props }) => {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) onClick(e);
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      navigate(to);
    }
  };

  return (
    <a href={to} onClick={handleClick} className={className} {...props}>
      {children}
    </a>
  );
};
