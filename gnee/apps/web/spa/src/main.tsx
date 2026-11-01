import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ZumaProvider } from "./ZumaProvider";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ZumaProvider>
          <App />
        </ZumaProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
