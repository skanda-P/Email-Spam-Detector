// content.js – injected into Gmail and Outlook pages
// Listens for messages from popup.js and replies with extracted email text.

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action !== "extractEmail") return;

  const text = extractEmailText();
  sendResponse({ text });
  return true; // keep channel open for async
});

/**
 * Try every known DOM pattern for Gmail and Outlook.
 * Returns the concatenated subject + body as a single string.
 */
function extractEmailText() {
  const parts = [];

  // ── Gmail ──────────────────────────────────────────────────────────────────
  // Subject
  const gmailSubject = document.querySelector(
    'h2.hP, [data-legacy-thread-id] .hP, [data-thread-id] .hP'
  );
  if (gmailSubject) parts.push(gmailSubject.innerText.trim());

  // Body – newest open message first
  const gmailBodies = document.querySelectorAll(
    '.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s'
  );
  gmailBodies.forEach(el => {
    const t = el.innerText.trim();
    if (t) parts.push(t);
  });

  // ── Outlook (live.com & office.com) ────────────────────────────────────────
  if (parts.length === 0) {
    const olSubject = document.querySelector(
      '[aria-label="Message subject"] span, [class*="SubjectLine"], [class*="subject"]'
    );
    if (olSubject) parts.push(olSubject.innerText.trim());

    const olBody = document.querySelector(
      '[aria-label="Message body"], [class*="ReadingPaneContent"], div[role="document"]'
    );
    if (olBody) parts.push(olBody.innerText.trim());
  }

  // ── Fallback: largest visible <div> ────────────────────────────────────────
  if (parts.length === 0) {
    let best = null;
    let bestLen = 0;
    document.querySelectorAll("div, article, section").forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return;
      const len = (el.innerText || "").length;
      if (len > bestLen) { bestLen = len; best = el; }
    });
    if (best) parts.push(best.innerText.trim());
  }

  return parts.join("\n\n");
}
