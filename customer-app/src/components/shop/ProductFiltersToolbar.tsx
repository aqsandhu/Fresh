import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';

export type SortOption = 'relevance' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc';

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: 'Relevance',
  'name-asc': 'Name (A-Z)',
  'name-desc': 'Name (Z-A)',
  'price-asc': 'Price (Low to High)',
  'price-desc': 'Price (High to Low)',
};

export const sortMap: Record<Exclude<SortOption, 'relevance'>, { sortBy: string; sortOrder: string }> = {
  'price-asc': { sortBy: 'price', sortOrder: 'asc' },
  'price-desc': { sortBy: 'price', sortOrder: 'desc' },
  'name-asc': { sortBy: 'name', sortOrder: 'asc' },
  'name-desc': { sortBy: 'name', sortOrder: 'desc' },
};

interface ProductFiltersToolbarProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  minPrice: string;
  maxPrice: string;
  inStockOnly: boolean;
  onMinPriceChange: (v: string) => void;
  onMaxPriceChange: (v: string) => void;
  onInStockOnlyChange: (v: boolean) => void;
  onApply: () => void;
  onClear: () => void;
  /** Hide relevance option on non-search screens */
  hideRelevance?: boolean;
}

export const ProductFiltersToolbar: React.FC<ProductFiltersToolbarProps> = ({
  sortBy,
  onSortChange,
  minPrice,
  maxPrice,
  inStockOnly,
  onMinPriceChange,
  onMaxPriceChange,
  onInStockOnlyChange,
  onApply,
  onClear,
  hideRelevance = true,
}) => {
  const [showFilters, setShowFilters] = React.useState(false);
  const [showSort, setShowSort] = React.useState(false);

  return (
    <>
      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setShowFilters(true)}>
          <MaterialIcons name="filter-list" size={18} color={COLORS.gray700} />
          <Text style={styles.filterBtnText}>Filters</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sortBtn} onPress={() => setShowSort(true)}>
          <Text style={styles.sortLabel}>Sort:</Text>
          <Text style={styles.sortValue}>{SORT_LABELS[sortBy]}</Text>
          <MaterialIcons name="expand-more" size={18} color={COLORS.gray600} />
        </TouchableOpacity>
      </View>

      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Filters</Text>
            <Text style={styles.fieldLabel}>Price Range</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInput}
                placeholder="Min"
                keyboardType="numeric"
                value={minPrice}
                onChangeText={onMinPriceChange}
              />
              <Text style={styles.dash}>-</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="Max"
                keyboardType="numeric"
                value={maxPrice}
                onChangeText={onMaxPriceChange}
              />
            </View>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => onInStockOnlyChange(!inStockOnly)}
            >
              <MaterialIcons
                name={inStockOnly ? 'check-box' : 'check-box-outline-blank'}
                size={22}
                color={COLORS.primary600}
              />
              <Text style={styles.checkLabel}>In Stock Only</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  onClear();
                  setShowFilters(false);
                }}
              >
                <Text style={styles.clearText}>Clear All Filters</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => {
                  setShowFilters(false);
                  onApply();
                }}
              >
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setShowFilters(false)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showSort} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSort(false)}
        >
          <View style={styles.sortSheet}>
            {(Object.keys(SORT_LABELS) as SortOption[])
              .filter((key) => !(hideRelevance && key === 'relevance'))
              .map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.sortOption, sortBy === key && styles.sortOptionActive]}
                onPress={() => {
                  onSortChange(key);
                  setShowSort(false);
                  onApply();
                }}
              >
                <Text style={[styles.sortOptionText, sortBy === key && styles.sortOptionTextActive]}>
                  {SORT_LABELS[key]}
                </Text>
                {sortBy === key && (
                  <MaterialIcons name="check" size={20} color={COLORS.primary600} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  filterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  filterBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.gray700 },
  sortBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  sortLabel: { fontSize: 12, color: COLORS.gray500, marginRight: 4 },
  sortValue: { flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.gray800 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray900, marginBottom: SPACING.lg },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gray700, marginBottom: SPACING.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 16,
  },
  dash: { color: COLORS.gray400 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
  checkLabel: { fontSize: 15, color: COLORS.gray800 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  clearText: { fontSize: 14, color: COLORS.primary600, fontWeight: '600' },
  applyBtn: {
    backgroundColor: COLORS.primary600,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  applyBtnText: { color: COLORS.white, fontWeight: '700' },
  closeBtn: { alignItems: 'center', paddingVertical: SPACING.sm },
  closeBtnText: { color: COLORS.gray500 },
  sortSheet: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginBottom: '40%',
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  sortOptionActive: { backgroundColor: COLORS.primary50 },
  sortOptionText: { fontSize: 15, color: COLORS.gray800 },
  sortOptionTextActive: { color: COLORS.primary700, fontWeight: '600' },
});

export default ProductFiltersToolbar;
