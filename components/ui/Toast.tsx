"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

type Tone = "success" | "error";
type ToastItem = { id: number; tone: Tone; message: string };

const ToastContext = createContext<(tone: Tone, message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((tone: Tone, message: string) => {
    const id = ++nextId.current;
    setItems((current) => [...current, { id, tone, message }]);
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg ${
              item.tone === "error" ? "bg-red-600" : "bg-slate-900"
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(
    () => ({
      success: (message: string) => show("success", message),
      error: (message: string) => show("error", message),
    }),
    [show],
  );
}
