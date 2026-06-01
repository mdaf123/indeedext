chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FILTER_JOBS') {
    filterWithAI(request.jobs, request.profile)
      .then(results => sendResponse({ success: true, results }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async
  }
});

async function filterWithAI(jobs, profile) {
  if (!profile.apiKey) throw new Error('No API key set. Add it in the extension popup.');

  const prompt = buildPrompt(jobs, profile);
  const model = profile.model || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${profile.apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `You are a career counselor AI that evaluates job listings against a candidate profile.
You MUST respond with ONLY a valid raw JSON array — no markdown, no explanation, no extra text.`
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 2500
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content.trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI returned an unexpected format.');
  return JSON.parse(match[0]);
}

function buildPrompt(jobs, profile) {
  const p = profile;
  const profileBlock = `
CANDIDATE PROFILE:
- Education: ${p.educationLevel || 'Not stated'} | Field: ${p.fieldOfStudy || 'Not stated'}
- Certifications: ${p.certifications || 'None'}
- Years of Experience: ${p.yearsExp || '0'}
- Skills: ${p.skills || 'Not stated'}
- Job History: ${p.jobHistory || 'Not stated'}
- Desired Role: ${p.desiredTitle || 'Open'}
- Preferred Type: ${p.jobType || 'Any'}
- Min Salary: ${p.minSalary ? `USD ${p.minSalary}/year` : 'No preference'}
- Age: ${p.age || 'Not stated'}
- Extra Notes: ${p.preferences || 'None'}
`.trim();

  const jobsBlock = jobs
    .map((j, i) => `[${i}] "${j.title}" at ${j.company} — ${j.location}\n${j.snippet}`)
    .join('\n\n');

  return `${profileBlock}

JOB LISTINGS:
${jobsBlock}

TASK: For each job index, evaluate if this candidate QUALIFIES. 
- Heavily penalize jobs that require education the candidate doesn't have.
- Penalize if required experience far exceeds the candidate's.
- Reward strong skill/role alignment.

Return ONLY this JSON array (one entry per job, in order):
[
  {
    "index": 0,
    "score": 85,
    "qualified": true,
    "reason": "One sentence: why or why not they qualify"
  }
]`;
}
