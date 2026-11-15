// React Router v7 behaviours, switched on now (the official upgrade path):
//  - v7_startTransition: route changes are wrapped in React.startTransition,
//    so a lazily loaded page keeps the current screen until it is ready.
//  - v7_relativeSplatPath: relative links inside "*" routes resolve the v7 way.
//    Our only "*" route redirects to an absolute path, so nothing changes.
// The same flags are used by the app and by every test router, so tests see
// the routing the admin sees (and no deprecation notices).
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
