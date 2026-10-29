import React, { useState } from "react";
import { Button, SafeAreaView, Text, TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useZuma } from "../ZumaProvider";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "CreateWallet">;

export function CreateWalletScreen({ navigation }: Props) {
  const zuma = useZuma();
  const [label, setLabel] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const wallet = await zuma.wallets.create({
        label,
        ownerUserId,
        network: "testnet",
        type: "hot",
      });
      navigation.replace("WalletDetail", { walletId: wallet.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create wallet");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text>Label</Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Primary hot wallet"
        style={{ borderWidth: 1, borderColor: "#e5e7eb", padding: 8, borderRadius: 6 }}
      />
      <Text>Owner user id</Text>
      <TextInput
        value={ownerUserId}
        onChangeText={setOwnerUserId}
        placeholder="user-123"
        style={{ borderWidth: 1, borderColor: "#e5e7eb", padding: 8, borderRadius: 6 }}
      />
      {error && <Text style={{ color: "#dc2626" }}>{error}</Text>}
      <Button title={submitting ? "Creating…" : "Create wallet"} onPress={submit} disabled={submitting || !label || !ownerUserId} />
    </SafeAreaView>
  );
}
