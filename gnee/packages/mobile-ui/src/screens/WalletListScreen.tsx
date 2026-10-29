import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, SafeAreaView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Wallet } from "@gnee/api-client";
import { useZuma } from "../ZumaProvider";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "WalletList">;

export function WalletListScreen({ navigation }: Props) {
  const zuma = useZuma();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await zuma.wallets.list({ page: 1, limit: 25 });
      setWallets(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, [zuma]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ padding: 16, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>Wallets</Text>
        <Pressable onPress={() => navigation.navigate("CreateWallet")}>
          <Text style={{ color: "#2563eb" }}>+ New</Text>
        </Pressable>
      </View>

      {loading && <Text style={{ padding: 16 }}>Loading…</Text>}
      {error && <Text style={{ padding: 16, color: "#dc2626" }}>{error}</Text>}

      <FlatList
        data={wallets}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={loading}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate("WalletDetail", { walletId: item.id })}
            style={{ padding: 16, borderBottomWidth: 1, borderColor: "#e5e7eb" }}
          >
            <Text style={{ fontWeight: "600" }}>{item.label}</Text>
            <Text style={{ color: "#6b7280" }}>
              {item.network} · {item.balanceCache} sats
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
