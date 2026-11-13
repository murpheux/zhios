import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Text, View } from "react-native";
import { recordError } from "../utils/newrelic";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time errors below it, reports them to New Relic and shows a retry fallback. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
    recordError(error, {
      source: "react-error-boundary",
      componentStack: info.componentStack?.slice(0, 1000) ?? undefined,
    });
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <View accessibilityRole="alert" style={{ flex: 1, justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ marginBottom: 16 }}>The error was reported. Try again.</Text>
          <Button title="Try again" onPress={() => this.setState({ error: null })} />
        </View>
      );
    }
    return this.props.children;
  }
}
