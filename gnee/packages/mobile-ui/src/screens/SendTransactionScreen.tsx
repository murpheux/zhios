import { type AmountUnit, describeZumaError, formatBtc, formatSats, humanizeEnum, type Network, type Wallet } from "@gnee/api-client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Button, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSendFlow } from "../hooks/useSendFlow";
import type { RootStackParamList } from "../navigation";
import { Field, styles } from "../ui";
import { useIdempotencyKeyFactory, useZuma } from "../ZumaProvider";

type Props = NativeStackScreenProps<RootStackParamList, "SendTransaction">;
type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; wallet: Wallet | null };

const ADDRESS_PLACEHOLDER: Record<Network, string> = { MAINNET: "bc1q…", TESTNET: "tb1q…", REGTEST: "bcrt1q…" };
const UNITS: AmountUnit[] = ["BTC", "SATS"];

export function SendTransactionScreen({ route, navigation }: Props) {
  const { walletId } = route.params;
  const zuma = useZuma();
  const createKey = useIdempotencyKeyFactory();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });

  const loadWallet = useCallback(() => {
    setLoad({ status: "loading" });
    zuma.wallets
      .get(walletId)
      .then((wallet) => setLoad({ status: "ready", wallet }))
      .catch((err: unknown) => setLoad({ status: "error", message: describeZumaError(err, "Failed to load wallet") }));
  }, [zuma, walletId]);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  const wallet = load.status === "ready" ? load.wallet : null;
  const [state, flow] = useSendFlow({
    transactions: zuma.transactions,
    wallet,
    createKey,
    // popTo returns to the existing detail screen, which refetches on focus.
    onSuccess: (tx) => navigation.popTo("WalletDetail", { walletId, sentTransactionId: tx.id }),
  });

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
        <Button title="Retry" onPress={loadWallet} />
      </SafeAreaView>
    );
  }
  if (!wallet) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text>Wallet not found.</Text>
      </SafeAreaView>
    );
  }

  const { values, visibleErrors, step, draft } = state;

  if ((step === "review" || step === "submitting" || step === "success") && draft) {
    const submitting = step === "submitting";
    return (
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.screen}>
          <Text style={styles.title}>Review and confirm</Text>
          <Text style={styles.muted}>From</Text>
          <Text>{wallet.label}</Text>
          <Text style={styles.muted}>Network</Text>
          <Text>{humanizeEnum(draft.network)}</Text>
          <Text style={styles.muted}>Destination</Text>
          <Text style={styles.mono} selectable>
            {draft.destinationAddress}
          </Text>
          <Text style={styles.muted}>Amount</Text>
          <Text>
            {formatBtc(draft.amountSats)} ({formatSats(draft.amountSats)})
          </Text>
          <Text style={styles.muted}>Fee rate</Text>
          <Text>{draft.feeRate} sat/vB</Text>
          <Text>Bitcoin transactions can't be reversed. Check the address and amount carefully.</Text>
          {state.submitError ? <Text style={styles.error}>{state.submitError}</Text> : null}
          <Button
            title={submitting ? "Sending…" : state.submitError ? "Retry send" : "Confirm and send"}
            onPress={() => void flow.confirm()}
            disabled={submitting || step === "success"}
          />
          <Button title="Back" onPress={() => flow.back()} disabled={submitting} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>
          Available: {formatBtc(wallet.balanceCache)} ({formatSats(wallet.balanceCache)}) · {humanizeEnum(wallet.network)}
        </Text>
        {state.blockedReason ? <Text style={styles.error}>{state.blockedReason}</Text> : null}

        <Field
          label={`Destination address (${humanizeEnum(wallet.network)})`}
          accessibilityLabel="Destination address"
          value={values.destinationAddress}
          onChangeText={(v) => flow.setField("destinationAddress", v)}
          placeholder={ADDRESS_PLACEHOLDER[wallet.network]}
          autoCapitalize="none"
          autoCorrect={false}
          error={visibleErrors.destinationAddress}
        />

        <Text>Amount unit</Text>
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
          {UNITS.map((unit) => {
            const selected = values.unit === unit;
            return (
              <Pressable
                key={unit}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => flow.setUnit(unit)}
                style={[styles.input, selected ? { borderColor: "#2563eb" } : null]}
              >
                <Text style={selected ? { color: "#2563eb", fontWeight: "600" } : undefined}>
                  {unit === "BTC" ? "BTC" : "sats"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Field
          label={`Amount (${values.unit === "BTC" ? "BTC" : "sats"})`}
          accessibilityLabel="Amount"
          value={values.amount}
          onChangeText={(v) => flow.setField("amount", v)}
          keyboardType={values.unit === "BTC" ? "decimal-pad" : "number-pad"}
          placeholder={values.unit === "BTC" ? "0.0015" : "150000"}
          error={visibleErrors.amount}
        />
        {state.amountSats !== null ? (
          <Text style={styles.muted}>
            = {values.unit === "BTC" ? formatSats(state.amountSats) : formatBtc(state.amountSats)}
          </Text>
        ) : null}

        <Field
          label="Fee rate (sat/vB)"
          accessibilityLabel="Fee rate"
          value={values.feeRate}
          onChangeText={(v) => flow.setField("feeRate", v)}
          keyboardType="number-pad"
          error={visibleErrors.feeRate}
        />

        {state.submitError ? <Text style={styles.error}>{state.submitError}</Text> : null}
        <Button title="Review send" onPress={() => flow.review()} disabled={Boolean(state.blockedReason)} />
      </ScrollView>
    </SafeAreaView>
  );
}
