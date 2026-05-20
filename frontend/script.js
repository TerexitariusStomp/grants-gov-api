// Grants Opportunity Finder Frontend
document.addEventListener('DOMContentLoaded', function() {
    // API Configuration
    const API_BASE = '/api/v1';
    const OPPORTUNITIES_ENDPOINT = `${API_BASE}/opportunities/`;

    // DOM Elements
    const searchForm = document.getElementById('search-form');
    const queryInput = document.getElementById('query');
    const agencyInput = document.getElementById('agency');
    const categoryInput = document.getElementById('category');
    const limitSelect = document.getElementById('limit');
    const opportunitiesList = document.getElementById('opportunities-list');
    const resultsCount = document.getElementById('results-count');
    const sortBySelect = document.getElementById('sort-by');
    const pagination = document.getElementById('pagination');
    const applicationModal = document.getElementById('application-modal');
    const closeModalButtons = document.querySelectorAll('.close-modal, .close-preview');
    const applicationForm = document.getElementById('application-form');
    const applicationPreview = document.getElementById('application-preview');
    const opportunityDetails = document.getElementById('opportunity-details');
    const applicationContent = document.getElementById('application-content');
    const projectInfoForm = document.getElementById('project-info-form');
    const projectInfoSection = document.getElementById('project-info-section');
    const aiGenerating = document.getElementById('ai-generating');

    // State
    let currentPage = 1;
    let opportunities = [];
    let totalOpportunities = 0;
    let selectedOpportunity = null;

    // Event Listeners
    searchForm.addEventListener('submit', handleSearch);
    sortBySelect.addEventListener('change', handleSearch);
    closeModalButtons.forEach(btn => btn.addEventListener('click', closeModal));
    applicationForm.addEventListener('submit', generateApplication);

    // AI Autofill button click handler
    const aiAutofillBtn = document.getElementById('ai-autofill-btn');
    if (aiAutofillBtn) {
        aiAutofillBtn.addEventListener('click', () => {
            if (window.WebLLMHelper) {
                window.aiAutofillApplication();
            } else {
                alert('WebLLM not loaded. Please refresh and wait for AI model to load.');
            }
        });
    }

    // AI Sort button click handler
    const aiSortBtn = document.getElementById('ai-sort-btn');
    if (aiSortBtn) {
        aiSortBtn.addEventListener('click', handleAISort);
    }

    if (projectInfoForm) projectInfoForm.addEventListener('submit', aiGenerateApplication);
    window.addEventListener('click', (e) => {
        if (e.target === applicationModal) closeModal();
    });

    // Initialize
    // fetchOpportunities();

    function handleSearch(e) {
        if (e) e.preventDefault();
        currentPage = 1;
        fetchOpportunities();
    }

    async function fetchOpportunities() {
        try {
            const params = new URLSearchParams({
                query: queryInput.value,
                agency: agencyInput.value,
                category: categoryInput.value,
                limit: limitSelect.value,
                page: currentPage
            });

            const response = await fetch(`${OPPORTUNITIES_ENDPOINT}?${params.toString()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            opportunities = data.results || data;
            totalOpportunities = data.count || (data.results || []).length;

            const sortBy = sortBySelect.value;
            opportunities.sort((a, b) => {
                if (sortBy === 'close_date_asc') return new Date(a.close_date) - new Date(b.close_date);
                if (sortBy === 'close_date_desc') return new Date(b.close_date) - new Date(a.close_date);
                return 0;
            });

            renderOpportunities();
            renderPagination();
            updateResultsCount();
        } catch (error) {
            console.error('Error fetching opportunities:', error);
            opportunitiesList.innerHTML = `<div class="error">Error fetching opportunities.</div>`;
        }
    }

    // AI Sort using WebLLM - runs entirely in browser
    async function handleAISort() {
        if (!window.WebLLMHelper) {
            alert('WebLLM not available. Please refresh the page.');
            return;
        }

        if (!opportunities.length) {
            alert('Please search for grants first.');
            return;
        }

        // Get user profile for context
        const profile = loadProfile();
        const userProfile = profile ? 
            `${profile.organization_type || 'Organization'} - ${profile.organization_mission || ''}. Expertise: ${profile.expertise_areas || ''}` : 
            null;

        // Show progress UI
        const progress = document.getElementById('ai-sort-progress');
        const status = document.getElementById('ai-sort-status');
        const btn = document.getElementById('ai-sort-btn');
        progress.classList.remove('hidden');
        btn.disabled = true;
        btn.textContent = '🤖 AI Sorting...';

        try {
            status.textContent = 'Initializing AI model (first time may take 30-60s)...';
            
            // Sort with WebLLM
            const sorted = await window.WebLLMHelper.aiSortGrants(opportunities, userProfile);
            
            // Update opportunities with scores
            opportunities = sorted;
            
            // Re-render with scores displayed
            renderOpportunitiesWithScores();
            
            status.textContent = '✅ AI sorting complete!';
            setTimeout(() => {
                progress.classList.add('hidden');
            }, 2000);
            
            btn.disabled = false;
            btn.textContent = '🤖 AI Sort by Relevance';
            
        } catch (error) {
            console.error('AI sort failed:', error);
            alert('AI sorting failed: ' + error.message + '. You can still use manual sorting.');
            progress.classList.add('hidden');
            btn.disabled = false;
            btn.textContent = '🤖 AI Sort by Relevance';
        }
    }

    function renderOpportunitiesWithScores() {
        if (!opportunities.length) {
            opportunitiesList.innerHTML = `<div class="no-opportunities"><h3>No opportunities found</h3><p>Try adjusting your search</p></div>`;
            return;
        }

        opportunitiesList.innerHTML = opportunities.map(o => {
            const score = o.ai_score || 50;
            const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444';
            const scoreBadge = `<span style="display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border-radius:50%;background:${scoreColor};color:white;font-weight:700;font-size:0.875rem;margin-left:0.5rem;" title="${o.ai_reason || 'Score: ' + score}">${score}</span>`;
            
            return `
            <div class="opportunity-card" data-id="${o.opportunity_number || o.id}">
                <h3 class="opportunity-title">${escapeHtml(o.title)}${scoreBadge}</h3>
                ${o.ai_reason ? `<p class="ai-score-reason">💡 ${escapeHtml(o.ai_reason)}</p>` : ''}
                <div class="opportunity-meta">
                    <div class="meta-item">🏛️ ${escapeHtml(o.agency)}</div>
                    <div class="meta-item">📁 ${escapeHtml(o.category || 'General')}</div>
                    <div class="meta-item">📅 Closes: ${formatDate(o.close_date)}</div>
                    <div class="meta-item">💰 Ceiling: ${escapeHtml(o.award_ceiling || 'Not specified')}</div>
                </div>
                <p class="opportunity-description">${escapeHtml(truncateText(o.description || 'No description available', 200))}</p>
                <div class="opportunity-actions">
                    <button class="view-details" data-id="${o.opportunity_number || o.id}">View Details</button>
                </div>
            </div>
        `}).join('');

        // Attach event listeners
        document.querySelectorAll('.view-details').forEach(btn => {
            btn.addEventListener('click', function() {
                showOpportunityDetails(this.getAttribute('data-id'));
            });
        });
    }

    function renderOpportunities() {
        if (!opportunities.length) {
            opportunitiesList.innerHTML = `<div class="no-opportunities"><h3>No opportunities found</h3><p>Try adjusting your search</p></div>`;
            return;
        }
        opportunitiesList.innerHTML = opportunities.map(o => `
            <div class="opportunity-card" data-id="${o.opportunity_number || o.id}">
                <h3 class="opportunity-title">${escapeHtml(o.title)}</h3>
                <div class="opportunity-meta">
                    <div class="meta-item">🏛️ ${escapeHtml(o.agency)}</div>
                    <div class="meta-item">📁 ${escapeHtml(o.category || 'General')}</div>
                    <div class="meta-item">📅 Closes: ${formatDate(o.close_date)}</div>
                    <div class="meta-item">💰 Ceiling: ${escapeHtml(o.award_ceiling || 'Not specified')}</div>
                </div>
                <p class="opportunity-description">${escapeHtml(truncateText(o.description || 'No description available', 200))}</p>
                <div class="opportunity-actions">
                    <button class="view-details" data-id="${o.opportunity_number || o.id}">View Details</button>
                </div>
            </div>
        `).join('');

        // Attach event listeners to View Details buttons
        document.querySelectorAll('.view-details').forEach(btn => {
            btn.addEventListener('click', function() {
                showOpportunityDetails(this.getAttribute('data-id'));
            });
        });
    }

    function renderPagination() {
        const pageSize = parseInt(limitSelect.value);
        const totalPages = Math.ceil(totalOpportunities / pageSize);
        if (totalPages <= 1) { pagination.innerHTML = ''; return; }
        let html = '';
        if (currentPage > 1) html += `<button class="pagination-button" onclick="changePage(${currentPage - 1})">Previous</button>`;
        html += `<span class="current-page">Page ${currentPage}</span>`;
        if (currentPage < totalPages) html += `<button class="pagination-button" onclick="changePage(${currentPage + 1})">Next</button>`;
        pagination.innerHTML = html;
    }

    function updateResultsCount() {
        resultsCount.textContent = totalOpportunities;
    }

    window.changePage = function(page) {
        currentPage = page;
        fetchOpportunities();
    };

    // ── Modal & Application ──

    function openModal() {
        applicationModal.classList.add('active');
        // Load profile data into the project info form
        loadProfileIntoModal();
    }

    function loadProfileIntoModal() {
        const profile = loadProfile();
        const hint = document.getElementById('project-info-hint');
        if (!profile) {
            if (hint) hint.textContent = 'Tell us about your project so AI can auto-fill the application, or save your profile for auto-fill next time.';
            return;
        }

        // Pre-fill project info form from profile
        const el = (id) => document.getElementById(id);
        if (el('org_name') && profile.organization_name) el('org_name').value = profile.organization_name;
        if (el('org_type') && profile.organization_type) el('org_type').value = profile.organization_type;
        if (el('org_mission') && profile.organization_mission) el('org_mission').value = profile.organization_mission;
        if (el('project_description') && profile.project_description) el('project_description').value = profile.project_description;
        if (el('target_budget') && profile.target_budget) el('target_budget').value = profile.target_budget;
        if (el('project_duration') && profile.project_duration) el('project_duration').value = profile.project_duration;
        if (el('target_population') && profile.target_population) el('target_population').value = profile.target_population;
        if (el('key_partnerships') && profile.key_partnerships) el('key_partnerships').value = profile.key_partnerships;

        // Pre-fill contact info on the application form
        if (el('organization_name') && profile.organization_name) el('organization_name').value = profile.organization_name;
        if (el('contact_person') && profile.contact_name) el('contact_person').value = profile.contact_name;
        if (el('email') && profile.email) el('email').value = profile.email;
        if (el('phone') && profile.phone) el('phone').value = profile.phone;
        if (el('address') && profile.address) el('address').value = profile.address;

        // Always keep the project info form visible - let user click AI button
        if (hint) hint.textContent = '✅ Profile loaded! Click "AI Auto-Fill Application" to generate, or edit the fields below first.';
        // Keep form visible, don't auto-generate
    }

    function closeModal() {
        applicationModal.classList.remove('active');
        if (projectInfoSection) projectInfoSection.classList.remove('hidden');
        if (applicationForm) applicationForm.classList.add('hidden');
        if (aiGenerating) aiGenerating.classList.remove('visible');
    }

    function loadProfile() {
        const data = localStorage.getItem('grants_profile');
        if (!data) {
            console.log('[profile] No saved profile found in localStorage');
            return null;
        }
        try {
            const profile = JSON.parse(data);
            console.log('[profile] Loaded profile:', profile.organization_name);
            return profile;
        } catch(e) {
            console.error('[profile] Failed to parse profile:', e);
            return null;
        }
    }

    window.skipToApplication = function() {
        document.getElementById('project-info-section').classList.add('hidden');
        document.getElementById('application-form').classList.remove('hidden');
    };

    // Show the application form to the user directly
    window.showProjectInfoForAI = function() {
        // Load profile into the project info form
        loadProfileIntoModal();
        projectInfoSection.classList.remove('hidden');
        applicationForm.classList.add('hidden');
    };

    // Toggle showing/hiding the full opportunity description
    window.toggleOpportunityDescription = function() {
        const descDiv = document.getElementById('opportunity-full-description');
        const btn = document.querySelector('.toggle-description');
        if (descDiv.classList.contains('hidden')) {
            descDiv.classList.remove('hidden');
            btn.textContent = '📋 Hide Opportunity Description';
        } else {
            descDiv.classList.add('hidden');
            btn.textContent = '📋 Show Opportunity Description';
        }
    };

    function loadProfileIntoForm() {
        const profile = loadProfile();
        if (!profile) return;
        const el = (id) => document.getElementById(id);
        if (el('organization_name') && profile.organization_name) el('organization_name').value = profile.organization_name;
        if (el('contact_person') && profile.contact_person) el('contact_person').value = profile.contact_person;
        if (el('email') && profile.email) el('email').value = profile.email;
        if (el('phone') && profile.phone) el('phone').value = profile.phone;
        if (el('address') && profile.address) el('address').value = profile.address;
    }

    window.showOpportunityDetails = async function(opportunityId) {
        // Find in current results or fallback
        let opp = opportunities.find(o => (o.opportunity_number || o.id) === opportunityId) ||
                  opportunities.find(o => o.id === opportunityId || String(o.id) === opportunityId);

        // Always fetch from detail endpoint to ensure we have the full description
        try {
            const resp = await fetch(`/api/v1/opportunities/${encodeURIComponent(opportunityId)}`);
            if (resp.ok) {
                opp = await resp.json();
            }
        } catch(e) { console.warn('Could not fetch detail:', e); }
        
        // If still not found but has a description from search results, use it
        if (!opp) { alert('Opportunity not found'); return; }

        selectedOpportunity = opp;
        renderOpportunityDetails(opp);

        // Show the application form directly (hide step 1 project info section)
        if (projectInfoSection) projectInfoSection.classList.add('hidden');
        document.getElementById('application-form').classList.remove('hidden');
        if (aiGenerating) aiGenerating.classList.remove('visible');
        loadProfileIntoForm();

        openModal();
    };

    window.openApplicationModal = async function(opportunityId) {
        // Find in current results or fetch
        let opp = opportunities.find(o => o.opportunity_number === opportunityId || String(o.opportunity_number || o.id) === opportunityId);

        if (!opp) {
            try {
                const resp = await fetch(`/api/v1/opportunities/${encodeURIComponent(opportunityId)}`);
                if (resp.ok) {
                    opp = await resp.json();
                } else {
                    alert('Could not find opportunity');
                    return;
                }
            } catch(e) {
                console.error(e);
                alert('Error loading opportunity');
                return;
            }
        }

        selectedOpportunity = opp;
        renderOpportunityDetails(opp);
        openModal();

        // Show the form (don't auto-generate — wait for manual AI button click)
        const appForm = document.getElementById('application-form');
        if (appForm) appForm.classList.remove('hidden');

        loadProfileIntoForm();

        // Reset the AI autofill button state
        const aiBtn = document.getElementById('ai-autofill-btn');
        const aiStatus = document.getElementById('ai-autofill-status');
        if (aiBtn) {
            aiBtn.style.display = '';
            aiBtn.disabled = false;
            aiBtn.textContent = '\uD83E\uDD16 Autofill with AI';
        }
        if (aiStatus) {
            aiStatus.style.display = 'none';
        }

        // Clear form fields so they're blank until user clicks autofill
        ['organization_name', 'contact_person', 'email', 'phone', 'address',
         'project_summary', 'budget', 'narrative', 'goals', 'timeline',
         'evaluation', 'sustainability', 'budget_breakdown', 'additional_info'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    };
    function renderOpportunityDetails(opp) {
        opportunityDetails.innerHTML = `
            <h2>${escapeHtml(opp.title)}</h2>
            <div class="opportunity-meta">
                <div class="meta-item"><strong>Agency:</strong> ${escapeHtml(opp.agency)}</div>
                <div class="meta-item"><strong>Category:</strong> ${escapeHtml(opp.category || 'General')}</div>
                <div class="meta-item"><strong>Number:</strong> ${escapeHtml(opp.opportunity_number)}</div>
                <div class="meta-item"><strong>Closes:</strong> ${formatDate(opp.close_date)}</div>
                <div class="meta-item"><strong>Ceiling:</strong> ${escapeHtml(opp.award_ceiling || 'Not specified')}</div>
                <div class="meta-item"><strong>Status:</strong> <span class="status-badge ${opp.status}">${escapeHtml(opp.status || 'posted')}</span></div>
            </div>
        `;

        // Show the description directly (strip HTML and render as plain text)
        const descDiv = document.getElementById('opportunity-description-text');
        if (descDiv && opp.description) {
            // Strip HTML tags
            const tmp = document.createElement('div');
            tmp.innerHTML = opp.description;
            let clean = tmp.textContent || tmp.innerText || '';
            // Clean up extra whitespace
            clean = clean.replace(/\n{3,}/g, '\n\n').trim();
            descDiv.textContent = clean;
        } else if (descDiv) {
            descDiv.textContent = '';
        }
    }

    // ── AI Autofill Application (WebLLM — browser only, no API key) ──
    window.aiAutofillApplication = async function() {
        if (!selectedOpportunity) {
            alert('Please select an opportunity first.');
            return;
        }

        if (!window.WebLLMHelper || !window.WebLLMHelper.isReady()) {
            alert('WebLLM is still loading. Please wait a moment and try again.');
            return;
        }

        const aiBtn   = document.getElementById('ai-autofill-btn');
        const aiStatus = document.getElementById('ai-autofill-status');
        const profile  = loadProfile();

        if (!profile || !profile.project_description) {
            showAiStatus('⚠️ No profile found. Results will be generic — save your profile first for personalized applications.', 'warning');
        } else {
            showAiStatus('🤖 Reading your profile and opportunity details...', 'info');
        }

        aiBtn.classList.add('generating');
        aiBtn.disabled = true;
        aiBtn.innerHTML = '<span class="spinner"></span> Generating your application...';
        showAiStatus('🤖 AI is writing your application based on the opportunity description and your profile.', 'info');

        try {
            const data = await window.WebLLMHelper.aiAutofillApplication(selectedOpportunity, profile || {});

            if (data.status !== 'success' || !data.fields) {
                throw new Error(data.error || 'No fields in AI response');
            }

            populateApplicationForm(data.fields);

            // Pre-fill contact info from profile
            if (profile) {
                const fieldMap = {
                    organization_name: 'organization_name',
                    contact_name: 'contact_person',
                    contact_person: 'contact_person',
                    email: 'email',
                    phone: 'phone',
                    address: 'address',
                };
                for (const [profileKey, fieldId] of Object.entries(fieldMap)) {
                    const val = profile[profileKey];
                    if (val) {
                        const el = document.getElementById(fieldId);
                        if (el && !el.value) el.value = val;
                    }
                }
            }

            // Fill budget from profile if AI left it blank
            if (profile && profile.target_budget) {
                const budgetEl = document.getElementById('budget');
                if (budgetEl && !budgetEl.value) {
                    budgetEl.value = profile.target_budget;
                }
            }

            showAiStatus('✅ Application auto-filled with AI! Review each field below and edit as needed before submitting.', 'success');
            aiBtn.classList.remove('generating');
            aiBtn.disabled = false;
            aiBtn.textContent = '🤖 Regenerate with AI';
        } catch (error) {
            console.error('AI autofill failed:', error);
            showAiStatus('❌ AI generation failed: ' + error.message + '. You can fill in the fields manually below.', 'error');
            aiBtn.classList.remove('generating');
            aiBtn.disabled = false;
            aiBtn.textContent = '🤖 Try Again';
        }
    };

    function showAiStatus(message, type) {
        const el = document.getElementById('ai-autofill-status');
        if (!el) return;
        // Force display with !important equivalent via setAttribute for style
        el.style.setProperty('display', 'block', 'important');
        // Set classes explicitly
        el.classList.remove('info', 'success', 'warning', 'error');
        el.classList.add(type);
        el.textContent = message;
    }

    // ── AI Generate (project info step) — WebLLM browser-only ──

    async function aiGenerateApplication(e) {
        e.preventDefault();

        if (!selectedOpportunity) {
            alert('Please select an opportunity first.');
            return;
        }

        if (!window.WebLLMHelper || !window.WebLLMHelper.isReady()) {
            alert('WebLLM is still loading. Please wait a moment and try again.');
            return;
        }

        // Collect form data from the project info step
        const formData = {
            organization_name:     document.getElementById('org_name').value,
            organization_type:     document.getElementById('org_type').value,
            organization_mission:  document.getElementById('org_mission').value,
            project_description:   document.getElementById('project_description').value,
            target_budget:         document.getElementById('target_budget').value,
            project_duration:      document.getElementById('project_duration').value,
            target_population:     document.getElementById('target_population').value,
            key_partnerships:      document.getElementById('key_partnerships').value,
        };

        if (!formData.project_description) {
            alert('Please describe your project.');
            return;
        }

        // Merge form inputs with saved profile — form fields take priority,
        // saved profile fills in extras (expertise_areas, past_projects, etc.)
        const savedProfile = loadProfile() || {};
        const combinedProfile = {
            ...savedProfile,
            organization_name:   formData.organization_name   || savedProfile.organization_name   || '',
            organization_type:   formData.organization_type   || savedProfile.organization_type   || 'nonprofit',
            organization_mission:formData.organization_mission|| savedProfile.organization_mission || '',
            project_description: formData.project_description  || savedProfile.project_description  || '',
            target_budget:       formData.target_budget        || savedProfile.target_budget        || '',
            project_duration:    formData.project_duration     || savedProfile.project_duration     || '',
            target_population:   formData.target_population    || savedProfile.target_population    || '',
            key_partnerships:    formData.key_partnerships     || savedProfile.key_partnerships     || '',
            expertise_areas:     savedProfile.expertise_areas  || '',
            past_projects:       savedProfile.past_projects    || '',
        };

        // Show loading
        projectInfoSection.classList.add('hidden');
        aiGenerating.classList.add('visible');

        try {
            const data = await window.WebLLMHelper.aiAutofillApplication(selectedOpportunity, combinedProfile);

            if (data.status !== 'success' || !data.fields) {
                throw new Error(data.error || 'No fields in AI response');
            }

            populateApplicationForm(data.fields);
            populateContactFieldsFromProfile(combinedProfile);
            aiGenerating.classList.remove('visible');
            applicationForm.classList.remove('hidden');
        } catch (error) {
            console.error('AI generation failed:', error);
            aiGenerating.classList.remove('visible');
            projectInfoSection.classList.remove('hidden');
            alert('AI generation failed: ' + error.message);
        }
    }

    // Try to auto-generate when the application modal opens (if profile exists)
    async function tryAutoGenerate() {
        const profile = loadProfile();
        if (!profile) return;

        showProfileMessage('Profile loaded. Generating application...', 'info');

        const projectInfo = {
            organization_name: profile.organization_name || '',
            organization_type: profile.organization_type || '',
            organization_mission: profile.organization_mission || '',
            project_description: profile.project_description || '',
            target_budget: profile.target_budget || '',
            project_duration: profile.project_duration || '',
            target_population: profile.target_population || '',
            key_partnerships: profile.key_partnerships || '',
        };

        // Fill project info section from profile
        if (document.getElementById('org_name')) {
            document.getElementById('org_name').value = projectInfo.organization_name || '';
            document.getElementById('org_type').value = projectInfo.organization_type || 'nonprofit';
            document.getElementById('org_mission').value = projectInfo.organization_mission || '';
            document.getElementById('project_description').value = projectInfo.project_description || '';
            document.getElementById('target_budget').value = projectInfo.target_budget || '';
            document.getElementById('project_duration').value = projectInfo.project_duration || '';
            document.getElementById('target_population').value = projectInfo.target_population || '';
            document.getElementById('key_partnerships').value = projectInfo.key_partnerships || '';
        }

        // Pre-fill contact info on the application form
        if (document.getElementById('organization_name') && profile.organization_name)
            document.getElementById('organization_name').value = profile.organization_name;
        if (document.getElementById('contact_person') && profile.contact_person)
            document.getElementById('contact_person').value = profile.contact_person;
        if (document.getElementById('email') && profile.email)
            document.getElementById('email').value = profile.email;
        if (document.getElementById('phone') && profile.phone)
            document.getElementById('phone').value = profile.phone;
        if (document.getElementById('address') && profile.address)
            document.getElementById('address').value = profile.address;

        // Auto-trigger AI generation if we have enough data
        showProfileMessage('Profile loaded! Click "AI Auto-Fill Application" to generate.', 'success');
    }

    function populateContactFieldsFromProfile(projectInfo) {
        const orgEl = document.getElementById('organization_name');
        if (orgEl && projectInfo.organization_name && !orgEl.value) {
            orgEl.value = projectInfo.organization_name;
        }
    }

    function populateApplicationForm(fields) {
        console.log("[DEBUG] populateApplicationForm called, fields keys:", Object.keys(fields));
        console.log('[DEBUG] populateApplicationForm called with fields:', fields);
        const fieldMap = {
            'project_summary': 'project_summary',
            'project_narrative': 'narrative',
            'narrative': 'narrative',
            'goals_and_objectives': 'goals',
            'goals': 'goals',
            'project_timeline': 'timeline',
            'timeline': 'timeline',
            'evaluation_plan': 'evaluation',
            'evaluation': 'evaluation',
            'sustainability_plan': 'sustainability',
            'sustainability': 'sustainability',
            'budget_breakdown': 'budget_breakdown',
            'additional_info': 'additional_info',
        };

        for (const [fieldKey, elementId] of Object.entries(fieldMap)) {
            const value = fields[fieldKey];
            if (value) {
                const el = document.getElementById(elementId);
                console.log(`[DEBUG] Mapping ${fieldKey} → #${elementId}:`, el ? 'found' : 'MISSING', 'value length:', value.length);
                if (el) el.value = value;
            } else {
                console.log(`[DEBUG] Skipping ${fieldKey}: falsy value`);
            }
        }
    }

    // ── Profile Management ──

    function saveProfile() {
        const profile = {
            organization_name: document.getElementById('prof_org_name').value,
            organization_type: document.getElementById('prof_org_type').value,
            organization_mission: document.getElementById('prof_org_mission').value,
            duns_number: document.getElementById('prof_duns').value,
            contact_person: document.getElementById('prof_contact').value,
            email: document.getElementById('prof_email').value,
            phone: document.getElementById('prof_phone').value,
            address: document.getElementById('prof_address').value,
            project_description: document.getElementById('prof_project_desc').value,
            target_budget: document.getElementById('prof_budget').value,
            project_duration: document.getElementById('prof_duration').value,
            target_population: document.getElementById('prof_population').value,
            key_partnerships: document.getElementById('prof_partnerships').value,
            expertise_areas: document.getElementById('prof_expertise').value,
            past_projects: document.getElementById('prof_past_projects').value,
        };
        localStorage.setItem('grants_profile', JSON.stringify(profile));
        showProfileMessage('Profile saved successfully!', 'success');
    }

    function showProfileMessage(msg, type) {
        const el = document.getElementById('profile-message');
        if (el) {
            el.textContent = msg;
            el.className = `profile-message ${type}`;
            setTimeout(() => { el.textContent = ''; el.className = 'profile-message'; }, 4000);
        }
    }

    // ── Submit Application ──

    async function generateApplication(e) {
        e.preventDefault();

        if (!selectedOpportunity) {
            alert('Please select an opportunity first.');
            return;
        }

        const formData = {
            organization_name: document.getElementById('organization_name').value,
            contact_person: document.getElementById('contact_person').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            project_summary: document.getElementById('project_summary').value,
            budget: document.getElementById('budget').value,
            narrative: document.getElementById('narrative').value,
            goals: document.getElementById('goals').value,
            timeline: document.getElementById('timeline').value,
            evaluation: document.getElementById('evaluation').value,
            sustainability: document.getElementById('sustainability').value,
            budget_breakdown: document.getElementById('budget_breakdown').value,
            additional_info: document.getElementById('additional_info').value
        };

        if (!formData.organization_name || !formData.contact_person || !formData.email || !formData.project_summary || !formData.narrative) {
            alert('Please fill in all required fields.');
            return;
        }

        try {
            const response = await fetch(`/api/v1/applications/`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ opportunity: selectedOpportunity, applicant_info: formData })
            });

            if (!response.ok) throw new Error('Failed to generate application');
            const application = await response.json();
            displayApplication(application);

            // Copy form values into the application for display
            application.applicant_info = formData;
            application.project_summary = formData.project_summary;
            application.project_narrative = formData.narrative;
            application.goals = formData.goals;
            application.timeline = formData.timeline;
            application.evaluation = formData.evaluation;
            application.sustainability = formData.sustainability;
            application.budget_breakdown = formData.budget_breakdown;
            application.additional_info = formData.additional_info;

            displayApplication(application);
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate application. Please try again.');
        }
    }

    function displayApplication(application) {
        applicationContent.innerHTML = `
            <div class="application-header-print">
                <h1>Grant Application</h1>
                <p><strong>Opportunity:</strong> ${selectedOpportunity.title}</p>
                <p><strong>Number:</strong> ${selectedOpportunity.opportunity_number}</p>
                <p><strong>Agency:</strong> ${escapeHtml(selectedOpportunity.agency)}</p>
                <p><strong>Submitted by:</strong> ${escapeHtml(application.applicant_info.organization_name || 'N/A')}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            <div class="application-section"><h2>Executive Summary</h2><p>${escapeHtml(application.project_summary || 'N/A')}</p></div>
            <div class="application-section"><h2>Applicant Information</h2>
                <p><strong>Organization:</strong> ${escapeHtml(application.applicant_info.organization_name || 'N/A')}</p>
                <p><strong>Contact:</strong> ${escapeHtml(application.applicant_info.contact_person || 'N/A')}</p>
                <p><strong>Email:</strong> ${escapeHtml(application.applicant_info.email || 'N/A')}</p>
                <p><strong>Address:</strong> ${escapeHtml(application.applicant_info.address || 'N/A')}</p>
            </div>
            <div class="application-section"><h2>Project Description</h2><p>${escapeHtml(application.project_narrative || application.narrative || 'N/A')}</p></div>
            <div class="application-section"><h2>Goals and Objectives</h2><p>${escapeHtml(application.goals_and_objectives || application.goals || 'N/A')}</p></div>
            <div class="application-section"><h2>Timeline</h2><p>${escapeHtml(application.project_timeline || application.timeline || 'N/A')}</p></div>
            <div class="application-section"><h2>Evaluation Plan</h2><p>${escapeHtml(application.evaluation_plan || application.evaluation || 'N/A')}</p></div>
            <div class="application-section"><h2>Sustainability</h2><p>${escapeHtml(application.sustainability_plan || application.sustainability || 'N/A')}</p></div>
            <div class="application-section"><h2>Budget</h2><p><strong>Total: $${escapeHtml(application.applicant_info.budget || 'N/A')}</strong></p><p>${escapeHtml(application.budget_breakdown || 'N/A')}</p></div>
            <div class="application-section"><h2>Additional Info</h2><p>${escapeHtml(application.additional_info || 'N/A')}</p></div>
            <div class="application-section"><h2>Signature</h2><p>By submitting this application, we certify that the information provided is accurate and complete.</p><br><p>Signature: _________________________</p><p>Date: _______________</p></div>
        `;
        applicationForm.classList.add('hidden');
        applicationPreview.classList.remove('hidden');
    }

    // ── Utilities ──

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDescription(desc) {
        if (!desc) return 'N/A';
        if (typeof desc === 'object') {
            // Handle case where description is a summary object from API
            const text = desc.summary_description || desc.description || '';
            return escapeHtml(text).replace(/\n/g, '<br>');
        }
        return escapeHtml(desc).replace(/\n/g, '<br>');
    }

    // Close modal when clicking outside
    window.onclick = function(event) {
        if (event.target === applicationModal) closeModal();
    };
});
