(function () {
    'use strict';


    const STORAGE_KEY = 'parking-profile-recent';
    const MAX_RECENT = 8;
    const GEMINI_URL = 'https://gemini.google.com/app';

    const PROMPT_TEMPLATE = `Provide a comprehensive parking facility profile for **{FACILITY_NAME}** located at **{ADDRESS}**.

The output must be suitable for:

- Parking marketplace listings (SpotHero, ParkWhiz, BestParking, Parkopedia)
- Internal parking databases
- API ingestion
- GIS mapping
- Access control integration
- Revenue management systems

## **Research Requirements**

1. Use official sources whenever available:
    - Facility website
    - Operator website
    - Google Maps
    - Street View
    - Property management documents
    - Parking operator documentation
2. Do not estimate values.
3. If information cannot be verified, return:
    - \`Unknown\`
    - \`Not Publicly Available\`
4. Include source references for every field.
5. Include confidence level:
    - High
    - Medium
    - Low

---

# **Facility Identification**

| **Field** | **Value** |
| --- | --- |
| Location Name |  |
| Alternate Names |  |
| Facility ID (if available) |  |
| Property Name |  |
| Operator Name |  |
| Management Company |  |
| Facility Website |  |
| Facility Phone Number |  |
| Facility Email |  |

---

# **Address Information**

| **Field** | **Value** |
| --- | --- |
| Complete Official Address |  |
| City |  |
| State |  |
| ZIP Code |  |
| Country |  |
| Latitude |  |
| Longitude |  |
| Parcel / Building Name |  |

---

# **Facility Classification**

| **Field** | **Value** |
| --- | --- |
| Parking Facility Type |  |
| Location Layout |  |
| Parking Service Type |  |
| Self-Park or Valet |  |
| Public or Private |  |
| Monthly Parking Available |  |
| Event Parking Available |  |
| Reserved Parking Available |  |

Allowed values:

### **Parking Facility Type**

- Garage
- Surface Lot
- Underground Garage
- Mixed Use
- Mechanical Parking
- Residential Garage
- Office Garage
- Hotel Garage
- Hospital Garage
- Airport Parking
- Other

### **Location Layout**

- Single Structure
- Multi-Level
- Underground
- Surface
- Mixed

### **Parking Service Type**

- Transient
- Monthly
- Permit
- Residential
- Employee
- Mixed

---

# **Capacity Information**

| **Field** | **Value** |
| --- | --- |
| Total Capacity |  |
| Public Capacity |  |
| Reserved Capacity |  |
| Monthly Capacity |  |
| ADA Capacity |  |
| EV Only Capacity |  |
| Motorcycle Capacity |  |
| Oversized Vehicle Capacity |  |

---

# **Access Control**

| **Field** | **Value** |
| --- | --- |
| Is Gated |  |
| Access Control System |  |
| Revenue Control System |  |
| Revenue Control Vendor |  |
| LPR Cameras Present |  |
| LPR Vendor |  |
| Ticket Dispenser Present |  |
| QR Code Entry Supported |  |
| Mobile App Entry Supported |  |
| RFID Supported |  |
| Barcode Entry Supported |  |

---

# **Lane Configuration**

| **Field** | **Value** |
| --- | --- |
| Number of Entry Lanes |  |
| Number of Exit Lanes |  |
| Reversible Lanes |  |
| Dedicated Monthly Lanes |  |
| Dedicated Visitor Lanes |  |

---

# **Access Point Inventory**

For every entrance and exit, provide:

| **Field** | **Value** |
| --- | --- |
| Access Point Name |  |
| Access Point Type |  |
| Entry / Exit / Both |  |
| Access Address |  |
| Latitude |  |
| Longitude |  |
| Number of Entry Lanes |  |
| Number of Exit Lanes |  |
| Gate Type |  |
| Clearance Height |  |
| Notes |  |

---

# **Vehicle Restrictions**

| **Field** | **Value** |
| --- | --- |
| Height Restricted |  |
| Maximum Height |  |
| Maximum Vehicle Length |  |
| Maximum Vehicle Width |  |
| Weight Restriction |  |
| Oversized Vehicles Allowed |  |
| Trailer Parking Allowed |  |
| Motorcycle Parking Allowed |  |

---

# **EV Infrastructure**

| **Field** | **Value** |
| --- | --- |
| Has Vehicle Charging |  |
| Charging Network |  |
| Number of Chargers |  |
| Charger Types |  |
| Fast Charging Available |  |

---

# **Payment Information**

| **Field** | **Value** |
| --- | --- |
| Payment Methods Accepted |  |
| Cash Accepted |  |
| Credit Cards Accepted |  |
| Mobile Payments Accepted |  |
| Validation Available |  |
| Monthly Billing Available |  |

---

# **Operating Information**

| **Field** | **Value** |
| --- | --- |
| Hours of Operation |  |
| Overnight Parking Allowed |  |
| Attendant On Site |  |
| Security Presence |  |
| Security Cameras |  |
| Emergency Contact Number |  |

---

# **Parking Types Supported**

Return all that apply:

- Transient
- Hourly
- Daily
- Monthly
- Event
- Hotel Guest
- Residential
- Employee
- Visitor
- Reserved
- Valet
- ADA
- EV Charging
- Motorcycle

---

# **Amenities**

| **Field** | **Value** |
| --- | --- |
| ADA Accessible |  |
| Elevator Access |  |
| Stair Access |  |
| Restrooms Available |  |
| Covered Parking |  |
| Lighting Quality |  |
| Wayfinding Signage |  |

---

# **Data Quality Section**

| **Field** | **Value** |
| --- | --- |
| Information Confidence |  |
| Last Verified Date |  |
| Data Sources Used |  |
| Missing Information |  |

---

# **Output Requirements**

1. Return results in structured JSON and a readable table.
2. Include exact coordinates for every access point.
3. Identify likely revenue-control and access-control vendors if visible from imagery.
4. Separate verified facts from inferred observations.
5. Include source links and citations for every major data point.`;

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
