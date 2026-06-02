import { io, Socket } from "socket.io-client";
import { useInterviewStore } from "@/store/interviewStore";

let socket: Socket | null = null;

export function getInterviewSocket(token: string): Socket {
  if (socket?.connected) return socket;

  const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

  socket = io(`${BACKEND_URL}/interview`, {
    auth: { token: `Bearer ${token}` },
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  // Global Error Listeners
  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
    useInterviewStore.getState().setError(`Connection failed: ${err.message}`);
  });

  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
      // The server closed the connection (e.g. session ended)
      socket?.connect();
    }
    console.warn("Socket disconnected:", reason);
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners(); // Crucial to prevent memory leaks!
    socket.disconnect();
    socket = null;
  }
}
