import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./App.css"; // global styles
import App from "./App";
// Clerk imports
import { ClerkProvider } from "@clerk/clerk-react";

// Fix for "Cannot redefine property: ethereum"
if (typeof window !== "undefined") {
  if (!window.ethereum) {
    Object.defineProperty(window, "ethereum", {
      value: {},
      writable: true,
    });
  }
}

// Load Clerk key from .env.local ONLY
const clerkPubKey = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

// Debug logging
console.log("Clerk key exists:", !!clerkPubKey);
console.log(
  "Key format valid:",
  clerkPubKey?.startsWith("pk_test_") || clerkPubKey?.startsWith("pk_live_")
);

if (!clerkPubKey) {
  console.error("Missing Clerk Publishable Key in .env.local");
  console.error("Create a .env.local file in your project root with:");
  console.error("REACT_APP_CLERK_PUBLISHABLE_KEY=your_actual_clerk_key");
  throw new Error("Missing Clerk Publishable Key in .env.local");
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPubKey} afterSignOutUrl="/">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
);
