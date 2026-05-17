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
  btnLabel.textContent = on ? 'Analyzing...' : '⚡ Scan Email';
}

function showStatus(msg, type = 'error') {
  statusDiv.textContent = msg;
  statusDiv.className = type;
  statusDiv.style.display = 'block';
  resultCard.style.display = 'none';
  snippetDiv.style.display = 'none';
}

function showResult(data, snippet) {
  statusDiv.style.display = 'none';
  resultCard.style.display = 'block';

  const isSpam = data.label === 'SPAM';
  const sp = Math.round(data.spam_probability * 100);
  const hp = Math.round(data.ham_probability * 100);

  resultHeader.className = 'result-header ' + (isSpam ? 'spam' : 'ham');
  resultIcon.textContent = isSpam ? '🚨' : '✓';
  resultLabel.textContent = isSpam ? 'SPAM DETECTED' : 'LOOKS GOOD';
  resultSub.textContent = isSpam
    ? `This looks like spam (${sp}% confidence)`
    : `This email appears legitimate (${hp}% confident)`;

  spamBar.style.width = sp + '%';
  hamBar.style.width = hp + '%';
  spamPct.textContent = sp + '%';
  hamPct.textContent = hp + '%';

  if (snippet) {
    snippetDiv.textContent = '📄 ' + snippet.slice(0, 150).replace(/\s+/g, ' ').trim() + '...';
    snippetDiv.style.display = 'block';
  }

  if (isSpam && sp >= 70) {
    chrome.permissions && chrome.permissions.contains &&
      chrome.permissions.contains({ permissions: ['notifications'] }, ok => {
        if (ok) {
          chrome.notifications && chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: '🚨 Spam Alert!',
            message: `Detected spam email (${sp}% confidence). Be careful!`,
          });
        }
      });
  }
}

// ── Main scan flow ────────────────────────────────────────────────────────────
scanBtn.addEventListener('click', async () => {
  setLoading(true);
  statusDiv.style.display = 'none';
  resultCard.style.display = 'none';
  snippetDiv.style.display = 'none';

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const supportedHosts = [
    'mail.google.com',
    'outlook.live.com',
    'outlook.office.com',
  ];
  const url = new URL(tab.url);
  if (!supportedHosts.includes(url.hostname)) {
    setLoading(false);
    showStatus('⚠️ Open Gmail or Outlook and try again', 'error');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch (_) { /* already injected */ }

  let emailText = '';
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'extractEmail' });
    emailText = (resp && resp.text) ? resp.text.trim() : '';
  } catch (err) {
    setLoading(false);
    showStatus('❌ Couldn\'t read the email. Make sure one is open.', 'error');
    return;
  }

  if (!emailText || emailText.length < 10) {
    setLoading(false);
    showStatus('❌ No email content found. Open an email first.', 'error');
    return;
  }

  const apiBase = (apiInput.value || 'http://localhost:8000').replace(/\/$/, '');
  try {
    const res = await fetch(`${apiBase}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: emailText }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `Error ${res.status}`);
    }

    const data = await res.json();
    setLoading(false);
    showResult(data, emailText);

  } catch (err) {
    setLoading(false);
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      showStatus('❌ Can\'t reach the server at ' + apiBase, 'error');
    } else {
      showStatus('❌ ' + err.message, 'error');
    }
  }
});
