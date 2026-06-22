import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { formatCurrency } from '@utils/helpers';
import { productService } from '@services/product.service';
import { useCartStore } from '@store';
import type { ProductUnit, ProductQuality } from '@app-types';

interface BasketPublic {
  id: string;
  name: string;
  description: string | null;
  total_price: number;
  image_url: string | null;
  items: Array<{
    product_id: string;
    name: string;
    image: string | null;
    quality: string;
    quantity: number;
    unit: string;
  }>;
}

const ALLOWED_UNITS: ProductUnit[] = ['full', 'half_kg', 'quarter_kg', 'half_dozen'];
const normalizeUnit = (u: string): ProductUnit =>
  (ALLOWED_UNITS as string[]).includes(u) ? (u as ProductUnit) : 'full';
const normalizeQuality = (q: string): ProductQuality =>
  (['A', 'B', 'C'] as string[]).includes(q) ? (q as ProductQuality) : 'A';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const TodaysBasketModal: React.FC<Props> = ({ visible, onClose }) => {
  const [baskets, setBaskets] = useState<BasketPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    productService
      .getBaskets()
      .then((res) => setBaskets(res.success ? (res.data as BasketPublic[]) : []))
      .finally(() => setLoading(false));
  }, [visible]);

  const addBasket = async (basket: BasketPublic) => {
    setAddingId(basket.id);
    try {
      let added = 0;
      for (const item of basket.items) {
        try {
          const res = await productService.getProductById(item.product_id);
          if (res.success && res.data) {
            await addItem(
              res.data,
              item.quantity,
              normalizeUnit(item.unit),
              normalizeQuality(item.quality)
            );
            added += 1;
          }
        } catch {
          // skip unavailable product
        }
      }
      if (added > 0) onClose();
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <MaterialIcons name="shopping-basket" size={22} color={COLORS.primary600} />
              <Text style={styles.title}>Today's Basket</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={COLORS.gray700} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={COLORS.primary600} />
            </View>
          ) : baskets.length === 0 ? (
            <Text style={styles.empty}>No baskets available right now.</Text>
          ) : (
            <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
              {baskets.map((basket) => (
                <View key={basket.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    {basket.image_url ? (
                      <Image source={{ uri: basket.image_url }} style={styles.thumb} />
                    ) : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{basket.name}</Text>
                      {!!basket.description && (
                        <Text style={styles.cardDesc} numberOfLines={2}>
                          {basket.description}
                        </Text>
                      )}
                      <Text style={styles.cardPrice}>{formatCurrency(basket.total_price)}</Text>
                    </View>
                  </View>
                  {basket.items.map((it) => (
                    <View key={it.product_id + it.quality} style={styles.itemRow}>
                      <Text style={styles.itemName}>
                        {it.name} ×{it.quantity}
                      </Text>
                      <Text style={styles.itemMeta}>Quality {it.quality}</Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addBtn}
                    onPress={() => addBasket(basket)}
                    disabled={addingId === basket.id}
                  >
                    {addingId === basket.id ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <>
                        <MaterialIcons name="add" size={18} color={COLORS.white} />
                        <Text style={styles.addBtnText}>Add basket to cart</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={styles.note}>Items are added to your cart at live prices.</Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.gray900 },
  center: { padding: SPACING.xl, alignItems: 'center' },
  empty: { padding: SPACING.xl, textAlign: 'center', color: COLORS.gray500 },
  card: {
    borderWidth: 1,
    borderColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTop: { flexDirection: 'row', gap: SPACING.md },
  thumb: { width: 56, height: 56, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.gray100 },
  cardName: { fontSize: 16, fontWeight: '700', color: COLORS.gray900 },
  cardDesc: { fontSize: 13, color: COLORS.gray500, marginTop: 2 },
  cardPrice: { fontSize: 16, fontWeight: '800', color: COLORS.primary700, marginTop: 4 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  itemName: { fontSize: 13, color: COLORS.gray700, flex: 1 },
  itemMeta: { fontSize: 12, color: COLORS.gray400 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
  },
  addBtnText: { color: COLORS.white, fontWeight: '700' },
  note: { textAlign: 'center', fontSize: 12, color: COLORS.gray400, marginTop: SPACING.sm },
});

export default TodaysBasketModal;
