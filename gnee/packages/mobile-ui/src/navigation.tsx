import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { WalletListScreen } from "./screens/WalletListScreen";
import { WalletDetailScreen } from "./screens/WalletDetailScreen";
import { CreateWalletScreen } from "./screens/CreateWalletScreen";
import { SendTransactionScreen } from "./screens/SendTransactionScreen";

export type RootStackParamList = {
  WalletList: undefined;
  /** sentTransactionId is set when returning from a successful send. */
  WalletDetail: { walletId: string; sentTransactionId?: string };
  CreateWallet: undefined;
  SendTransaction: { walletId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Single shared navigation tree — identical on apps/ios and apps/android. */
export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="WalletList">
        <Stack.Screen name="WalletList" component={WalletListScreen} options={{ title: "Wallets" }} />
        <Stack.Screen name="WalletDetail" component={WalletDetailScreen} options={{ title: "Wallet" }} />
        <Stack.Screen name="CreateWallet" component={CreateWalletScreen} options={{ title: "New Wallet" }} />
        <Stack.Screen
          name="SendTransaction"
          component={SendTransactionScreen}
          options={{ title: "Send" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
