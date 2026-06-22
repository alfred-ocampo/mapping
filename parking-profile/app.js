(function () {
    'use strict';


    const STORAGE_KEY = 'parking-profile-recent';
    const MAX_RECENT = 8;
    const GEMINI_URL = 'https://gemini.google.com/app';

    const PROMPT_TEMPLATE = `Conduct comprehensive research on the parking facility listed below and create a detailed parking asset profile.

**FACILITY NAME:** 
{FACILITY_NAME}

**ADDRESS:** 
{ADDRESS}

**RESEARCH REQUIREMENTS**

- Use only verifiable public sources.
- Cite each data point with a source and include URLs
- Do not estimate or assume information.
- Create a fact-checked, structured operational profile of this parking facility.
- Prioritize accuracy over completeness.
- If information cannot be verified, return "Unknown".
- Separate confirmed information from inferred information.
- Use verifiable public data only, including official parking operator sites, Google Maps listings, municipal records, and parking technology vendor information.
- Cross-reference operator websites, Google Maps, parking apps, satellite imagery, Street View imagery, operator documents, rate boards, permit portals, and public records when available.
- Include the date each item was verified.

**OUTPUT FORMAT**

- Return the results in a structured table.

**PROPERTY INFORMATION**

- Location Name
- Operator Name
- Complete Official Address
- Is Gated?
- Revenue Control Systems (e.g., Digital Payment Technologies, Amano McGann, etc)
- Access Control Systems
- Number of Entry and Exit Lanes
- Main Access Point Address
- Main Access Point Type
- Main Access Point Entry and Exit Lanes
- Main Access Point Coordinates
- Parking Facility Type (e.g., Commercial, Airport, Hotel, Restaurant etc.)
- Location Layout (e.g., Surface Lot, Indoor Garage, Below Ground Garage, Above Ground Garage etc.,)
- Parking Service Type (e.g., Self Park, Valet etc.,)
- Total Capacity
- EV Only Capacity
- Has Vehicle Charging
- Has LPR Cameras
- LPR Camera Brand
- Height Limit
- Hours of Operation
- Phone number
- Payment Accepted (e.g, Cash, Credit, Apple Pay, etc.,)
- Parking Types Supported (e.g., Daily, Monthly, etc.)
- Daily Rates (e.g., Hourly Rates, Special Rates, Weekend Rates etc.)`;

    const form = document.getElementById('profileForm');
    const facilityNameInput = document.getElementById('facilityName');
    const addressInput = document.getElementById('address');
    const searchBtn = document.getElementById('searchBtn');
    const copyPromptBtn = document.getElementById('copyPromptBtn');
    const clearBtn = document.getElementById('clearBtn');
    const statusPanel = document.getElementById('statusPanel');
    const statusContent = document.getElementById('statusContent');

    let toastEl = null;

    function buildPrompt(facilityName, address) {
        return PROMPT_TEMPLATE
            .replaceAll('{FACILITY_NAME}', facilityName.trim())
            .replaceAll('{ADDRESS}', address.trim());
    }

    function getFacility() {
        return {
            name: facilityNameInput.value.trim(),
            address: addressInput.value.trim(),
        };
    }

    function showToast(message) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add('show');
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    function showStatus(message, type) {
        statusPanel.hidden = false;
        statusPanel.className = `panel status-panel status-${type || 'success'}`;
        statusContent.textContent = message;
    }

    function hideStatus() {
        statusPanel.hidden = true;
        statusContent.textContent = '';
    }

    async function copyPrompt(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }

    function openGemini() {
        const geminiWindow = window.open(GEMINI_URL, '_blank', 'noopener,noreferrer');
        if (!geminiWindow) {
            throw new Error('Pop-up blocked. Allow pop-ups for this site, then try again.');
        }
    }

    async function launchGemini() {
        const facility = getFacility();

        if (!facility.name || !facility.address) {
            showStatus('Enter both a facility name and address.', 'error');
            return;
        }

        const prompt = buildPrompt(facility.name, facility.address);

        try {
            await copyPrompt(prompt);
            openGemini();
            saveRecent(facility);
            showStatus(
                'Gemini opened in a new tab and the prompt was copied. Paste with ⌘V / Ctrl+V and press Enter to run the query.',
                'success'
            );
            showToast('Prompt copied — paste in Gemini');
        } catch (err) {
            showStatus(err.message || 'Could not copy the prompt. Use "Copy prompt only" and open Gemini manually.', 'error');
        }
    }

    function saveRecent(facility) {
        let recent = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        recent = recent.filter((entry) => entry.name !== facility.name || entry.address !== facility.address);
        recent.unshift({ ...facility, ts: Date.now() });
        recent = recent.slice(0, MAX_RECENT);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    }

    async function copyPromptOnly() {
        const facility = getFacility();

        if (!facility.name || !facility.address) {
            showStatus('Enter both a facility name and address.', 'error');
            return;
        }

        try {
            await copyPrompt(buildPrompt(facility.name, facility.address));
            showStatus('Prompt copied to clipboard.', 'success');
            showToast('Prompt copied');
        } catch {
            showStatus('Could not copy the prompt. Select and copy manually from the form fields.', 'error');
        }
    }

    function clearForm() {
        facilityNameInput.value = '';
        addressInput.value = '';
        hideStatus();
        facilityNameInput.focus();
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        launchGemini();
    });

    copyPromptBtn.addEventListener('click', copyPromptOnly);
    clearBtn.addEventListener('click', clearForm);
})();
