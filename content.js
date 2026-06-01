let isFiltering = false;
let debounceTimer = null;
let lastUrl = '';

// Detect page navigation (Indeed is a SPA)
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    scheduleFilter(2500);
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// Initial run
scheduleFilter(2000);

function scheduleFilter(delay = 1500) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runFilter, delay);
}

async function runFilter() {
  if (isFiltering || !window.location.href.includes('/jobs')) return;

  const profile = await getProfile();

  if (!profile.apiKey) {
    showBanner('⚠️ Add your OpenAI API key in the extension popup to enable AI filtering.', 'warning');
    return;
  }

  const jobCards = scrapeJobCards();
  if (!jobCards.length) return;

  isFiltering = true;
  showBanner(`🤖 Analyzing ${jobCards.length} jobs against your profile...`, 'info');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'FILTER_JOBS',
      jobs: jobCards.map(c => c.data),
      profile
    });

    if (!response.success) throw new Error(response.error);

    const minScore = parseInt(profile.minScore) || 50;
    applyResults(jobCards, response.results, minScore);

    const hits = response.results.filter(r => r.score >= minScore).length;
    showBanner(`✅ ${hits} of ${jobCards.length} jobs match your profile (≥${minScore}% score)`, 'success');
  } catch (err) {
    showBanner(`❌ ${err.message}`, 'error');
    console.error('[IndeedAIFilter]', err);
  }

  isFiltering = false;
}

function scrapeJobCards() {
  // Try multiple selector strategies since Indeed updates their DOM
  const strategies = [
    '[data-testid="slider_item"]',
    '.job_seen_beacon',
    '.jobsearch-ResultsList > li',
    '[class*="JobCard"]'
  ];

  let cards = [];
  for (const sel of strategies) {
    cards = [...document.querySelectorAll(sel)];
    if (cards.length > 0) break;
  }

  return cards.flatMap((el, index) => {
    const titleEl = el.querySelector(
      '[data-testid="jobTitle"] a, h2 a, .jcs-JobTitle a, [class*="jobTitle"] a'
    );
    const companyEl = el.querySelector(
      '[data-testid="company-name"], .companyName, [class*="companyName"]'
    );
    const locationEl = el.querySelector(
      '[data-testid="text-location"], .companyLocation, [class*="location"]'
    );
    const snippetEl = el.querySelector(
      '.job-snippet, [class*="snippet"], [class*="description"], [class*="jobDescription"]'
    );
    const salaryEl = el.querySelector(
      '[data-testid="attribute_snippet_testid"], .salary-snippet, [class*="salary"]'
    );

    const title = titleEl?.textContent?.trim();
    if (!title) return []; // skip non-job elements

    return [{
      element: el,
      data: {
        index,
        title,
        company: companyEl?.textContent?.trim() || 'Unknown Company',
        location: locationEl?.textContent?.trim() || 'Unknown Location',
        snippet: [snippetEl?.textContent?.trim(), salaryEl?.textContent?.trim()]
          .filter(Boolean).join(' | ')
      }
    }];
  });
}

function applyResults(jobCards, results, minScore) {
  const map = Object.fromEntries(results.map(r => [r.index, r]));

  jobCards.forEach(({ element, data }) => {
    const result = map[data.index];
    if (!result) return;

    const { score, qualified, reason } = result;
    const passes = score >= minScore;

    // Remove existing badge
    element.querySelector('.aijf-badge')?.remove();

    // Inject badge
    const badge = document.createElement('div');
    badge.className = 'aijf-badge';
    badge.innerHTML = `
      <span class="aijf-score ${passes ? 'aijf-pass' : 'aijf-fail'}">
        🤖 ${score}% match
      </span>
      <span class="aijf-reason">${reason}</span>
    `;

    const target =
      element.querySelector('.resultContent, [class*="cardContent"], [class*="jobBody"]')
      || element;
    target.appendChild(badge);

    // Visual treatment
    if (!passes) {
      element.style.opacity = '0.3';
      element.style.filter = 'grayscale(60%)';
    } else {
      element.style.opacity = '1';
      element.style.filter = 'none';
      if (score >= 80) element.style.outline = '2px solid #00a651';
    }
  });
}

function showBanner(msg, type = 'info') {
  let el = document.getElementById('aijf-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aijf-banner';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `aijf-banner-${type}`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => (el.style.display = 'none'), 6000);
}

function getProfile() {
  return new Promise(res => chrome.storage.local.get(null, res));
}
