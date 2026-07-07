import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@utils/constants';
import { useRightDrawer, useAiChatUi, useInstructionsPopup } from '@store/drawerUi';
import { useCityContext, useOptionalCityName } from '@/context/CityContext';
import { productService } from '@services/product.service';
import { aiChatService } from '@services/aiChat.service';
import { navigationRef } from '@/navigation/navigationUtils';
import { buildWhatsAppUrl, openWhatsAppOrder } from '@/lib/whatsapp';
import { useActiveRouteName } from '@/lib/activeRoute';
import { EdgeDrawer } from './EdgeDrawer';

const HIDE_ON = new Set(['SelectCity', 'CartMain', 'Checkout', 'AddAddress', 'ChangePin', 'SetPin']);
const CITY_HIDE_ON = new Set(['CartMain', 'Checkout']);

interface RailEntry {
  key: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  colors: [string, string];
  label: string;
  sub?: string;
  onPress: () => void;
}

export const UtilityDrawer: React.FC = () => {
  const open = useRightDrawer((s) => s.open);
  const peek = useRightDrawer((s) => s.peek);
  const setOpen = useRightDrawer((s) => s.setOpen);
  const setChatOpen = useAiChatUi((s) => s.setOpen);
  const setTipsOpen = useInstructionsPopup((s) => s.setOpen);
  const { selectedCityId } = useCityContext();
  const cityName = useOptionalCityName();
  const route = useActiveRouteName();

  const { data: chatStatus } = useQuery({
    queryKey: ['ai-chat-status'],
    queryFn: aiChatService.getStatus,
    staleTime: 5 * 60 * 1000,
  });

  const { data: waTarget } = useQuery({
    queryKey: ['wa-order-target', selectedCityId],
    queryFn: async () => {
      const [wa, banner] = await Promise.all([
        productService.getWhatsAppOrderUrl().catch(() => ({ success: false, data: { url: '' } })),
        productService.getBannerSettings().catch(() => ({ success: false, data: null as any })),
      ]);
      const url = (wa as any)?.data?.url?.trim?.() || '';
      const phone = (banner as any)?.data?.leftText?.trim?.() || '';
      return url || phone;
    },
    enabled: !!selectedCityId,
    staleTime: 5 * 60 * 1000,
  });

  const hidden = !selectedCityId || HIDE_ON.has(route) || String(route).startsWith('Restaurant');

  const goProfile = (screen: string) => {
    setOpen(false);
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('Main', { screen: 'Profile', params: { screen } });
    }
  };
  const goShop = () => {
    setOpen(false);
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('Main', { screen: 'Shop', params: { screen: 'ProductsMain' } });
    }
  };

  const showSupport = chatStatus === undefined ? true : !!chatStatus.enabled;
  const showWhatsapp = waTarget === undefined ? true : Boolean(buildWhatsAppUrl(waTarget || ''));

  const entries: RailEntry[] = [
    ...(showSupport
      ? [
          {
            key: 'support',
            icon: 'headset-mic' as const,
            colors: ['#22c55e', '#15803d'] as [string, string],
            label: 'Support',
            onPress: () => {
              // Website parity: drawer close + chat open together; the chat
              // fades in as a card so there's no double slide.
              setOpen(false);
              setChatOpen(true);
            },
          },
        ]
      : []),
    {
      key: 'instructions',
      icon: 'lightbulb',
      colors: ['#fbbf24', '#d97706'],
      label: 'Instructions',
      onPress: () => {
        setOpen(false);
        setTipsOpen(true);
      },
    },
    ...(!CITY_HIDE_ON.has(route) && selectedCityId
      ? [
          {
            key: 'city',
            icon: 'location-on' as const,
            colors: ['#38bdf8', '#0284c7'] as [string, string],
            label: 'City',
            sub: cityName,
            onPress: () => goProfile('SelectCity'),
          },
        ]
      : []),
    {
      key: 'shop',
      icon: 'shopping-bag',
      colors: ['#16a34a', '#166534'],
      label: 'Shop Now',
      onPress: goShop,
    },
    ...(showWhatsapp
      ? [
          {
            key: 'whatsapp',
            icon: 'chat' as const,
            colors: ['#25D366', '#128C4A'] as [string, string],
            label: 'To Order',
            onPress: () => {
              setOpen(false);
              if (waTarget) openWhatsAppOrder(waTarget);
            },
          },
        ]
      : []),
  ];

  const items: React.ReactNode[] = entries.map((e) => (
    <TouchableOpacity key={e.key} style={styles.item} onPress={e.onPress} activeOpacity={0.85}>
      <LinearGradient colors={e.colors} style={styles.chip}>
        <MaterialIcons name={e.icon} size={22} color={COLORS.white} />
      </LinearGradient>
      <Text style={styles.itemLabel} numberOfLines={1}>
        {e.label}
      </Text>
      {e.sub ? (
        <Text style={styles.itemSub} numberOfLines={1}>
          {e.sub}
        </Text>
      ) : null}
    </TouchableOpacity>
  ));

  return (
    <EdgeDrawer
      side="right"
      open={open}
      peek={peek}
      setOpen={setOpen}
      hidden={hidden}
      accessibilityLabel="Open quick help"
      items={items}
    />
  );
};

const styles = StyleSheet.create({
  item: { alignItems: 'center', gap: 4, width: 96 },
  chip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    elevation: 4,
  },
  itemLabel: {
    maxWidth: 96,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  itemSub: {
    maxWidth: 96,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default UtilityDrawer;
