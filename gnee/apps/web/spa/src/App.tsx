import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { CallbackPage } from "./pages/CallbackPage";
import { WalletListPage } from "./pages/WalletListPage";
import { WalletDetailPage } from "./pages/WalletDetailPage";
import { CreateWalletPage } from "./pages/CreateWalletPage";
import { SendTransactionPage } from "./pages/SendTransactionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/callback" element={<CallbackPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Routes>
              <Route path="/" element={<WalletListPage />} />
              <Route path="/wallets/new" element={<CreateWalletPage />} />
              <Route path="/wallets/:walletId" element={<WalletDetailPage />} />
              <Route path="/wallets/:walletId/send" element={<SendTransactionPage />} />
            </Routes>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
