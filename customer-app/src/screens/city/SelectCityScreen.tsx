import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { RootStackParamList } from '@app-types';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { useCityContext } from '@/context/CityContext';
import { navigationRef } from '@/navigation/navigationUtils';

export const SelectCityScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { cities, selectedCityId, setCity, isLoading } = useCityContext();
  const [query, setQuery] = useState('');

  const goHome = () => {
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('Main', {
        screen: 'Home',
        params: { screen: 'HomeMain' },
      });
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cities;
    return cities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.province.toLowerCase().includes(q)
    );
  }, [cities, query]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.iconBox}>
          <MaterialIcons name="store" size={32} color={COLORS.white} />
        </View>
        <Text style={styles.title}>Select your city</Text>
        <Text style={styles.subtitle}>
          Choose your delivery city to see products, categories, and offers available near you.
        </Text>
        <Text style={styles.urdu}>اپنی شہر منتخب کریں</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.searchWrap}>
          <MaterialIcons name="search" size={20} color={COLORS.gray400} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search city or province..."
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primary600} />
            <Text style={styles.loadingText}>Loading cities...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No cities found. Try a different search.</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={styles.list}
            renderItem={({ item }) => {
              const active = item.id === selectedCityId;
              return (
                <TouchableOpacity
                  style={[styles.cityRow, active && styles.cityRowActive]}
                  onPress={async () => {
                    await setCity(item);
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                      goHome();
                    } else {
                      navigation.replace('Main', {
                        screen: 'Home',
                        params: { screen: 'HomeMain' },
                      });
                    }
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.pinCircle}>
                    <MaterialIcons name="location-on" size={22} color={COLORS.primary700} />
                  </View>
                  <View>
                    <Text style={styles.cityName}>{item.name}</Text>
                    {item.province ? (
                      <Text style={styles.province}>{item.province}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary50,
    padding: SPACING.md,
  },
  hero: { alignItems: 'center', marginBottom: SPACING.lg, marginTop: SPACING.lg },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary600,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: { fontSize: 28, fontWeight: '700', color: COLORS.gray900, marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, color: COLORS.gray600, textAlign: 'center', paddingHorizontal: SPACING.md },
  urdu: { fontSize: 15, color: COLORS.gray500, marginTop: SPACING.sm },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    padding: SPACING.md,
  },
  searchWrap: { position: 'relative', marginBottom: SPACING.md },
  searchIcon: { position: 'absolute', left: 12, top: 14, zIndex: 1 },
  searchInput: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: 12,
    paddingLeft: 40,
    paddingRight: SPACING.md,
    fontSize: 16,
  },
  list: { maxHeight: '100%' },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  cityRowActive: {
    borderColor: COLORS.primary500,
    backgroundColor: COLORS.primary50,
  },
  pinCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cityName: { fontSize: 17, fontWeight: '600', color: COLORS.gray900 },
  province: { fontSize: 13, color: COLORS.gray500, marginTop: 2 },
  center: { paddingVertical: 48, alignItems: 'center' },
  loadingText: { marginTop: SPACING.sm, color: COLORS.gray500 },
  emptyText: { color: COLORS.gray500, textAlign: 'center' },
});

export default SelectCityScreen;
