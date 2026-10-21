// Runs the new restaurant check once, instead of waiting for the schedule.
//   npm run check-new-places          check now and send any alerts
//   npm run check-new-places -- --test   send a test alert to every device
import "dotenv/config";
import db from "./db.js";
import { checkForNewPlaces, sendTestPush } from "./new-places.js";

if (process.argv.includes("--test")) {
  const subs = db.prepare("SELECT token FROM push_subscriptions").all();
  for (const { token } of subs) await sendTestPush(token);
  console.log(`Sent a test alert to ${subs.length} device(s)`);
} else {
  await checkForNewPlaces();
}
