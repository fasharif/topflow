import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  setSession: (user: AuthUser, token: string) => void;
  logout: () => void;
  isLoaded: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const STORAGE_KEY = "topflow_auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          const parsed = JSON.parse(stored);
          setUser(parsed.user);
          setToken(parsed.token);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  const setSession = (newUser: AuthUser, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: newUser, token: newToken })).catch(() => {});
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, token, setSession, logout, isLoaded }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}