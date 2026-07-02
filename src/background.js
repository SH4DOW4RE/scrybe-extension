import { ext } from "./browser.js";
import { saveHistoryVisit } from "./storage.js";

ext.history.onVisited.addListener((result) => {
  saveHistoryVisit(result).catch((error) => {
    console.warn("Scrybe failed to save history visit", error);
  });
});
