// The brochure auto-reply bot has been removed: WaBro never sends messages
// on its own. Every send goes through an explicit, user-approved API call.
// registerBrochure remains as an inert store so the listing endpoint is
// unchanged; nothing listens for incoming "brochure" texts or button taps.
const brochureStore = new Map();

export function registerBrochure(buttonId, url, fileName) {
  brochureStore.set(buttonId, { url, fileName });
}
