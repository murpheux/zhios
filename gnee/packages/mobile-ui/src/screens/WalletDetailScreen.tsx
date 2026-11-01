import { describeZumaError, formatBtc, formatSats, humanizeEnum, type Transaction, type Wallet } from "@gnee/api-client";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Button, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation";
import { styles } from "../ui";
import { useZuma } from "../ZumaProvider";

type Props = NativeStackScreenProps<RootStackParamList, "WalletDetail">;
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; wallet: Wallet | null; transactions: Transaction[] };

export function WalletDetailScreen({ route, navigation }: Props) {
  const { walletId, sentTransactionId } = route.params;
  const zuma = useZuma();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const hasData = useRef(false);

  const fetchAll = useCallback(() => {
    const id = ++requestId.current;
    // Keep showing existing data during focus/pull refreshes; only the first load blanks the screen.
    if (hasData.current) setRefreshing(true);
    else setLoad({ status: "loading" });
    Promise.all([zuma.wallets.get(walletId), zuma.transactions.list({ walletId, page: 1, limit: 25 })])
      .then(([wallet, { items }]) => {
        if (id !== requestId.current) return;
        hasData.current = true;
        setLoad({ status: "ready", wallet, transactions: items });
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        hasData.current = false;
        setLoad({ status: "error", message: describeZumaError(err, "Failed to load wallet") });
      })
      .finally(() => {
        if (id === requestId.current) setRefreshing(false);
      });
  }, [zuma, walletId]);

  // Runs on first focus and every time the screen regains focus (e.g. back from Send).
  useFocusEffect(fetchAll);

  if (load.status === "loading") {
    return (
      <SafeAreaView style={styles.screen}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </SafeAreaView>
    );
  }
  if (load.status === "error") {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.error}>{load.message}</Text>
        <Button title="Retry" onPress={fetchAll} />
      </SafeAreaView>
    );
  }
  const { wallet, transactions } = load;
  if (!wallet) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text>Wallet not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["bottom", "left", "right"]}>
      <View style={{ padding: 16, gap: 4 }}>
        <Text style={styles.title}>{wallet.label}</Text>
        <Text style={[styles.muted, styles.mono]} selectable>
          {wallet.address}
        </Text>
        <Text style={{ fontSize: 18, fontWeight: "600" }}>{formatBtc(wallet.balanceCache)}</Text>
        <Text style={styles.muted}>
          {formatSats(wallet.balanceCache)} · {humanizeEnum(wallet.network)} · {humanizeEnum(wallet.status)}
        </Text>
        {sentTransactionId ? (
          <Text style={styles.success}>Transaction submitted. It will update here as it's broadcast and confirmed.</Text>
        ) : null}
        <Pressable
          onPress={() => navigation.navigate("SendTransaction", { walletId })}
          style={{ marginTop: 12, alignSelf: "flex-start" }}
          accessibilityRole="button"
        >
          <Text style={{ color: "#2563eb" }}>Send →</Text>
        </Pressable>
      </View>

      <Text style={{ paddingHorizontal: 16, fontWeight: "600" }}>Transactions</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        onRefresh={fetchAll}
        refreshing={refreshing}
        ListEmptyComponent={<Text style={{ padding: 16, color: "#6b7280" }}>No transactions yet.</Text>}
        renderItem={({ item }) => (
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: "#e5e7eb" }}>
            <Text style={{ fontWeight: "600" }}>
              {humanizeEnum(item.type)} · {formatBtc(item.amount)}
            </Text>
            <Text style={styles.muted}>
              {humanizeEnum(item.status)} · {item.confirmations} confirmations
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
