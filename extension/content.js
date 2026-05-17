// content.js - extracts email from Gmail/Outlook

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action !== 'extractEmail') return;

  const text = extractEmailText();
  sendResponse({ text });
  return true;
});

function extractEmailText() {
  const parts = [];

  // Try Gmail patterns
  const gmailSubject = document.querySelector(
    'h2.hP, [data-legacy-thread-id] .hP, [data-thread-id] .hP'
  );
  if (gmailSubject) parts.push(gmailSubject.innerText.trim());

  const gmailBodies = document.querySelectorAll(
    '.a3s.aiL, .ii.gt .a3s, [data-message-id] .a3s'
  );
  gmailBodies.forEach(el => {
    const t = el.innerText.trim();
    if (t) parts.push(t);
  });

  // Try Outlook if Gmail didn't work
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

  // Fallback: grab the largest text element
  if (parts.length === 0) {
    let best = null;
    let bestLen = 0;
    document.querySelectorAll('div, article, section').forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const len = (el.innerText || '').length;
      if (len > bestLen) {
        bestLen = len;
        best = el;
      }
    });
    if (best) parts.push(best.innerText.trim());
  }

  return parts.join('\n\n');
}
