import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@/shared/store/AuthContext';
import { contarMensajesMercadoNoLeidos } from '@/shared/services/chatService';
import { contarMensajesInsumoNoLeidos } from '@/shared/services/insumoChatService';

type Ctx = {
  mercadoUnread: number;
  refreshMercadoUnread: () => Promise<void>;
};

const ChatUnreadContext = createContext<Ctx | null>(null);

export function ChatUnreadProvider({ children }: { children: React.ReactNode }) {
  const { perfil } = useAuth();
  const [mercadoUnread, setMercadoUnread] = useState(0);

  const refreshMercadoUnread = useCallback(async () => {
    if (!perfil?.id) {
      setMercadoUnread(0);
      return;
    }
    try {
      const [n, ni] = await Promise.all([
        contarMensajesMercadoNoLeidos(perfil.id),
        contarMensajesInsumoNoLeidos(perfil.id),
      ]);
      setMercadoUnread(n + ni);
    } catch {
      setMercadoUnread(0);
    }
  }, [perfil?.id]);

  useEffect(() => {
    void refreshMercadoUnread();
  }, [refreshMercadoUnread]);

  useEffect(() => {
    const t = setInterval(() => void refreshMercadoUnread(), 40_000);
    return () => clearInterval(t);
  }, [refreshMercadoUnread]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') void refreshMercadoUnread();
    });
    return () => sub.remove();
  }, [refreshMercadoUnread]);

  const value = useMemo(
    () => ({ mercadoUnread, refreshMercadoUnread }),
    [mercadoUnread, refreshMercadoUnread],
  );

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

export function useChatUnread(): Ctx {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    return { mercadoUnread: 0, refreshMercadoUnread: async () => undefined };
  }
  return ctx;
}
