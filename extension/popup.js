// popup.js

const scanBtn    = document.getElementById('scanBtn');
const spinner    = document.getElementById('spinner');
const btnLabel   = document.getElementById('btnLabel');
const resultCard = document.getElementById('resultCard');
const resultHeader = document.getElementById('resultHeader');
const resultIcon = document.getElementById('resultIcon');
const resultLabel = document.getElementById('resultLabel');
const resultSub  = document.getElementById('resultSub');
const spamBar    = document.getElementById('spamBar');
const hamBar     = document.getElementById('hamBar');
const spamPct    = document.getElementById('spamPct');
const hamPct     = document.getElementById('hamPct');
const statusDiv  = document.getElementById('status');
const snippetDiv = document.getElementById('snippet');
const apiInput   = document.getElementById('apiUrl');

// Restore saved API URL
chrome.storage.local.get('apiUrl', ({ apiUrl }) => {
  if (apiUrl) apiInput.value = apiUrl;
});
apiInput.addEventListener('change', () => {
  chrome.storage.local.set({ apiUrl: apiInput.value.trim() });
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function setLoading(on) {
  scanBtn.disabled = on;
  spinner.style.display = on ? 'block' : 'none';
  btnLabel.textContent  = on ? 'Scanning …' : '🔍 Scan This Email';
}

function showStatus(msg, type = 'error') {
  statusDiv.textContent = msg;
  statusDiv.className   = type;
  statusDiv.style.display = 'block';
  resultCard.style.display = 'none';
  snippetDiv.style.display = 'none';
}

function showResult(data, snippet) {
  statusDiv.style.display = 'none';
  resultCard.style.display = 'block';

  const isSpam = data.label === 'SPAM';
  const sp = Math.round(data.spam_probability * 100);
  const hp = Math.round(data.ham_probability  * 100);

  resultHeader.className = 'result-header ' + (isSpam ? 'spam' : 'ham');
  resultIcon.textContent  = isSpam ? '🚨' : '✅';
  resultLabel.textContent = isSpam ? 'SPAM DETECTED' : 'LOOKS SAFE';
  resultSub.textContent   = isSpam
    ? `${sp}% confidence this is spam`
    : `${hp}% confidence this is legitimate`;

  spamBar.style.width = sp + '%';
  hamBar.style.width  = hp + '%';
  spamPct.textContent = sp + '%';
  hamPct.textContent  = hp + '%';

  if (snippet) {
    snippetDiv.textContent   = '📄 ' + snippet.slice(0, 160).replace(/\s+/g, ' ') + '…';
    snippetDiv.style.display = 'block';
  }

  // Alert for spam (only once per session using sessionStorage-equivalent)
  if (isSpam && sp >= 70) {
    // Use chrome notifications if available
    chrome.permissions && chrome.permissions.contains &&
      chrome.permissions.contains({ permissions: ['notifications'] }, ok => {
        if (ok) {
          chrome.notifications && chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: '🚨 Spam Detected!',
            message: `This email is ${sp}% likely to be spam.`,
          });
        }
      });
  }
}

// ── Main scan flow ────────────────────────────────────────────────────────────
scanBtn.addEventListener('click', async () => {
  setLoading(true);
  statusDiv.style.display  = 'none';
  resultCard.style.display = 'none';
  snippetDiv.style.display = 'none';

  // 1. Get active tab
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const supportedHosts = [
    'mail.google.com',
    'outlook.live.com',
    'outlook.office.com',
  ];
  const url = new URL(tab.url);
  if (!supportedHosts.includes(url.hostname)) {
    setLoading(false);
    showStatus('⚠️ Please open Gmail or Outlook first, then click Scan.', 'error');
    return;
  }

  // 2. Inject content script (handles MV3 programmatic injection as fallback)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (_) { /* already injected */ }

  // 3. Extract email text via content script
  let emailText = '';
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'extractEmail' });
    emailText = (resp && resp.text) ? resp.text.trim() : '';
  } catch (err) {
    setLoading(false);
    showStatus('❌ Could not read the email. Make sure one is open, then try again.');
    return;
  }

  if (!emailText || emailText.length < 10) {
    setLoading(false);
    showStatus('❌ No email content found. Open an email and try again.');
    return;
  }

  // 4. Call FastAPI backend
  const apiBase = (apiInput.value || 'http://localhost:8000').replace(/\/$/, '');
  try {
    const res = await fetch(`${apiBase}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: emailText }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    setLoading(false);
    showResult(data, emailText);

  } catch (err) {
    setLoading(false);
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      showStatus('❌ Cannot reach the backend. Is the server running on ' + apiBase + '?');
    } else {
      showStatus('❌ ' + err.message);
    }
  }
});
