import React, { useState } from "react";
import { Button, SafeAreaView, Text, TextInput } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useZuma } from "../ZumaProvider";
import type { RootStackParamList } from "../navigation";

type Props = NativeStackScreenProps<RootStackParamList, "SendTransaction">;

export function SendTransactionScreen({ route, navigation }: Props) {
  const { walletId } = route.params;
  const zuma = useZuma();
  const [destinationAddress, setDestinationAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [feeRate, setFeeRate] = useState("8");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await zuma.transactions.create({
        walletId,
        type: "send",
        amount,
        feeRate,
        destinationAddress,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create transaction");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text>Destination address</Text>
      <TextInput
        value={destinationAddress}
        onChangeText={setDestinationAddress}
        placeholder="tb1q..."
        style={{ borderWidth: 1, borderColor: "#e5e7eb", padding: 8, borderRadius: 6 }}
      />
      <Text>Amount (sats)</Text>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        placeholder="15000"
        style={{ borderWidth: 1, borderColor: "#e5e7eb", padding: 8, borderRadius: 6 }}
      />
      <Text>Fee rate</Text>
      <TextInput
        value={feeRate}
        onChangeText={setFeeRate}
        keyboardType="numeric"
        style={{ borderWidth: 1, borderColor: "#e5e7eb", padding: 8, borderRadius: 6 }}
      />
      {error && <Text style={{ color: "#dc2626" }}>{error}</Text>}
      <Button
        title={submitting ? "Sending…" : "Send"}
        onPress={submit}
        disabled={submitting || !destinationAddress || !amount}
      />
    </SafeAreaView>
  );
}
