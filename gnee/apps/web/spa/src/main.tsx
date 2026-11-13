import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ZumaProvider } from "./ZumaProvider";
import App from "./App";
import { ErrorBoundary } from "./utils/error-boundary";
import { initNewRelic } from "./utils/newrelic";

// Before React renders so startup errors and the first page view are captured.
initNewRelic();

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ZumaProvider>
            <App />
          </ZumaProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
