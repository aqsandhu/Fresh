import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
  Linking,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { useCityContext } from '@/context/CityContext';
import { useAuthStore, useCartStore, useNotificationStore, useCartUiStore } from '@store';
import { productService } from '@services/product.service';
import { Category, StoreProduct } from '@types';
import { BrandLogo } from '@components/BrandLogo';

interface BannerSettings {
  leftText: string;
  middleText: string;
  rightTextEn: string;
  rightTextUr: string;
}

const DEFAULT_BANNER: BannerSettings = {
  leftText: '0300-1234567',
  middleText: 'Free Delivery 10AM-2PM',
  rightTextEn: 'Fresh Sabzi at Your Doorstep',
  rightTextUr: 'تازہ سبزیاں آپ کے دروازے پر',
};

interface MobileHeaderProps {
  onSearchPress?: () => void;
  showTopBar?: boolean;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  onSearchPress,
  showTopBar = true,
}) => {
  const navigation = useNavigation<any>();
  const { isAuthenticated } = useAuthStore();
  const { getTotalItems } = useCartStore();
  const { unreadCount, loadNotifications } = useNotificationStore();
  const { toggleCartDropdown, setMobileHeaderBottomY } = useCartUiStore();
  const headerWrapRef = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StoreProduct[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [banner, setBanner] = useState<BannerSettings>(DEFAULT_BANNER);
  const [categories, setCategories] = useState<Category[]>([]);
  const { selectedCityId } = useCityContext();

  useEffect(() => {
    if (!selectedCityId) return;
    productService.getBannerSettings().then((res) => {
      if (res.success && res.data) setBanner({ ...DEFAULT_BANNER, ...res.data });
    });
    productService.getCategories().then((res) => {
      if (res.success) setCategories(res.data.slice(0, 8));
    });
  }, [selectedCityId]);

  useEffect(() => {
    if (isAuthenticated) {
      loadNotifications();
    }
  }, [isAuthenticated, loadNotifications]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await productService.searchProducts(searchQuery.trim());
        if (res.success) setSearchResults(res.data.slice(0, 5));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);

  const openFullSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    if (onSearchPress) {
      onSearchPress();
    } else {
      navigation.navigate('Main', {
        screen: 'Home',
        params: { screen: 'Search', params: { query: searchQuery.trim() } },
      });
    }
  }, [navigation, onSearchPress, searchQuery]);

  const cartCount = getTotalItems();

  const closeAndNavigate = (tab: string, screen?: string, params?: object) => {
    setMenuOpen(false);
    navigation.navigate('Main', {
      screen: tab,
      params: screen ? { screen, params } : { screen },
    });
  };

  const goHome = useCallback(() => {
    setMenuOpen(false);
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    navigation.navigate('Main', {
      screen: 'Home',
      params: { screen: 'HomeMain' },
    });
  }, [navigation]);

  const openStaticPage = (pageId: 'terms' | 'privacy' | 'faq' | 'contact' | 'returns' | 'shipping') => {
    setMenuOpen(false);
    navigation.navigate('Main', {
      screen: 'Profile',
      params: { screen: 'StaticPage', params: { pageId } },
    });
  };

  const menuLinks = [
    { label: 'Home', icon: 'home', tab: 'Home', screen: 'HomeMain' },
    { label: 'Shop All Products', icon: 'grid-view', tab: 'Shop', screen: 'ProductsMain' },
    ...categories.map((c) => ({
      label: c.name,
      icon: 'category',
      tab: 'Shop',
      screen: 'CategoryProducts',
      params: { categoryId: c.id, categoryName: c.name },
    })),
    { label: 'Atta Chakki', icon: 'grain', tab: 'Profile', screen: 'AttaChakkiMain' },
    { label: 'My Cart', icon: 'shopping-cart', tab: 'Cart', screen: 'CartMain' },
    { label: 'My Orders', icon: 'receipt-long', tab: 'Orders', screen: 'OrdersList' },
    { label: 'Change City', icon: 'location-city', tab: 'Profile', screen: 'SelectCity' },
    { label: 'About Us', icon: 'info', tab: 'Profile', screen: 'About' },
    { label: 'Contact Us', icon: 'phone', action: 'contact' as const },
    { label: 'Help & FAQ', icon: 'help', action: 'faq' as const },
  ];

  const reportHeaderBottom = useCallback(() => {
    headerWrapRef.current?.measureInWindow((_x, y, _w, height) => {
      if (height > 0) setMobileHeaderBottomY(y + height);
    });
  }, [setMobileHeaderBottomY]);

  useEffect(() => {
    reportHeaderBottom();
  }, [reportHeaderBottom, showTopBar, banner.rightTextUr]);

  return (
    <>
      <View ref={headerWrapRef} onLayout={reportHeaderBottom}>
        {showTopBar && (
          <View style={styles.topBar}>
          <Pressable
            style={styles.topBarPhoneRow}
            onPress={() => Linking.openURL(`tel:${banner.leftText.replace(/\D/g, '')}`)}
            android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
          >
            <MaterialIcons name="phone" size={12} color={COLORS.white} />
            <Text
              style={styles.topBarPhoneText}
              allowFontScaling={false}
              {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
            >
              {banner.leftText}
            </Text>
          </Pressable>
          {banner.rightTextUr ? (
            <Text
              style={styles.topBarUrdu}
              allowFontScaling={false}
              numberOfLines={2}
              {...(Platform.OS === 'android' ? { includeFontPadding: false } : {})}
            >
              {banner.rightTextUr}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.mainHeader}>
        <Pressable
          style={styles.logoRow}
          onPress={goHome}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          <BrandLogo height={46} />
          <View style={styles.logoTextCol}>
            <Text style={styles.logoTitle}>Fresh Bazar</Text>
            <Text style={styles.logoUrdu}>فریش بازار</Text>
          </View>
        </Pressable>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setIsSearchOpen((v) => !v)}
          >
            <MaterialIcons name="search" size={22} color={COLORS.gray600} />
          </TouchableOpacity>
          {isAuthenticated && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => closeAndNavigate('Profile', 'Notifications')}
            >
              <MaterialIcons name="notifications-none" size={22} color={COLORS.gray600} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconBtn} onPress={toggleCartDropdown}>
            <MaterialIcons name="shopping-cart" size={22} color={COLORS.gray600} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setMenuOpen(true)}>
            <MaterialIcons name="menu" size={24} color={COLORS.gray600} />
          </TouchableOpacity>
        </View>
      </View>
      </View>

      {isSearchOpen && (
        <View style={styles.searchPanel}>
          <View style={styles.searchInputRow}>
            <MaterialIcons name="search" size={20} color={COLORS.gray400} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for fresh vegetables, fruits..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={openFullSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialIcons name="close" size={18} color={COLORS.gray400} />
              </TouchableOpacity>
            )}
          </View>
          {isSearching && (
            <ActivityIndicator size="small" color={COLORS.primary600} style={{ marginVertical: 8 }} />
          )}
          {searchQuery.trim().length >= 2 && !isSearching && searchResults.length > 0 && (
            <View style={styles.searchResults}>
              {searchResults.map((product) => (
                <TouchableOpacity
                  key={product.id}
                  style={styles.searchResultRow}
                  onPress={() => {
                    setIsSearchOpen(false);
                    setSearchQuery('');
                    navigation.navigate('Main', {
                      screen: 'Shop',
                      params: { screen: 'ProductDetail', params: { productId: product.id } },
                    });
                  }}
                >
                  {product.images[0] ? (
                    <Image source={{ uri: product.images[0] }} style={styles.searchThumb} />
                  ) : (
                    <View style={[styles.searchThumb, styles.searchThumbFallback]}>
                      <MaterialIcons name="shopping-cart" size={16} color={COLORS.gray300} />
                    </View>
                  )}
                  <View style={styles.searchResultInfo}>
                    <Text style={styles.searchResultName} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text style={styles.searchResultPrice}>{formatCurrency(product.price)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.viewAllResults} onPress={openFullSearch}>
                <Text style={styles.viewAllResultsText}>View all results →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <Modal visible={menuOpen} animationType="slide" transparent>
        <View style={styles.menuOverlay}>
          <View style={styles.menuSheet}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Menu</Text>
              <TouchableOpacity onPress={() => setMenuOpen(false)}>
                <MaterialIcons name="close" size={24} color={COLORS.gray700} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {menuLinks.map((link, i) => (
                <TouchableOpacity
                  key={`${link.label}-${i}`}
                  style={styles.menuItem}
                  onPress={() => {
                    if ('action' in link && link.action === 'contact') {
                      openStaticPage('contact');
                    } else if ('action' in link && link.action === 'faq') {
                      openStaticPage('faq');
                    } else if ('params' in link && link.params) {
                      closeAndNavigate(link.tab, link.screen, link.params);
                    } else {
                      closeAndNavigate(link.tab, link.screen);
                    }
                  }}
                >
                  <MaterialIcons name={link.icon as any} size={22} color={COLORS.primary600} />
                  <Text style={styles.menuItemText}>{link.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  if (isAuthenticated) {
                    closeAndNavigate('Profile', 'ProfileMain');
                  } else {
                    navigation.getParent()?.navigate('Auth', { screen: 'Login' });
                  }
                }}
              >
                <MaterialIcons name="person" size={22} color={COLORS.primary600} />
                <Text style={styles.menuItemText}>
                  {isAuthenticated ? 'My Profile' : 'Login / Register'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: COLORS.primary700,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
  },
  topBarPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  topBarPhoneText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    flexShrink: 0,
  },
  topBarUrdu: {
    color: COLORS.white,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'right',
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  mainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary600,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoLetter: { color: COLORS.white, fontSize: 20, fontWeight: '700' },
  logoTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  logoUrdu: { fontSize: 11, color: COLORS.primary600 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 8, position: 'relative' },
  cartBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.primary600,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  notifBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadgeText: { color: COLORS.white, fontSize: 9, fontWeight: '700' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    maxHeight: '80%',
    paddingBottom: SPACING.xl,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  menuTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray50,
  },
  menuItemText: { fontSize: 15, color: COLORS.gray800, fontWeight: '500' },
  searchPanel: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.gray900 },
  searchResults: { marginTop: SPACING.sm },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray50,
  },
  searchThumb: { width: 40, height: 40, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.gray100 },
  searchThumbFallback: { justifyContent: 'center', alignItems: 'center' },
  searchResultInfo: { flex: 1 },
  searchResultName: { fontSize: 14, fontWeight: '600', color: COLORS.gray900 },
  searchResultPrice: { fontSize: 12, color: COLORS.primary600, marginTop: 2 },
  viewAllResults: { paddingVertical: SPACING.sm, alignItems: 'center' },
  viewAllResultsText: { fontSize: 13, fontWeight: '600', color: COLORS.primary600 },
});

export default MobileHeader;
