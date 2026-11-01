import type React from "react";
import { StyleSheet, Text, type TextInputProps, TextInput } from "react-native";

/** Tiny shared primitives so screens stay consistent without a UI kit dependency. */
export const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", padding: 8, borderRadius: 6 },
  inputInvalid: { borderColor: "#dc2626" },
  error: { color: "#dc2626" },
  muted: { color: "#6b7280" },
  title: { fontSize: 20, fontWeight: "600" },
  success: { color: "#15803d" },
  mono: { fontFamily: "Courier" },
});

export function Field({
  label,
  error,
  errorTestID,
  ...input
}: TextInputProps & { label: string; error?: string; errorTestID?: string }): React.JSX.Element {
  return (
    <>
      <Text>{label}</Text>
      <TextInput
        {...input}
        accessibilityLabel={input.accessibilityLabel ?? label}
        style={[styles.input, error ? styles.inputInvalid : null]}
      />
      {error ? (
        <Text testID={errorTestID} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </>
  );
}
