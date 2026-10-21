import "dotenv/config";
import express from "express";
import { handleChatTurn } from "./claude.js";
import { fetchPlacePhoto } from "./places.js";
import { pushRouter, startNewPlacesSchedule } from "./new-places.js";
import {
  authRouter,
  conversationsRouter,
  favoritesRouter,
  getConversation,
  loadUser,
  saveChatTurn,
} from "./accounts.js";

const app = express();

app.use(express.json());

// The Expo app runs on a different origin (web dev server, or a phone on
// the LAN), so allow cross-origin requests to the API.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(loadUser);
app.use("/api/auth", authRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/push", pushRouter);

// Chats from signed-out users are kept in memory, keyed by a client-generated
// session id, and are lost when the server restarts. Signed-in users' chats
// are saved to the database instead.
const sessions = new Map();

app.post("/api/chat", async (req, res) => {
  try {
    const { sessionId, conversationId, message, location } = req.body;
    if (!message || (!req.user && !sessionId)) {
      return res.status(400).json({ error: "sessionId and message are required" });
    }

    let convo = null;
    if (req.user && conversationId) {
      convo = getConversation(req.user.id, conversationId);
      if (!convo) return res.status(404).json({ error: "Conversation not found." });
    }

    const history = req.user ? convo?.history ?? [] : sessions.get(sessionId) || [];

    const { replyText, restaurantResults, history: updatedHistory } =
      await handleChatTurn({
        history,
        userMessage: message,
        userLocation: location,
      });

    let savedId = null;
    if (req.user) {
      savedId = saveChatTurn(req.user.id, convo, {
        history: updatedHistory,
        userMessage: message,
        replyText,
        restaurants: restaurantResults,
      });
    } else {
      sessions.set(sessionId, updatedHistory);
    }

    res.json({ reply: replyText, restaurants: restaurantResults, conversationId: savedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong handling that message." });
  }
});

app.get("/api/photo", async (req, res) => {
  const photo = await fetchPlacePhoto(String(req.query.name || ""));
  if (!photo) return res.sendStatus(404);
  res.setHeader("Content-Type", photo.headers.get("content-type") || "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(Buffer.from(await photo.arrayBuffer()));
});

const PORT = process.env.PORT || 3000;
// Listen on all interfaces so a phone on the same Wi-Fi can reach it.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Where To API listening on http://localhost:${PORT}`);
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.log("(No GOOGLE_PLACES_API_KEY set - using mock restaurant data)");
  }
  startNewPlacesSchedule();
});
