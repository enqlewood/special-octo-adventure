import Anthropic from "@anthropic-ai/sdk";
import { searchRestaurants } from "./places.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001"; // cheap + fast, plenty for this task

const SYSTEM_PROMPT = `You are the assistant for "Where To" - a chat app that helps
people figure out where to eat.

Your job: understand what the user wants (cuisine, price, distance, mood,
dietary needs) and call the search_restaurants tool to find real nearby
options.

Guidelines:
- If the request is vague ("I'm hungry"), ask ONE short clarifying question
  before searching - don't interrogate them.
- Once you have enough to search, call search_restaurants right away.
- When results come back, don't just repeat the data. Write 1-3 sentences
  picking out the best matches and why they fit, conversationally. The
  restaurant cards themselves (name, rating, photos, menu link) render
  separately in the UI, so don't re-list every detail in your text.
- If nothing good matches, say so and suggest loosening a constraint
  (wider radius, different price) instead of forcing a bad match.
- Keep it brief and conversational - this is a chat, not a report.
- Write plain text only - no markdown (no **bold**, bullets, or headings);
  the app shows your text as-is.
- Only state facts that are in the search results. Price levels are
  relative ($ = inexpensive, $$$$ = very expensive), not dollar amounts.
  Describe each place's cuisine using its "cuisine" field; if a result
  doesn't match what they asked for, say so rather than pretending it does.`;

const TOOL_DEFINITION = {
  name: "search_restaurants",
  description:
    "Search for nearby restaurants matching cuisine, price, and distance " +
    "preferences. Returns name, rating, number of reviews, price level, photos, menu link, " +
    "distance, and open/closed status.",
  input_schema: {
    type: "object",
    properties: {
      cuisine: {
        type: "string",
        description: "e.g. 'ramen', 'italian', 'thai'. Omit if no preference.",
      },
      price_level: {
        type: "string",
        enum: ["$", "$$", "$$$", "$$$$"],
        description: "Omit if the user has no price preference.",
      },
      max_distance_miles: {
        type: "number",
        description: "Search radius in miles. Default to 5 if not specified.",
      },
      open_now: {
        type: "boolean",
        description: "Whether the restaurant must be currently open. Default true.",
      },
      sort_by: {
        type: "string",
        enum: ["popularity", "rating", "distance"],
        description:
          "How to order results. 'popularity' (most reviews) unless the user asks " +
          "for the closest places ('distance') or the best/highest rated ('rating').",
      },
    },
    required: [],
  },
};

/**
 * Runs one turn of the chat: sends history + new message to Claude,
 * executes the search_restaurants tool if Claude calls it, and returns
 * both Claude's final reply text and any restaurant results (for the UI
 * to render as cards) plus the updated message history.
 */
export async function handleChatTurn({ history, userMessage, userLocation }) {
  const messages = [...history, { role: "user", content: userMessage }];

  let response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_DEFINITION],
    messages,
  });

  let restaurantResults = null;

  if (response.stop_reason === "tool_use") {
    const toolCall = response.content.find((b) => b.type === "tool_use");
    const args = toolCall.input;
    console.log("[claude] search_restaurants", JSON.stringify(args));

    restaurantResults = await searchRestaurants({
      ...args,
      latitude: userLocation?.lat,
      longitude: userLocation?.lng,
    });

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify(restaurantResults),
        },
      ],
    });

    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [TOOL_DEFINITION],
      messages,
    });
  }

  const replyText = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  messages.push({ role: "assistant", content: response.content });

  return { replyText, restaurantResults, history: messages };
}
