// framer-motion's animation engine, loaded AFTER the page is up (LazyMotion in
// AppProviders). Every component uses the light `m.*` elements instead of
// `motion.*`, so the ~100 KB engine is no longer in the JavaScript every page
// must download and run before it responds (live mobile TBT ≈ 3.5 s).
// domAnimation covers what the site uses: animate / exit / variants / hover,
// tap and whileInView. Layout or drag animations would need domMax.
import { domAnimation } from 'framer-motion'

export default domAnimation
