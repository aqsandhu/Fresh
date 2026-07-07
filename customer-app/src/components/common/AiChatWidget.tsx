import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { aiChatService, type ChatMessage } from '@services/aiChat.service';
import { navigationRef } from '@/navigation/navigationUtils';
import { useAuthStore } from '@store';
import { useAiChatUi } from '@store/drawerUi';

/** Best-effort current screen name for page-aware answers. */
function currentPage(): string | undefined {
  try {
    const ref = navigationRef as any;
    return ref.isReady() ? ref.getCurrentRoute()?.name : undefined;
  } catch {
    return undefined;
  }
}

/** Full name for a personal greeting — empty when not signed in. */
function customerName(u: { fullName?: string; full_name?: string; name?: string } | null): string {
  return (u?.fullName || u?.full_name || u?.name || '').trim();
}

/** Warm, human-sounding opening line (personalised when we know the name). */
function welcomeText(name: string): string {
  const salam = name ? `Assalam-o-Alaikum ${name}!` : 'Assalam-o-Alaikum!';
  return `${salam} FreshBazar mein khush-aamdeed. Agar aap ko FreshBazar istemal karne mein kisi bhi qisam ki rahnumai chahiye to mujhe batayein — main aap ki kis silsile mein madad karun?`;
}

const TOKEN_RE = /\[([^\]]+)\]\(([^)]+)\)|(\/product\/[A-Za-z0-9_-]+)|(https?:\/\/[^\s)]+)/g;

/** Strip stray markdown so no "stars"/symbols leak into the chat. */
function cleanText(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-•]\s+/gm, '• ');
}

function productPathFromUrl(url: string): string | null {
  if (url.startsWith('/product/')) return url.split(/[?#]/)[0];
  try {
    const u = new URL(url);
    return u.pathname.startsWith('/product/') ? u.pathname : null;
  } catch {
    return null;
  }
}

// FreshBazar page links the assistant may share (the prompt's ALLOWED PAGES list)
// mapped to in-app navigation, so page links work in the app like on the web.
type PageTarget =
  | { root: 'Main'; tab: string; screen?: string }
  | { root: 'CartFlow'; screen: string };

const PAGE_ROUTES: Record<string, PageTarget> = {
  '/products': { root: 'Main', tab: 'Shop', screen: 'ProductsMain' },
  '/search': { root: 'Main', tab: 'Shop', screen: 'Search' },
  '/cart': { root: 'Main', tab: 'Cart' },
  // Checkout opens from the Cart tab (its Checkout button) — safer than jumping
  // straight into the checkout flow with a possibly-empty cart.
  '/checkout': { root: 'Main', tab: 'Cart' },
  '/orders': { root: 'Main', tab: 'Orders', screen: 'OrdersList' },
  '/profile': { root: 'Main', tab: 'Profile', screen: 'ProfileMain' },
  '/addresses': { root: 'Main', tab: 'Profile', screen: 'MyAddresses' },
  '/wishlist': { root: 'Main', tab: 'Profile', screen: 'Wishlist' },
  '/settings': { root: 'Main', tab: 'Profile', screen: 'Settings' },
  '/support': { root: 'Main', tab: 'Profile', screen: 'Support' },
  '/work-as-rider': { root: 'Main', tab: 'Profile', screen: 'WorkAsRider' },
  '/franchise': { root: 'Main', tab: 'Profile', screen: 'Franchise' },
  '/restaurant/register': { root: 'Main', tab: 'Profile', screen: 'RestaurantRegister' },
  '/restaurant/login': { root: 'Main', tab: 'Profile', screen: 'RestaurantLogin' },
  '/atta-chakki': { root: 'Main', tab: 'Profile', screen: 'AttaChakkiMain' },
};

/** Navigate to a shared FreshBazar page path; returns false if it isn't a known page. */
function navigateToPagePath(url: string): boolean {
  const path = url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  const target = PAGE_ROUTES[path];
  if (!target || !navigationRef.isReady()) return false;
  if (target.root === 'CartFlow') {
    (navigationRef as any).navigate('CartFlow', { screen: target.screen });
  } else if (target.screen) {
    (navigationRef as any).navigate('Main', { screen: target.tab, params: { screen: target.screen } });
  } else {
    (navigationRef as any).navigate('Main', { screen: target.tab });
  }
  return true;
}

/** Render assistant links as tappable labels (no raw product URLs). */
function renderRich(text: string, onOpenLink: (url: string) => void): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(cleanText(text.slice(last, m.index)));
    const label = m[1] || (m[3] ? 'View product' : m[4] || '');
    const url = m[2] || m[3] || m[4] || '';
    const isProduct = Boolean(productPathFromUrl(url));
    const displayLabel = isProduct && (/^https?:\/\//i.test(label) || label === url) ? 'View product' : label;
    nodes.push(
      <Text key={i} style={styles.linkText} onPress={() => onOpenLink(url)}>
        {isProduct ? <MaterialIcons name="shopping-cart" size={13} color={COLORS.primary600} /> : null}
        {isProduct ? ' ' : ''}
        {cleanText(displayLabel).trim()}
      </Text>
    );
    last = TOKEN_RE.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(cleanText(text.slice(last)));
  return nodes;
}

export const AiChatWidget: React.FC = () => {
  const open = useAiChatUi((s) => s.open);
  const setOpen = useAiChatUi((s) => s.setOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [welcoming, setWelcoming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: status } = useQuery({
    queryKey: ['ai-chat-status'],
    queryFn: aiChatService.getStatus,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (open) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, open, sending, welcoming]);

  // When the panel first opens, wait ~2s (showing a typing bubble) and then
  // greet the customer by name if signed in — feels like a real person replying.
  useEffect(() => {
    if (!open || messages.length > 0) return;
    setWelcoming(true);
    const t = setTimeout(() => {
      setWelcoming(false);
      const name = isAuthenticated ? customerName(user) : '';
      setMessages((m) => (m.length === 0 ? [{ role: 'assistant', content: welcomeText(name) }] : m));
    }, 2000);
    return () => {
      clearTimeout(t);
      setWelcoming(false);
    };
    // Only re-run when the panel opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!status?.enabled) return null;

  const openLink = (url: string) => {
    if (!url) return;
    const productPath = productPathFromUrl(url);
    if (productPath) {
      let productId = '';
      try {
        productId = decodeURIComponent(productPath.split('/product/')[1] || '');
      } catch {
        productId = '';
      }
      if (!productId) return;
      setOpen(false);
      setTimeout(() => {
        if (!navigationRef.isReady()) return;
        (navigationRef as any).navigate('Main', {
          screen: 'Shop',
          params: { screen: 'ProductDetail', params: { productId } },
        });
      }, 0);
      return;
    }
    // Internal FreshBazar page link (e.g. /orders, /work-as-rider) → navigate in-app.
    if (url.startsWith('/')) {
      if (PAGE_ROUTES[url.split(/[?#]/)[0].replace(/\/+$/, '')]) {
        setOpen(false);
        setTimeout(() => navigateToPagePath(url), 0);
      }
      return;
    }
    if (/^https?:\/\//i.test(url)) {
      Linking.openURL(url).catch(() => {});
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const { reply } = await aiChatService.sendMessage(next.slice(-8), currentPage());
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Maazrat, abhi jawab nahi de paya. Bara karam thori der baad dobara message kar dijiye ga.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <MaterialIcons name="support-agent" size={20} color={COLORS.white} />
                <Text style={styles.headerText}>FreshBazar Support</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ padding: SPACING.md }}>
              {messages.map((m, i) => (
                <View
                  key={i}
                  style={[styles.bubbleRow, m.role === 'user' ? styles.rowEnd : styles.rowStart]}
                >
                  <View style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}>
                    <Text style={m.role === 'user' ? styles.userText : styles.botText}>
                      {m.role === 'assistant' ? renderRich(m.content, openLink) : m.content}
                    </Text>
                  </View>
                </View>
              ))}
              {(sending || welcoming) && (
                <View style={[styles.bubbleRow, styles.rowStart]}>
                  <View style={[styles.bubble, styles.botBubble]}>
                    <ActivityIndicator size="small" color={COLORS.primary600} />
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Type your message…"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={send}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
                onPress={send}
                disabled={!input.trim() || sending}
              >
                <MaterialIcons name="send" size={20} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary600,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    zIndex: 50,
  },
  // Website mobile chat: a floating rounded card (inset-x-3 bottom-3 top-16),
  // appearing in place — not a full-width bottom sheet sliding up.
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 12,
    paddingTop: 64,
  },
  sheet: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.primary600,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
  messages: { flex: 1, backgroundColor: COLORS.gray50 },
  bubbleRow: { marginBottom: SPACING.sm, flexDirection: 'row' },
  rowEnd: { justifyContent: 'flex-end' },
  rowStart: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.lg },
  userBubble: { backgroundColor: COLORS.primary600, borderBottomRightRadius: 4 },
  botBubble: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray100, borderBottomLeftRadius: 4 },
  userText: { color: COLORS.white, fontSize: 14 },
  botText: { color: COLORS.gray800, fontSize: 14, lineHeight: 20 },
  linkText: { color: COLORS.primary600, fontWeight: '700' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 14,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
});

export default AiChatWidget;
