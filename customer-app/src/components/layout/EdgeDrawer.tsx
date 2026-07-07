import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Animated,
  PanResponder,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@utils/constants';

const RAIL_W = 104;
/** Vertical distance between item centres in the rail (48 chip + labels + gap). */
const ITEM_PITCH = 92;
const ENTER_MS = 350;
const ENTER_STAGGER = 35;
const EXIT_MS = 600;
const EXIT_STAGGER = 50;
/** Backdrop holds its dim until the icons have merged into the handle. */
const BACKDROP_EXIT_DELAY = 550;

interface EdgeDrawerProps {
  side: 'left' | 'right';
  open: boolean;
  setOpen: (open: boolean) => void;
  hidden?: boolean;
  /** Welcome auto-peek: rails slide in with NO dark backdrop (page stays visible). */
  peek?: boolean;
  accessibilityLabel: string;
  /** Rail entries — one per icon chip (NOT wrapped in a fragment). */
  items: React.ReactNode[];
}

/**
 * Shared edge rail shell — mirrors the website's railAnimation language:
 * OPEN: each icon slides in a touch from its own edge with a soft stagger.
 * CLOSE: every icon flies INTO the arrow handle's centre (toward the edge,
 * converging vertically on the screen middle), staying visible for ~85% of
 * the flight; the arrow re-appears early to "receive" them and the backdrop
 * holds its dim until the merge finishes.
 */
export const EdgeDrawer: React.FC<EdgeDrawerProps> = ({
  side,
  open,
  setOpen,
  hidden,
  peek = false,
  accessibilityLabel,
  items,
}) => {
  const sign = side === 'left' ? -1 : 1;
  const count = items.length;

  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const backdrop = useRef(new Animated.Value(0)).current;
  const handleOp = useRef(new Animated.Value(1)).current;
  const enterVals = useRef<Animated.Value[]>([]);
  const exitVals = useRef<Animated.Value[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazily size the per-item value arrays (idempotent across renders).
  if (enterVals.current.length !== count) {
    enterVals.current = Array.from(
      { length: count },
      (_, i) => enterVals.current[i] ?? new Animated.Value(0)
    );
    exitVals.current = Array.from(
      { length: count },
      (_, i) => exitVals.current[i] ?? new Animated.Value(0)
    );
  }

  useEffect(() => {
    if (open) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      setMounted(true);
      setClosing(false);
      exitVals.current.forEach((v) => v.setValue(0));
      enterVals.current.forEach((v) => v.setValue(0));
      // peek slides the rails in with NO dim (transparent) so both edges can
      // peek at once over the visible page; a manual open dims to 0.45.
      Animated.timing(backdrop, {
        toValue: peek ? 0 : 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
      Animated.stagger(
        ENTER_STAGGER,
        enterVals.current.map((v) =>
          Animated.timing(v, { toValue: 1, duration: ENTER_MS, useNativeDriver: true })
        )
      ).start();
    } else if (mounted) {
      setClosing(true);
      // Icons stream into the arrow, one after another.
      Animated.stagger(
        EXIT_STAGGER,
        exitVals.current.map((v) =>
          Animated.timing(v, { toValue: 1, duration: EXIT_MS, useNativeDriver: true })
        )
      ).start();
      // The arrow shows up early in the close so the icons land on it.
      handleOp.setValue(0);
      Animated.timing(handleOp, {
        toValue: 1,
        duration: 300,
        delay: 150,
        useNativeDriver: true,
      }).start();
      Animated.timing(backdrop, {
        toValue: 0,
        duration: 350,
        delay: BACKDROP_EXIT_DELAY,
        useNativeDriver: true,
      }).start();
      const total = Math.max(EXIT_MS + EXIT_STAGGER * (count - 1), 900) + 60;
      closeTimer.current = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Items can arrive AFTER the drawer opened (e.g. categories finish loading
  // during the welcome peek on a cold start). Animate every item in so the
  // late arrivals slide in too — otherwise they sit invisible at value 0 and
  // the left rail looks like it "didn't open" until you revisit Home.
  useEffect(() => {
    if (!mounted || closing) return;
    Animated.stagger(
      ENTER_STAGGER,
      enterVals.current.map((v) =>
        Animated.timing(v, { toValue: 1, duration: ENTER_MS, useNativeDriver: true })
      )
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        (sign < 0 ? g.dx > 14 : g.dx < -14) && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (sign < 0 ? g.dx > 30 : g.dx < -30) setOpen(true);
      },
    })
  ).current;

  if (hidden) return null;

  const showHandle = !open || closing;
  const mid = (count - 1) / 2;

  return (
    <>
      {!open && !mounted && (
        <View
          style={[styles.edgeStrip, side === 'left' ? styles.edgeLeft : styles.edgeRight]}
          {...pan.panHandlers}
          pointerEvents="box-only"
        />
      )}

      {showHandle && (
        <Animated.View
          style={[
            styles.handleWrap,
            side === 'left' ? styles.handleLeft : styles.handleRight,
            { opacity: closing ? handleOp : 1 },
          ]}
          pointerEvents={closing ? 'none' : 'auto'}
        >
          <TouchableOpacity
            style={[
              styles.handleBtn,
              side === 'left' ? styles.handleBtnLeft : styles.handleBtnRight,
            ]}
            onPress={() => setOpen(true)}
            activeOpacity={0.85}
            accessibilityLabel={accessibilityLabel}
          >
            <LinearGradient colors={['#16a34a', '#15803d']} style={StyleSheet.absoluteFill} />
            <MaterialIcons
              name={side === 'left' ? 'chevron-right' : 'chevron-left'}
              size={24}
              color={COLORS.white}
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      {mounted && (
        <View style={styles.overlay} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.backdrop,
              { opacity: backdrop.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }) },
            ]}
            // During the welcome peek there's no dim and the page stays fully
            // interactive; a manual open captures taps to close.
            pointerEvents={peek || closing ? 'none' : 'auto'}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          </Animated.View>

          <View
            style={[styles.rail, side === 'left' ? styles.railLeft : styles.railRight]}
            pointerEvents="box-none"
          >
            {items.map((node, i) => {
              const e = enterVals.current[i];
              const x = exitVals.current[i];
              const translateX = Animated.add(
                e.interpolate({ inputRange: [0, 1], outputRange: [sign * 28, 0] }),
                x.interpolate({ inputRange: [0, 1], outputRange: [0, sign * 40] })
              );
              const translateY = x.interpolate({
                inputRange: [0, 1],
                outputRange: [0, (mid - i) * ITEM_PITCH],
              });
              const scale = x.interpolate({ inputRange: [0, 1], outputRange: [1, 0.1] });
              const opacity = Animated.multiply(
                e,
                x.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] })
              );
              return (
                <Animated.View
                  key={i}
                  style={{ opacity, transform: [{ translateX }, { translateY }, { scale }] }}
                >
                  {node}
                </Animated.View>
              );
            })}
          </View>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  edgeStrip: { position: 'absolute', top: 90, bottom: 130, width: 20, zIndex: 39 },
  edgeLeft: { left: 0 },
  edgeRight: { right: 0 },
  handleWrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -42,
    zIndex: 40,
    elevation: 31,
  },
  handleBtn: {
    width: 24,
    height: 84,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  handleBtnLeft: { borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  handleBtnRight: { borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
  handleLeft: { left: 0 },
  handleRight: { right: 0 },
  // elevation (not just zIndex) is required on Android so the overlay sits
  // ABOVE the navigator's screen content.
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 80, elevation: 30 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },
  rail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: RAIL_W,
    maxWidth: '30%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  railLeft: { left: 0 },
  railRight: { right: 0 },
});

export default EdgeDrawer;
