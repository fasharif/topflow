import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Pressable,
} from "react-native";

interface Product {
  id: string;
  sku: string;
  name: string;
  unitPrice: string;
  stockStatus: "IN_STOCK" | "ON_ORDER";
  category: { id: number; name: string; slug: string } | null;
}

export default function CatalogScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = `${process.env.EXPO_PUBLIC_API_URL}/products`;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then(setProducts)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#0284C7" />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Failed to load catalog</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>TOP FLOW</Text>
        <Text style={styles.headerSubtitle}>Irrigation & Flow-Control Supplies · UAE</Text>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>No products yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.sku}>{item.sku}</Text>
              <View
                style={[
                  styles.badge,
                  item.stockStatus === "IN_STOCK" ? styles.badgeInStock : styles.badgeOnOrder,
                ]}
              >
                <Text
                  style={
                    item.stockStatus === "IN_STOCK" ? styles.badgeTextInStock : styles.badgeTextOnOrder
                  }
                >
                  {item.stockStatus === "IN_STOCK" ? "In Stock" : "On Order"}
                </Text>
              </View>
            </View>

            <Text style={styles.name}>{item.name}</Text>
            {item.category && <Text style={styles.category}>{item.category.name}</Text>}

            <View style={styles.cardBottomRow}>
              <Text style={styles.price}>AED {Number(item.unitPrice).toFixed(2)}</Text>
              <Pressable style={styles.addButton}>
                <Text style={styles.addButtonText}>Add to Enquiry</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC" },
  header: { backgroundColor: "#0A192F", paddingHorizontal: 20, paddingVertical: 18 },
  headerTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "bold" },
  headerSubtitle: { color: "#CBD5E1", fontSize: 12, marginTop: 2 },
  list: { padding: 16, gap: 12 },
  emptyText: { textAlign: "center", color: "#64748B", marginTop: 40 },
  errorText: { fontSize: 16, fontWeight: "600", color: "#DC2626" },
  errorDetail: { fontSize: 12, color: "#64748B", marginTop: 4, paddingHorizontal: 24, textAlign: "center" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
  },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sku: { fontFamily: "monospace", fontSize: 11, color: "#94A3B8" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeInStock: { backgroundColor: "#D1FAE5" },
  badgeOnOrder: { backgroundColor: "rgba(217,119,6,0.1)" },
  badgeTextInStock: { color: "#047857", fontSize: 11, fontWeight: "500" },
  badgeTextOnOrder: { color: "#D97706", fontSize: 11, fontWeight: "500" },
  name: { fontSize: 15, fontWeight: "600", color: "#0A192F", marginBottom: 2 },
  category: { fontSize: 12, color: "#64748B", marginBottom: 12 },
  cardBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  price: { fontSize: 17, fontWeight: "bold", color: "#0A192F" },
  addButton: { backgroundColor: "#0284C7", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
  addButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "500" },
});