import type { CategoryDto, Paginated, ProductDto } from '@topflow/shared';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, InlineError, LoadingState } from '@/components/ui/states';
import { Brand, Radius, TouchTarget } from '@/constants/theme';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { usePaginatedList } from '@/hooks/use-paginated-list';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { pluralize } from '@/lib/format';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
const H_PADDING = 16;
const GRID_GAP = 12;

const productKey = (product: ProductDto) => product.id;
const fetchCategories = () => api<CategoryDto[]>('/catalog/categories');

export default function ShopScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const query = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const categories = useResource(fetchCategories);

  const fetchProducts = useCallback(
    (page: number) =>
      api<Paginated<ProductDto>>('/catalog/products', {
        query: { search: query, category, sort: 'newest', page, pageSize: PAGE_SIZE },
      }),
    [query, category],
  );
  const products = usePaginatedList(fetchProducts, productKey);

  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const itemWidth = Math.floor((width - H_PADDING * 2 - GRID_GAP * (columns - 1)) / columns);
  const filtered = query !== '' || category !== null;

  const handleRefresh = () => {
    void products.refresh();
    if (categories.error) void categories.refresh();
  };

  const clearFilters = () => {
    setSearch('');
    setCategory(null);
  };

  const renderEmpty = () => {
    if (products.loading) return <LoadingState label="Loading products…" />;
    if (!products.loaded && products.error) {
      return (
        <ErrorState
          title="Could not load products"
          message={products.error}
          onRetry={() => void products.refresh()}
          retrying={products.refreshing}
        />
      );
    }
    return filtered ? (
      <EmptyState
        title="No matching products"
        message="Try a different search term or category."
        action={<Button label="Clear filters" variant="secondary" onPress={clearFilters} />}
      />
    ) : (
      <EmptyState title="No products yet" message="Our catalog is being updated. Please check back soon." />
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.brand} accessibilityRole="header">
          TOP <Text style={styles.brandAccent}>FLOW</Text>
        </Text>
        <Text style={styles.tagline}>Irrigation & flow-control supplies · UAE</Text>

        <View style={styles.searchBox}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search pipes, valves, fittings…"
            placeholderTextColor={Brand.placeholder}
            accessibilityLabel="Search products"
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            maxLength={100}
            style={styles.searchInput}
          />
          {search.length > 0 && Platform.OS !== 'ios' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setSearch('')}
              style={styles.clearButton}>
              <Text style={styles.clearText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {categories.data && categories.data.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroller}
          contentContainerStyle={styles.chips}>
          <CategoryChip label="All" selected={category === null} onPress={() => setCategory(null)} />
          {categories.data.map((item) => (
            <CategoryChip
              key={item.id}
              label={item.name}
              selected={category === item.slug}
              onPress={() => setCategory(category === item.slug ? null : item.slug)}
            />
          ))}
        </ScrollView>
      ) : null}

      <FlatList
        key={`grid-${columns}`}
        data={products.items}
        keyExtractor={productKey}
        numColumns={columns}
        renderItem={({ item }) => <ProductCard product={item} style={{ width: itemWidth }} />}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onEndReached={products.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={products.refreshing && products.loaded}
            onRefresh={handleRefresh}
            tintColor={Brand.blue}
            colors={[Brand.blue]}
          />
        }
        ListHeaderComponent={
          products.loaded ? (
            <View style={styles.listHeader}>
              {products.error ? <InlineError message={products.error} /> : null}
              {products.items.length > 0 ? (
                <Text style={styles.resultCount}>{pluralize(products.total, 'product')}</Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={
          products.loadingMore ? (
            <ActivityIndicator style={styles.footerSpinner} color={Brand.blue} />
          ) : products.hasMore && products.error ? (
            <Button label="Load more products" variant="secondary" onPress={products.loadMore} />
          ) : null
        }
      />
    </View>
  );
}

function CategoryChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} category`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && styles.chipPressed]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.canvas,
  },
  header: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 2,
  },
  brand: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: Brand.navy,
  },
  brandAccent: {
    color: Brand.blue,
  },
  tagline: {
    fontSize: 13,
    color: Brand.textMuted,
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Brand.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Brand.border,
  },
  searchInput: {
    flex: 1,
    minHeight: TouchTarget + 4,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Brand.text,
  },
  clearButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: {
    fontSize: 16,
    color: Brand.textMuted,
  },
  chipsScroller: {
    flexGrow: 0,
  },
  chips: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    gap: 8,
  },
  chip: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.surface,
  },
  chipSelected: {
    backgroundColor: Brand.navy,
    borderColor: Brand.navy,
  },
  chipPressed: {
    backgroundColor: Brand.blueTint,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: Brand.navy,
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
    paddingBottom: 24,
    gap: GRID_GAP,
  },
  gridRow: {
    gap: GRID_GAP,
  },
  listHeader: {
    gap: 8,
  },
  resultCount: {
    fontSize: 13,
    color: Brand.textMuted,
  },
  footerSpinner: {
    paddingVertical: 16,
  },
});
