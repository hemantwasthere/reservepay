import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { calculateSettlement } from "@reservepay/core/settlement";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type ApiOrder = FunctionReturnType<typeof api.demoOrders.list>[number];
export type DemoOrder = Omit<ApiOrder, "id"> & { id: string };
type Resolution = "completed" | "refunded";
type Payment = { amountCents: number; reserveBps: number; requestId: string };
type DemoStore = {
  orders: DemoOrder[];
  mode: "local" | "synced";
  loading: boolean;
  connected: boolean;
  create: (payment: Payment) => Promise<DemoOrder>;
  resolve: (id: string, status: Resolution) => Promise<DemoOrder>;
};

const DemoContext = createContext<DemoStore | null>(null);
const deploymentUrl = import.meta.env.VITE_CONVEX_URL;
const convex =
  typeof window !== "undefined" && deploymentUrl
    ? new ConvexReactClient(deploymentUrl)
    : null;

const initialStore: DemoStore = {
  orders: [],
  mode: deploymentUrl ? "synced" : "local",
  loading: true,
  connected: false,
  create: async () => {
    throw new Error("Demo is still loading.");
  },
  resolve: async () => {
    throw new Error("Demo is still loading.");
  },
};

function getSessionKey() {
  try {
    const stored = localStorage.getItem("reservepay.demo-session");
    if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
  } catch {}
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  try {
    localStorage.setItem("reservepay.demo-session", key);
  } catch {}
  return key;
}

function SyncedDemoProvider({ children }: { children: ReactNode }) {
  const [sessionKey] = useState(getSessionKey);
  const orders = useQuery(api.demoOrders.list, { sessionKey });
  const createOrder = useMutation(api.demoOrders.create);
  const resolveOrder = useMutation(api.demoOrders.resolve);
  const connection = useConvexConnectionState();
  return (
    <DemoContext.Provider
      value={{
        orders: orders ?? [],
        mode: "synced",
        loading: orders === undefined,
        connected: connection.isWebSocketConnected,
        create: (payment) => createOrder({ ...payment, sessionKey }),
        resolve: (id, status) =>
          resolveOrder({ sessionKey, orderId: id as Id<"demoOrders">, status }),
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

function LocalDemoProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<DemoOrder[]>([]);
  return (
    <DemoContext.Provider
      value={{
        orders,
        mode: "local",
        loading: false,
        connected: true,
        create: async ({ amountCents, reserveBps, requestId }) => {
          const order: DemoOrder = {
            ...calculateSettlement(BigInt(amountCents) * 10_000n, reserveBps),
            id: requestId,
            createdAt: Date.now(),
            status: "paid",
          };
          setOrders((previous) => [order, ...previous].slice(0, 20));
          return order;
        },
        resolve: async (id, status) => {
          const current = orders.find((order) => order.id === id);
          if (!current) throw new Error("Demo payment not found.");
          if (current.status !== "paid" && current.status !== status)
            throw new Error("This demo payment has already been resolved.");
          const updated = { ...current, status };
          setOrders((previous) =>
            previous.map((order) => (order.id === id ? updated : order)),
          );
          return updated;
        },
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready)
    return (
      <DemoContext.Provider value={initialStore}>
        {children}
      </DemoContext.Provider>
    );
  return convex ? (
    <ConvexProvider client={convex}>
      <SyncedDemoProvider>{children}</SyncedDemoProvider>
    </ConvexProvider>
  ) : (
    <LocalDemoProvider>{children}</LocalDemoProvider>
  );
}

export function useDemoStore() {
  const store = useContext(DemoContext);
  if (!store) throw new Error("DemoProvider is missing.");
  return store;
}
