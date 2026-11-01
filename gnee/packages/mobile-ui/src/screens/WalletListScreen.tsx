import { describeZumaError, formatBtc, humanizeEnum, type Wallet } from "@gnee/api-client";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation";
import { useZuma } from "../ZumaProvider";

type Props = NativeStackScreenProps<RootStackParamList, "WalletList">;

export function WalletListScreen({ navigation }: Props) {
  const zuma = useZuma();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // useFocusEffect callbacks must return void/cleanup, not a promise — hence the .then chain.
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    zuma.wallets
      .list({ page: 1, limit: 25 })
      .then(({ items }) => setWallets(items))
      .catch((err: unknown) => setError(describeZumaError(err, "Failed to load wallets")))
      .finally(() => setLoading(false));
  }, [zuma]);

  // Refetch whenever the list regains focus (e.g. after creating a wallet or sending).
  useFocusEffect(load);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>Wallets</Text>
        <Pressable onPress={() => navigation.navigate("CreateWallet")}>
          <Text style={{ color: "#2563eb" }}>+ New</Text>
        </Pressable>
      </View>

      {loading && wallets.length === 0 ? <Text style={{ padding: 16 }}>Loading…</Text> : null}
      {error ? <Text style={{ padding: 16, color: "#dc2626" }}>{error}</Text> : null}

      <FlatList
        data={wallets}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          !loading && !error ? <Text style={{ padding: 16, color: "#6b7280" }}>No wallets yet.</Text> : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("WalletDetail", { walletId: item.id })}
            style={{ padding: 16, borderBottomWidth: 1, borderColor: "#e5e7eb" }}
          >
            <Text style={{ fontWeight: "600" }}>{item.label}</Text>
            <Text style={{ color: "#6b7280" }}>
              {humanizeEnum(item.network)} · {formatBtc(item.balanceCache)}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
