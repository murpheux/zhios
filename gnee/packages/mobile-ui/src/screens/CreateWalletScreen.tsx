import { describeZumaError, humanizeEnum, NETWORKS, type Network } from "@gnee/api-client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Button, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation";
import { Field, styles } from "../ui";
import { useZuma } from "../ZumaProvider";

type Props = NativeStackScreenProps<RootStackParamList, "CreateWallet">;

/** The owner is always the signed-in user (taken from the JWT server-side). */
export function CreateWalletScreen({ navigation }: Props) {
  const zuma = useZuma();
  const [label, setLabel] = useState("");
  const [network, setNetwork] = useState<Network>("TESTNET");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const wallet = await zuma.wallets.create({ label: label.trim(), network, type: "HOT" });
      navigation.replace("WalletDetail", { walletId: wallet.id });
    } catch (err) {
      setError(describeZumaError(err, "Failed to create wallet"));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Field label="Label" value={label} onChangeText={setLabel} placeholder="Primary hot wallet" />
      <Text>Network</Text>
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
        {NETWORKS.map((n) => (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ checked: network === n }}
            onPress={() => setNetwork(n)}
            style={[styles.input, network === n ? { borderColor: "#2563eb" } : null]}
          >
            <Text>{humanizeEnum(n)}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title={submitting ? "Creating…" : "Create wallet"} onPress={submit} disabled={submitting || !label.trim()} />
    </SafeAreaView>
  );
}
