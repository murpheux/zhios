import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, SafeAreaView, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { Transaction, Wallet } from "@gnee/api-client";
import { useZuma } from "../ZumaProvider";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "WalletDetail">;

export function WalletDetailScreen({ route, navigation }: Props) {
  const { walletId } = route.params;
  const zuma = useZuma();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [w, { items }] = await Promise.all([
      zuma.wallets.get(walletId),
      zuma.transactions.list({ walletId, page: 1, limit: 25 }),
    ]);
    setWallet(w);
    setTransactions(items);
    setLoading(false);
  }, [zuma, walletId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>{wallet?.label ?? "…"}</Text>
        <Text style={{ color: "#6b7280" }}>{wallet?.address}</Text>
        <Text style={{ marginTop: 4 }}>{wallet?.balanceCache} sats · {wallet?.network}</Text>
        <Pressable
          onPress={() => navigation.navigate("SendTransaction", { walletId })}
          style={{ marginTop: 12, alignSelf: "flex-start" }}
        >
          <Text style={{ color: "#2563eb" }}>Send →</Text>
        </Pressable>
      </View>

      <Text style={{ paddingHorizontal: 16, fontWeight: "600" }}>Transactions</Text>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={loading}
        renderItem={({ item }) => (
          <View style={{ padding: 16, borderBottomWidth: 1, borderColor: "#e5e7eb" }}>
            <Text style={{ fontWeight: "600" }}>
              {item.type} · {item.amount} sats
            </Text>
            <Text style={{ color: "#6b7280" }}>
              {item.status} · {item.confirmations} confirmations
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
