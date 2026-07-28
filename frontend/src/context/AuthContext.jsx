import { createContext, useContext, useState } from "react";
import { login as loginApi } from "../api/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });

  async function login(email, password) {
    const { token, user: loggedInUser } = await loginApi(email, password);
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  const canApprove = user && ["HR", "CEO"].includes(user.role);
  const isUnitManager = user && user.role === "Unit Manager";
  const isHR = user && user.role === "HR";
  const isCEO = user && user.role === "CEO";
  const isAccountant = user && user.role === "Accountant";
  const isFinance = user && user.role === "Finance";

  return (
    <AuthContext.Provider value={{ user, login, logout, canApprove, isUnitManager, isHR, isCEO, isAccountant, isFinance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}