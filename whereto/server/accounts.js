import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import db from "./db.js";

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 30;
const MIN_PASSWORD_LENGTH = 8;

// ---------- Passwords & sessions ----------

async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).run(sha256(token), userId, `+${SESSION_DAYS} days`);
  return token;
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/** Sets req.user to { id, email } when a valid login token is sent, else null. */
export function loadUser(req, res, next) {
  const token = bearerToken(req);
  req.user = token
    ? db
        .prepare(
          `SELECT users.id, users.email FROM sessions
           JOIN users ON users.id = sessions.user_id
           WHERE sessions.token_hash = ? AND sessions.expires_at > datetime('now')`
        )
        .get(sha256(token)) ?? null
    : null;
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in." });
  next();
}

// Slows down password guessing: at most 10 failed logins per email+IP
// every 15 minutes. In memory, so it resets when the server restarts.
const failedLogins = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;

function tooManyFailures(key) {
  const entry = failedLogins.get(key);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) return false;
  return entry.count >= MAX_FAILED_LOGINS;
}

function recordFailure(key) {
  const entry = failedLogins.get(key);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
    failedLogins.set(key, { first: Date.now(), count: 1 });
  } else {
    entry.count++;
  }
}

// ---------- Auth routes ----------

export const authRouter = express.Router();

authRouter.post("/signup", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res
      .status(400)
      .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "An account with that email already exists." });
  }

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)")
    .run(email, await hashPassword(password));
  const userId = Number(lastInsertRowid);

  res.status(201).json({ token: createSession(userId), user: { id: userId, email } });
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const limitKey = `${email}|${req.ip}`;

  if (tooManyFailures(limitKey)) {
    return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
  }

  const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    recordFailure(limitKey);
    return res.status(401).json({ error: "Wrong email or password." });
  }

  failedLogins.delete(limitKey);
  res.json({ token: createSession(user.id), user: { id: user.id, email: user.email } });
});

authRouter.post("/logout", (req, res) => {
  const token = bearerToken(req);
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  res.sendStatus(204);
});

authRouter.get("/me", requireUser, (req, res) => {
  res.json({ user: req.user });
});

// ---------- Saved conversations ----------

export const conversationsRouter = express.Router();
conversationsRouter.use(requireUser);

conversationsRouter.get("/", (req, res) => {
  const conversations = db
    .prepare(
      `SELECT id, title, updated_at FROM conversations
       WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`
    )
    .all(req.user.id);
  res.json({ conversations });
});

conversationsRouter.get("/:id", (req, res) => {
  const convo = getConversation(req.user.id, req.params.id);
  if (!convo) return res.sendStatus(404);
  res.json({ id: convo.id, title: convo.title, messages: convo.display });
});

conversationsRouter.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?").run(
    req.params.id,
    req.user.id
  );
  res.sendStatus(204);
});

export function getConversation(userId, id) {
  const row = db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(String(id), userId);
  if (!row) return null;
  return { ...row, history: JSON.parse(row.history), display: JSON.parse(row.display) };
}

/**
 * Saves one chat turn. Creates the conversation (titled after the first
 * message) when `convo` is null. Returns the conversation id.
 */
export function saveChatTurn(userId, convo, { history, userMessage, replyText, restaurants }) {
  const display = convo ? convo.display : [];
  display.push({ role: "user", text: userMessage });
  display.push({ role: "assistant", text: replyText });
  if (restaurants?.length) display.push({ role: "results", restaurants });

  if (convo) {
    db.prepare(
      `UPDATE conversations SET history = ?, display = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(JSON.stringify(history), JSON.stringify(display), convo.id, userId);
    return convo.id;
  }

  const id = randomUUID();
  const title = userMessage.length > 60 ? `${userMessage.slice(0, 57)}...` : userMessage;
  db.prepare(
    `INSERT INTO conversations (id, user_id, title, history, display)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, userId, title, JSON.stringify(history), JSON.stringify(display));
  return id;
}

// ---------- Favorites ----------

export const favoritesRouter = express.Router();
favoritesRouter.use(requireUser);

favoritesRouter.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT restaurant FROM favorites WHERE user_id = ? ORDER BY created_at DESC")
    .all(req.user.id);
  res.json({ favorites: rows.map((r) => JSON.parse(r.restaurant)) });
});

favoritesRouter.post("/", (req, res) => {
  const restaurant = req.body.restaurant;
  const json = JSON.stringify(restaurant ?? null);
  if (typeof restaurant?.id !== "string" || !restaurant.id || json.length > 5000) {
    return res.status(400).json({ error: "Invalid restaurant." });
  }
  db.prepare(
    `INSERT INTO favorites (user_id, place_id, restaurant) VALUES (?, ?, ?)
     ON CONFLICT (user_id, place_id) DO UPDATE SET restaurant = excluded.restaurant`
  ).run(req.user.id, restaurant.id, json);
  res.sendStatus(204);
});

favoritesRouter.delete("/:placeId", (req, res) => {
  db.prepare("DELETE FROM favorites WHERE user_id = ? AND place_id = ?").run(
    req.user.id,
    req.params.placeId
  );
  res.sendStatus(204);
});
