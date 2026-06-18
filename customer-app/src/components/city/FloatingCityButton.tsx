import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useTabBarMetrics } from '@/lib/tabBarMetrics';
import { useCityContext, useOptionalCityName } from '@/context/CityContext';

/** Mirrors website FloatingCityButton — FAB above bottom tab bar */
export const FloatingCityButton: React.FC = () => {
  const navigation = useNavigation<any>();
  const activeRoute = useNavigationState((state) => {
    try {
      const tab = state?.routes?.[state.index ?? 0];
      const nested = tab?.state;
      if (nested?.routes?.length) {
        return nested.routes[nested.index ?? 0]?.name ?? tab.name;
      }
      return tab?.name ?? '';
    } catch {
      return '';
    }
  });
  const { cities, selectedCityId, setCity, isReady } = useCityContext();
  const cityName = useOptionalCityName();
  const { height: tabBarHeight } = useTabBarMetrics();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const hideOnScreens = [
    'SelectCity',
    'Cart',
    'CartMain',
    'Checkout',
    'AddAddress',
    'ChangePin',
    'SetPin',
  ];
  // A restaurant is bound to ONE city — never offer city switching anywhere in
  // the restaurant storefront (all its screens are named "Restaurant…").
  const shouldHide =
    !isReady ||
    !selectedCityId ||
    hideOnScreens.includes(activeRoute) ||
    activeRoute.startsWith('Restaurant');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.province || '').toLowerCase().includes(q)
    );
  }, [cities, query]);

  if (shouldHide) {
    return null;
  }

  const handleSelect = async (city: { id: string; name: string; province?: string }) => {
    await setCity(city as any);
    setOpen(false);
    setQuery('');
    navigation.navigate('Main', { screen: 'Home', params: { screen: 'HomeMain' } });
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.fab, { bottom: tabBarHeight + 12 }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.9}
      >
        <MaterialIcons name="location-on" size={18} color={COLORS.white} />
        <Text style={styles.fabText} numberOfLines={1}>
          {cityName}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Change city</Text>
                <Text style={styles.sheetSub}>Cart is saved separately for each city</Text>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.gray600} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
              <MaterialIcons name="search" size={20} color={COLORS.gray400} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search city..."
                value={query}
                onChangeText={setQuery}
              />
            </View>
            <ScrollView style={styles.list}>
              {filtered.map((city) => {
                const active = city.id === selectedCityId;
                return (
                  <TouchableOpacity
                    key={city.id}
                    style={[styles.cityRow, active && styles.cityRowActive]}
                    onPress={() => handleSelect(city)}
                  >
                    <Text style={styles.cityName}>{city.name}</Text>
                    {city.province ? (
                      <Text style={styles.cityProvince}>{city.province}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.manageBtn}
              onPress={() => {
                setOpen(false);
                navigation.navigate('Main', { screen: 'Profile', params: { screen: 'SelectCity' } });
              }}
            >
              <Text style={styles.manageBtnText}>Browse all cities</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.primary600,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderRadius: BORDER_RADIUS.full,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    maxWidth: 160,
    zIndex: 40,
  },
  fabText: { color: COLORS.white, fontSize: 13, fontWeight: '600', maxWidth: 100 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    maxHeight: '70%',
    paddingBottom: SPACING.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  sheetSub: { fontSize: 13, color: COLORS.gray500, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15 },
  list: { paddingHorizontal: SPACING.md, maxHeight: 320 },
  cityRow: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cityRowActive: { borderColor: COLORS.primary500, backgroundColor: COLORS.primary50 },
  cityName: { fontSize: 15, fontWeight: '600', color: COLORS.gray900 },
  cityProvince: { fontSize: 13, color: COLORS.gray500, marginTop: 2 },
  manageBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  manageBtnText: { color: COLORS.primary600, fontWeight: '600' },
});

export default FloatingCityButton;
