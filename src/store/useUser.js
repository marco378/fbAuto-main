// src/store/useUser.js
import { createStore } from "zustand/vanilla";
import { BASE_URL } from "../config/facebook-config.js";
import dotenv from 'dotenv'

dotenv.config()

export const useUserStore = createStore((set) => ({
  user: null,

  setUser: (user) => set({ user }),

  clearUser: () => set({ user: null }),

  fetchUser: async () => {
  try {
    console.log("Using JWT:", process.env.USER_JWT?.slice(0, 20) + "...");
    const res = await fetch("http://localhost:8000/api/facebook/credentials", {
      
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.USER_JWT}`, // put token in .env
      },
      credentials: "include",
    });

    if (!res.ok) throw new Error("Failed to fetch user: " + res.status);
    const data = await res.json();

    if (!data.email || !data.password) throw new Error("No credentials in API");

    set({ user: { email: data.email, password: data.password } });
    console.log("✅ Credentials loaded:", data.email);
  } catch (err) {
    console.error("Error fetching user:", err.message);
    set({ user: null });
  }
},
}));
