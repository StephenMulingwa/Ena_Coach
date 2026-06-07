"use client";

import { useState } from "react";
import Login from "../components/Login";
import AppShell from "../components/AppShell";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  if (!isLoggedIn) {
    return (
      <Login
        onLogin={() => {
          setIsLoggedIn(true);
        }}
      />
    );
  }

  return <AppShell onLogout={() => setIsLoggedIn(false)} />;
}
