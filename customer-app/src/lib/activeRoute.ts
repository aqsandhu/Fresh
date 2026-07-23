import { useNavigationState } from '@react-navigation/native';

/**
 * The deepest active route name across nested navigators.
 *
 * Two traps handled here:
 * 1. A shallow `state.routes[index]` only reaches the active TAB ("Home"),
 *    never the screen inside it ("HomeMain") — so we walk the whole tree.
 * 2. On the very FIRST render after app launch, nested navigators haven't
 *    reported their state yet (`route.state === undefined`), so the walk stops
 *    at a navigator name ("Main" / "Home"). Route-gated chrome (auto-peek,
 *    instructions) would then never fire on load. We resolve those navigator
 *    names to their initial screen so load-time behaviour works.
 */
const INITIAL_SCREEN: Record<string, string> = {
  Main: 'Home', // root stack → tab navigator (initial tab: Home)
  Home: 'HomeMain',
  Shop: 'ProductsMain',
  Cart: 'CartMain',
  Orders: 'OrdersList',
  Profile: 'ProfileMain',
  CartFlow: 'Checkout',
};

function deepestRouteName(state: any): string {
  let s = state;
  let name = '';
  while (s && Array.isArray(s.routes) && s.routes.length > 0) {
    const r = s.routes[s.index ?? 0];
    if (!r) break;
    name = r.name ?? name;
    s = r.state;
  }
  // Nested state not populated yet — resolve navigator → its initial screen.
  let guard = 0;
  while (INITIAL_SCREEN[name] && guard < 5) {
    name = INITIAL_SCREEN[name];
    guard += 1;
  }
  return name;
}

export function useActiveRouteName(): string {
  return useNavigationState((state) => deepestRouteName(state));
}
