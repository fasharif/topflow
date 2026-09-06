import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { useCart } from "@/lib/cart-context";
import { useAuth } from "@/lib/auth-context";
import { login } from "@/lib/api";

export default function CartScreen() {
  const { items, updateQuantity, removeItem, totalAmount, clearCart } = useCart();
  const { user, token, setSession, logout, isLoaded } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [shippingAddress, setShippingAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoginError(null);
    setLoggingIn(true);
    try {
      const { user, accessToken } = await login(email, password);
      setSession(user, accessToken);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleSubmit = async () => {
    if (!shippingAddress.trim()) {
      setSubmitError("Shipping address is required");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          shippingAddress,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to submit enquiry");
      }
      const order = await res.json();
      setOrderNumber(order.orderNumber);
      clearCart();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#0284C7" />
      </SafeAreaView>
    );
  }

  if (orderNumber) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.successTitle}>Enquiry submitted</Text>
        <Text style={styles.successRef}>{orderNumber}</Text>
        <Text style={styles.successBody}>Our team will follow up with a formal quotation.</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginBox}>
          <Text style={styles.loginTitle}>Sign in</Text>
          <Text style={styles.loginSubtitle}>Top Flow contractor &amp; customer accounts</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {loginError && <Text style={styles.errorText}>{loginError}</Text>}

          <Pressable style={styles.primaryButton} onPress={handleLogin} disabled={loggingIn}>
            <Text style={styles.primaryButtonText}>{loggingIn ? "Signing in…" : "Sign in"}</Text>
          </Pressable>

          <Text style={styles.hintText}>Testing? janedoe@topflow.com</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Enquiry Cart</Text>
        <Pressable onPress={logout}>
          <Text style={styles.signOut}>Sign out ({user.fullName})</Text>
        </Pressable>
      </View>

      {items.length === 0 ? (
        <Text style={styles.emptyText}>Your enquiry cart is empty.</Text>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => item.productId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartSku}>{item.sku}</Text>
                  <Text style={styles.cartName}>{item.name}</Text>
                </View>
                <TextInput
                  style={styles.qtyInput}
                  keyboardType="numeric"
                  value={String(item.quantity)}
                  onChangeText={(val) => updateQuantity(item.productId, Number(val) || 0)}
                />
                <Text style={styles.cartTotal}>
                  AED {(item.unitPrice * item.quantity).toFixed(2)}
                </Text>
                <Pressable onPress={() => removeItem(item.productId)}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            )}
          />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>AED {totalAmount.toFixed(2)}</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Shipping / Site Address"
            value={shippingAddress}
            onChangeText={setShippingAddress}
            multiline
          />

          {submitError && <Text style={styles.errorText}>{submitError}</Text>}

          <Pressable style={styles.primaryButton} onPress={handleSubmit} disabled={submitting}>
            <Text style={styles.primaryButtonText}>
              {submitting ? "Submitting…" : "Submit Enquiry"}
            </Text>
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8FAFC", padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F8FAFC", padding: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: "#0A192F" },
  signOut: { fontSize: 12, color: "#64748B", textDecorationLine: "underline" },
  emptyText: { color: "#64748B", textAlign: "center", marginTop: 40 },
  list: { gap: 8 },
  cartRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FFFFFF", padding: 12, borderRadius: 8, borderWidth: 1, borderColor: "#E2E8F0",
  },
  cartSku: { fontFamily: "monospace", fontSize: 10, color: "#94A3B8" },
  cartName: { fontSize: 13, fontWeight: "600", color: "#0A192F" },
  qtyInput: { width: 40, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 4, textAlign: "center", paddingVertical: 4 },
  cartTotal: { fontWeight: "600", color: "#0A192F", width: 70, textAlign: "right" },
  removeText: { color: "#DC2626", fontSize: 16, paddingHorizontal: 4 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 12 },
  totalLabel: { fontSize: 16, fontWeight: "600", color: "#0A192F" },
  totalValue: { fontSize: 20, fontWeight: "bold", color: "#0A192F" },
  input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 6, padding: 10, marginBottom: 10, backgroundColor: "#FFFFFF" },
  primaryButton: { backgroundColor: "#0284C7", borderRadius: 6, padding: 14, alignItems: "center" },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "600" },
  errorText: { color: "#DC2626", fontSize: 12, marginBottom: 8 },
  loginBox: { flex: 1, justifyContent: "center" },
  loginTitle: { fontSize: 20, fontWeight: "bold", color: "#0A192F", marginBottom: 4 },
  loginSubtitle: { fontSize: 13, color: "#64748B", marginBottom: 16 },
  hintText: { fontSize: 12, color: "#94A3B8", textAlign: "center", marginTop: 12 },
  successTitle: { fontSize: 20, fontWeight: "bold", color: "#0A192F", marginBottom: 8 },
  successRef: { fontFamily: "monospace", fontSize: 14, color: "#0284C7", marginBottom: 12 },
  successBody: { fontSize: 13, color: "#64748B", textAlign: "center" },
});