const FIELDS = [
  'apiKey', 'model', 'educationLevel', 'fieldOfStudy', 'certifications',
  'yearsExp', 'skills', 'jobHistory', 'desiredTitle', 'jobType',
  'minSalary', 'age', 'preferences', 'minScore'
];

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(FIELDS, (saved) => {
    FIELDS.forEach(field => {
      const el = document.getElementById(field);
      if (el && saved[field] !== undefined) el.value = saved[field];
    });
    updateSlider();
  });

  document.getElementById('minScore').addEventListener('input', updateSlider);

  document.getElementById('saveBtn').addEventListener('click', () => {
    const data = {};
    FIELDS.forEach(f => { data[f] = document.getElementById(f)?.value ?? ''; });
    chrome.storage.local.set(data, () => {
      const s = document.getElementById('status');
      s.style.display = 'block';
      setTimeout(() => (s.style.display = 'none'), 3000);
    });
  });

  function updateSlider() {
    document.getElementById('minScoreDisplay').textContent =
      document.getElementById('minScore').value;
  }
});
