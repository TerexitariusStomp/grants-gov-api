// Profile page script
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('profile-form');
    const msgEl = document.getElementById('profile-message');
    const scrapeUrl = document.getElementById('scrape-url');
    const scrapeBtn = document.getElementById('scrape-btn');
    const scrapeStatus = document.getElementById('scrape-status');
    const scrapeStatusText = document.getElementById('scrape-status-text');
    const scrapeProgress = document.getElementById('scrape-progress');

    // Load profile from localStorage if exists
    const saved = localStorage.getItem('grants_profile');
    if (saved) {
        try {
            const profile = JSON.parse(saved);
            populateForm(profile);
            if (profile.website) scrapeUrl.value = profile.website;
            showMessage('Profile loaded from saved data. Edit and click Save to update.', 'info');
        } catch(e) {}
    }

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        saveProfile();
    });

    scrapeBtn.addEventListener('click', function() {
        const url = scrapeUrl.value.trim();
        if (!url) {
            showMessage('Please enter a website URL.', 'warning');
            scrapeUrl.focus();
            return;
        }

        // Immediately show loading indicator
        scrapeStatus.classList.remove('hidden');
        scrapeStatusText.textContent = 'Fetching website...';
        scrapeProgress.classList.add('active');
        scrapeBtn.disabled = true;
        scrapeBtn.textContent = '⏳ Extracting...';

        // Update status after 3 seconds to show we're still working
        setTimeout(function() {
            if (scrapeStatusText.textContent === 'Fetching website...') {
                scrapeStatusText.textContent = 'Parsing content...';
            }
        }, 3000);

        setTimeout(function() {
            if (scrapeBtn.disabled) {
                scrapeStatusText.textContent = 'AI is analyzing the website...';
            }
        }, 8000);

        // Timeout after 90 seconds
        var timeout = setTimeout(function() {
            if (scrapeBtn.disabled) {
                scrapeStatus.classList.add('hidden');
                scrapeProgress.classList.remove('active');
                scrapeBtn.disabled = false;
                scrapeBtn.textContent = '🔍 Extract Info';
                showMessage('Request timed out. The website may be slow to respond. Try again.', 'error');
            }
        }, 90000);

        fetch('/api/v1/scrape-website', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url })
        })
        .then(function(r) { return r.json(); })
        .then(function(resp) {
            if (resp.status !== 'scraped' || !resp.text) {
                throw new Error(resp.error || 'Scraping failed: no text returned');
            }
            // AI extraction is now done client-side via WebLLM
            return window.WebLLMHelper.scrapeWebsite(resp.url || url, resp.text);
        })
        .then(function(data) {
            clearTimeout(timeout);
            if (data.status === 'success') {
                scrapeProgress.classList.remove('active');
                scrapeStatusText.textContent = '✓ Extracted! Saving profile...';
                populateForm(data.fields);
                autoSaveProfile(data.fields);
                showMessage('✅ Website data extracted, saved to your profile, and auto-filled! Click AI Auto-Fill when applying.', 'success');
                setTimeout(function() { scrapeStatus.classList.add('hidden'); }, 2000);
            } else {
                throw new Error(data.error || 'Scraping failed');
            }
        })
        .catch(function(err) {
            clearTimeout(timeout);
            scrapeProgress.classList.remove('active');
            scrapeStatusText.textContent = '✗ ' + err.message;
            showMessage('Website scraping failed: ' + err.message, 'error');
            setTimeout(function() { scrapeStatus.classList.add('hidden'); }, 5000);
        })
        .finally(function() {
            scrapeBtn.disabled = false;
            scrapeBtn.textContent = '🔍 Extract Info';
        });
    });

    function autoSaveProfile(scrapeFields) {
        // Merge scraped fields with existing profile data
        var existing = loadProfileFromStorage() || {};
        var profile = {
            organization_name: scrapeFields.organization_name || existing.organization_name,
            organization_type: scrapeFields.organization_type || existing.organization_type,
            organization_mission: scrapeFields.organization_mission || existing.organization_mission,
            expertise: scrapeFields.expertise || existing.expertise,
            past_projects: scrapeFields.past_projects || existing.past_projects,
            contact_name: scrapeFields.contact_name || existing.contact_name,
            title: scrapeFields.title || existing.title,
            email: scrapeFields.email || existing.email,
            phone: scrapeFields.phone || existing.phone,
            address: scrapeFields.address || existing.address,
            website: scrapeFields.website || scrapeUrl.value || existing.website,
            duns: scrapeFields.duns || existing.duns,
            ein: scrapeFields.ein || existing.ein,
            project_description: scrapeFields.project_description || existing.project_description,
            budget: scrapeFields.budget || existing.budget,
            duration: scrapeFields.duration || existing.duration,
            target_population: scrapeFields.target_population || existing.target_population,
            partnerships: scrapeFields.partnerships || existing.partnerships,
            tone: scrapeFields.tone || existing.tone,
            notes: scrapeFields.notes || existing.notes,
        };
        localStorage.setItem('grants_profile', JSON.stringify(profile));
    }

    function saveProfile() {
        var profile = {
            organization_name: document.getElementById('prof_org_name').value,
            organization_type: document.getElementById('prof_org_type').value,
            organization_mission: document.getElementById('prof_org_mission').value,
            expertise: document.getElementById('prof_expertise').value,
            past_projects: document.getElementById('prof_past_projects').value,
            contact_name: document.getElementById('prof_contact_name').value,
            title: document.getElementById('prof_title').value,
            email: document.getElementById('prof_email').value,
            phone: document.getElementById('prof_phone').value,
            address: document.getElementById('prof_address').value,
            website: scrapeUrl.value || document.getElementById('prof_website').value,
            duns: document.getElementById('prof_duns').value,
            ein: document.getElementById('prof_ein').value,
            project_description: document.getElementById('prof_project_desc').value,
            budget: document.getElementById('prof_budget').value,
            duration: document.getElementById('prof_duration').value,
            target_population: document.getElementById('prof_population').value,
            partnerships: document.getElementById('prof_partnerships').value,
            tone: document.getElementById('prof_tone').value,
            notes: document.getElementById('prof_notes').value,
        };

        localStorage.setItem('grants_profile', JSON.stringify(profile));
        showMessage('✅ Profile saved! Your details will now auto-fill when you apply for opportunities.', 'success');
    }

    function populateForm(p) {
        var fields = {
            'prof_org_name': p.organization_name,
            'prof_org_type': p.organization_type,
            'prof_org_mission': p.organization_mission,
            'prof_expertise': p.expertise,
            'prof_past_projects': p.past_projects,
            'prof_contact_name': p.contact_name,
            'prof_title': p.title,
            'prof_email': p.email,
            'prof_phone': p.phone,
            'prof_address': p.address,
            'prof_duns': p.duns,
            'prof_ein': p.ein,
            'prof_project_desc': p.project_description,
            'prof_budget': p.budget,
            'prof_duration': p.duration,
            'prof_population': p.target_population,
            'prof_partnerships': p.partnerships,
            'prof_tone': p.tone,
            'prof_notes': p.notes,
        };
        for (var id in fields) {
            var el = document.getElementById(id);
            var value = fields[id];
            if (el && value && value !== '') el.value = value;
        }
        if (p.website && !scrapeUrl.value) scrapeUrl.value = p.website;
    }

    function showMessage(text, type) {
        msgEl.textContent = text;
        msgEl.className = 'profile-message ' + type;
        msgEl.style.display = 'block';
        if (type === 'success' || type === 'error') {
            setTimeout(function() { msgEl.style.display = 'none'; }, 5000);
        }
    }
});
