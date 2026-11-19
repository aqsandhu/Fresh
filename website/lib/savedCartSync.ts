// ============================================================================
// Keeps this browser's cart and the cart saved with the account in line
// (owner decision Q5 — the rules are in lib/savedCart).
//
// The cart store's own actions stay simple and synchronous; this module
// watches the store instead:
//   - a change made here is sent to the account a moment later (signed in),
//     or marked as a guest cart (signed out);
//   - syncSavedCart() reads the account's cart: a guest cart is joined to it,
//     a change the server never got is sent first, otherwise this browser
//     shows exactly what the account holds.
// ============================================================================
import { cartApi, productsApi } from '@/lib/api'
import { useAuthStore, useCartStore } from '@/store/cartStore'
import { buildItemsFromSaved, groupLinesByCity, mergeCartLines, parseSavedCart } from '@/lib/savedCart'
import type { CartStoreItem, Product } from '@/types'

const PUSH_DELAY_MS = 800

// A change made here while the saved cart is being read must win: each change
// bumps this, and a read that finds it moved is thrown away.
let localChangeSeq = 0
let applyingSaved = false
let busy = false
let rerun = false
let pushTimer: ReturnType<typeof setTimeout> | null = null
let lastPulledAt = 0

const signedIn = () => useAuthStore.getState().isAuthenticated

/** Send the active city's cart to the account. true = the account now holds it. */
export async function pushCart(): Promise<boolean> {
  if (!signedIn()) return false
  const { items, activeCityId } = useCartStore.getState()
  const seq = localChangeSeq
  try {
    if (items.length === 0) await cartApi.clear()
    else {
      await cartApi.sync(
        items.map((i) => ({ product_id: i.product.id, quantity: i.quantity, unit: i.unit || 'full', quality: i.quality || 'A' }))
      )
    }
    // Something changed again while this was on its way: that newer change has
    // its own send scheduled, so the mark stays.
    if (seq === localChangeSeq) useCartStore.setState({ unsaved: null, savedCityId: activeCityId })
    return true
  } catch {
    useCartStore.setState({ unsaved: 'pending' })
    return false
  }
}

// A moment after the last change: a guest cart is joined, anything else sent.
function scheduleSync(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncSavedCart()
  }, PUSH_DELAY_MS)
}

/** Bring this browser and the account's cart into line. */
export async function syncSavedCart(): Promise<void> {
  if (!signedIn() || !useCartStore.getState().hasHydrated) return
  if (busy) {
    rerun = true
    return
  }
  busy = true
  try {
    const started = useCartStore.getState()

    // A change the server never got: this browser wins, send it.
    if (started.unsaved === 'pending') {
      if (pushTimer) clearTimeout(pushTimer)
      pushTimer = null
      await pushCart()
      return
    }

    const seq = localChangeSeq
    let lines
    try {
      lines = parseSavedCart(await cartApi.getSaved())
    } catch {
      return // offline / signed out meanwhile — leave the cart alone
    }
    if (seq !== localChangeSeq) {
      rerun = true
      return
    }

    const merge = started.unsaved === 'guest'
    const nextByCity: Record<string, CartStoreItem[]> = { ...started.cartsByCity }
    if (started.activeCityId) nextByCity[started.activeCityId] = started.items

    // The account's cart is empty (an order was placed, or it was emptied, on
    // another device): the copy this browser holds goes too.
    if (!merge && lines.length === 0 && started.savedCityId) nextByCity[started.savedCityId] = []

    let savedCityId = started.savedCityId
    for (const [cityId, cityLines] of groupLinesByCity(lines, started.activeCityId)) {
      let products: Product[]
      try {
        products = await productsApi.getByIds(cityLines.map((l) => l.productId), cityId)
      } catch {
        return
      }
      const savedItems = buildItemsFromSaved(cityLines, products)
      nextByCity[cityId] = merge ? mergeCartLines(nextByCity[cityId] || [], savedItems) : savedItems
      savedCityId = cityId
    }
    if (seq !== localChangeSeq) {
      rerun = true
      return
    }

    const activeCityId = useCartStore.getState().activeCityId
    applyingSaved = true
    try {
      useCartStore.setState({
        cartsByCity: nextByCity,
        items: activeCityId ? nextByCity[activeCityId] || [] : useCartStore.getState().items,
        savedCityId,
        // The joined cart still has to reach the account: pending until sent.
        unsaved: merge ? 'pending' : null,
      })
    } finally {
      applyingSaved = false
    }
    lastPulledAt = Date.now()
    // After joining a guest cart, the account must hold the result.
    if (merge) await pushCart()
  } finally {
    busy = false
    // Something changed while this ran: go again (join a guest cart that is
    // still waiting, or send the newer change).
    if (rerun) {
      rerun = false
      if (useCartStore.getState().unsaved) void syncSavedCart()
    }
  }
}

/** For "came back to this tab": not more often than every `minGapMs`, unless something is unsaved. */
export function syncSavedCartIfStale(minGapMs = 10_000): void {
  if (!signedIn()) return
  if (!useCartStore.getState().unsaved && Date.now() - lastPulledAt < minGapMs) return
  void syncSavedCart()
}

/**
 * Watch the cart: every change made in this browser is sent to the account
 * (signed in) or marked as a guest cart (signed out). Returns the unsubscribe.
 */
export function watchCartChanges(): () => void {
  return useCartStore.subscribe((state, prev) => {
    if (applyingSaved || state.items === prev.items) return
    // Switching city swaps which cart is shown — nothing was changed, and the
    // account's cart must not be overwritten by it.
    if (state.activeCityId !== prev.activeCityId) return
    localChangeSeq++
    if (signedIn()) {
      // A guest cart stays a guest cart until it has been JOINED to the
      // account's cart — it is never sent over it.
      if (!state.unsaved) useCartStore.setState({ unsaved: 'pending' })
      scheduleSync()
    } else {
      const anyItems = state.items.length > 0 || Object.values(state.cartsByCity).some((c) => c.length > 0)
      const next = anyItems ? 'guest' : null
      if (state.unsaved !== next) useCartStore.setState({ unsaved: next })
    }
  })
}

/** Test helper: forget timers and counters between tests. */
export function resetSavedCartSyncForTests(): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = null
  localChangeSeq = 0
  applyingSaved = false
  busy = false
  rerun = false
  lastPulledAt = 0
}
