// jest-expo's preset already mocks NativeAnimatedHelper and other native modules;
// add mobile-ui-specific mocks here.

// Screens use SafeAreaView from react-native-safe-area-context, which needs a provider/native module.
jest.mock("react-native-safe-area-context", () => {
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default ?? mock;
});

// Screens are rendered without a NavigationContainer in unit tests; run focus effects like a
// mount effect instead (they re-run when the memoized callback changes, matching real focus semantics closely enough).
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  const { useEffect } = require("react");
  return {
    ...actual,
    useFocusEffect: (effect) => useEffect(() => effect(), [effect]),
  };
});
