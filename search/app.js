(function () {
    'use strict';

    const STORAGE_KEY = 'parking-finder-recent';
    const MAX_RECENT = 8;
    const DEBOUNCE_MS = 350;

    const PARKING_SITES = [
        { domain: 'lazparking.com', label: 'LAZ Parking' },
        { domain: 'spplus.com', label: 'SP+' },
        { domain: 'parkopedia.com', label: 'Parkopedia' },
        { domain: 'parkchirp.com', label: 'ParkChirp' },
        { domain: 'spotangels.com', label: 'SpotAngels' },
        { domain: 'parkme.com', label: 'ParkMe' },
        { domain: 'aceparking.com', label: 'Ace Parking' },
        { domain: 'parkmobile.io', label: 'ParkMobile' },
        { domain: 'parking.com', label: 'Parking.com' },
    ];

    const RELATED_KEYWORDS = [
        'garage', 'parking lot', 'surface lot', 'valet', 'metered parking',
        'monthly parking', 'hourly rates', 'event parking', 'airport parking',
        'reservations', 'availability', 'operator', 'facility ID', 'capacity',
    ];

    const SEARCH_GROUPS = [
        {
            title: 'Full facility search',
            searches: [
                {
                    title: 'All details combined',
                    desc: 'Search using facility name, address, city, and state together.',
                    build: (queries) => queries.full
                        ? `https://www.google.com/search?q=${enc(queries.full)}`
                        : null,
                },
                {
                    title: 'Exact facility name',
                    desc: 'Match the facility name as an exact phrase.',
                    build: (queries) => queries.name
                        ? `https://www.google.com/search?q=${enc('"' + queries.name + '"')}`
                        : null,
                },
                {
                    title: 'Name and city/state',
                    desc: 'Facility name narrowed to a city and state.',
                    build: (queries) => queries.nameLocation
                        ? `https://www.google.com/search?q=${enc(queries.nameLocation)}`
                        : null,
                },
                {
                    title: 'Street address lookup',
                    desc: 'Search by street address with city and state.',
                    build: (queries) => queries.addressLocation
                        ? `https://www.google.com/search?q=${enc(queries.addressLocation)}`
                        : null,
                },
            ],
        },
        {
            title: 'On a specific site',
            searches: [
                {
                    title: 'Site search',
                    desc: 'Find pages on the operator\'s website that mention this facility.',
                    build: (queries, site) => site && queries.full
                        ? `https://www.google.com/search?q=site:${cleanDomain(site)}+${enc(queries.full)}`
                        : null,
                },
                {
                    title: 'Facility name on site',
                    desc: 'Pages on the operator site mentioning the facility name.',
                    build: (queries, site) => site && queries.name
                        ? `https://www.google.com/search?q=site:${cleanDomain(site)}+${enc(queries.name)}`
                        : null,
                },
                {
                    title: 'Word in page URL',
                    desc: 'Pages whose URL path contains your facility details.',
                    build: (queries, site) => site && queries.full
                        ? `https://www.google.com/search?q=site:${cleanDomain(site)}+inurl:${enc(queries.full)}`
                        : null,
                },
            ],
        },
        {
            title: 'Across the web',
            searches: [
                {
                    title: 'In page title',
                    desc: 'Pages whose title tag contains the facility name or address.',
                    build: (queries) => queries.primary
                        ? `https://www.google.com/search?q=intitle:${enc(queries.primary)}`
                        : null,
                },
                {
                    title: 'In page content',
                    desc: 'Pages where facility details appear in the body text.',
                    build: (queries) => queries.full
                        ? `https://www.google.com/search?q=intext:${enc(queries.full)}`
                        : null,
                },
                {
                    title: 'All words in content',
                    desc: 'Every term must appear somewhere in the page content.',
                    build: (queries) => queries.full
                        ? `https://www.google.com/search?q=allintext:${enc(queries.full)}`
                        : null,
                },
            ],
        },
        {
            title: 'Maps & locations',
            searches: [
                {
                    title: 'Map results',
                    desc: 'Google map view for this parking facility.',
                    build: (queries) => queries.mapQuery
                        ? `https://www.google.com/search?q=map:${enc(queries.mapQuery)}`
                        : null,
                },
                {
                    title: 'Parking near address',
                    desc: 'Broad search for parking at or near this address.',
                    build: (queries) => queries.addressLocation
                        ? `https://www.google.com/search?q=${enc(queries.addressLocation + ' parking')}`
                        : null,
                },
            ],
        },
    ];

    const form = document.getElementById('searchForm');
    const facilityNameInput = document.getElementById('facilityName');
    const addressInput = document.getElementById('address');
    const cityInput = document.getElementById('city');
    const stateInput = document.getElementById('state');
    const websiteInput = document.getElementById('websiteUrl');
    const sitePresetsEl = document.getElementById('sitePresets');
    const keywordChipsEl = document.getElementById('keywordChips');
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const recentPanel = document.getElementById('recentPanel');
    const recentList = document.getElementById('recentList');
    const clearBtn = document.getElementById('clearBtn');
    const copyAllBtn = document.getElementById('copyAllBtn');
    const openAllBtn = document.getElementById('openAllBtn');

    const facilityInputs = [facilityNameInput, addressInput, cityInput, stateInput];

    let currentUrls = [];
    let debounceTimer = null;
    let toastEl = null;
    let activeExtraTerms = new Set();

    function enc(str) {
        return encodeURIComponent(str.trim()).replace(/%20/g, '+');
    }

    function cleanDomain(url) {
        return url.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    }

    function getFacility() {
        return {
            name: facilityNameInput.value.trim(),
            address: addressInput.value.trim(),
            city: cityInput.value.trim(),
            state: stateInput.value.trim().toUpperCase(),
        };
    }

    function hasFacilityData(facility) {
        return facility.name || facility.address || facility.city || facility.state;
    }

    function buildQueries(facility) {
        const { name, address, city, state } = facility;
        const cityState = [city, state].filter(Boolean).join(' ');
        const location = [city, state].filter(Boolean).join(', ');
        const addressLocation = [address, city, state].filter(Boolean).join(', ');
        const nameLocation = [name, city, state].filter(Boolean).join(' ');
        const core = [name, address, city, state].filter(Boolean).join(' ');
        const extra = [...activeExtraTerms].join(' ');
        const full = [core, extra].filter(Boolean).join(' ');
        const primary = name || address || cityState;
        const mapQuery = addressLocation || nameLocation || cityState;

        return {
            name,
            full,
            primary,
            nameLocation,
            addressLocation,
            mapQuery: [mapQuery, 'parking'].filter(Boolean).join(' '),
        };
    }

    function formatFacilityLabel(facility) {
        if (facility.keywords) return facility.keywords;
        const parts = [facility.name, facility.address, facility.city, facility.state].filter(Boolean);
        return parts.join(', ') || 'Untitled search';
    }

    function buildSearches(facility, website) {
        if (!hasFacilityData(facility)) return [];

        const queries = buildQueries(facility);
        const items = [];

        for (const group of SEARCH_GROUPS) {
            for (const search of group.searches) {
                const url = search.build(queries, website.trim());
                if (url) {
                    items.push({ group: group.title, ...search, url });
                }
            }
        }
        return items;
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

    function renderResults(items) {
        currentUrls = items.map(i => i.url);
        resultsContainer.innerHTML = '';

        if (!items.length) {
            resultsSection.hidden = true;
            return;
        }

        resultsSection.hidden = false;

        const fragment = document.createDocumentFragment();
        let lastGroup = '';

        for (const item of items) {
            if (item.group !== lastGroup) {
                lastGroup = item.group;
                const heading = document.createElement('h3');
                heading.className = 'result-group-title';
                heading.textContent = item.group;
                fragment.appendChild(heading);
            }

            const card = document.createElement('article');
            card.className = 'result-card';

            const body = document.createElement('div');
            body.className = 'result-card-body';

            const title = document.createElement('h4');
            title.className = 'result-card-title';
            title.textContent = item.title;

            const desc = document.createElement('p');
            desc.className = 'result-card-desc';
            desc.textContent = item.desc;

            const link = document.createElement('a');
            link.className = 'result-card-url';
            link.href = item.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = item.url;

            body.append(title, desc, link);

            const actions = document.createElement('div');
            actions.className = 'result-card-actions';

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(item.url).then(() => {
                    copyBtn.textContent = 'Copied';
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy';
                        copyBtn.classList.remove('copied');
                    }, 1500);
                });
            });

            const openBtn = document.createElement('button');
            openBtn.type = 'button';
            openBtn.className = 'copy-btn';
            openBtn.textContent = 'Open';
            openBtn.addEventListener('click', () => window.open(item.url, '_blank', 'noopener'));

            actions.append(copyBtn, openBtn);
            card.append(body, actions);
            fragment.appendChild(card);
        }

        resultsContainer.appendChild(fragment);
    }

    function saveRecent(facility, website) {
        const entry = { ...facility, website, ts: Date.now() };
        let recent = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        recent = recent.filter(r => formatFacilityLabel(r) !== formatFacilityLabel(facility) || r.website !== website);
        recent.unshift(entry);
        recent = recent.slice(0, MAX_RECENT);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
        renderRecent();
    }

    function restoreFacility(facility) {
        if (facility.keywords) {
            facilityNameInput.value = facility.keywords;
            addressInput.value = '';
            cityInput.value = '';
            stateInput.value = '';
            return;
        }
        facilityNameInput.value = facility.name || '';
        addressInput.value = facility.address || '';
        cityInput.value = facility.city || '';
        stateInput.value = facility.state || '';
    }

    function renderRecent() {
        const recent = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        if (!recent.length) {
            recentPanel.hidden = true;
            return;
        }

        recentPanel.hidden = false;
        recentList.innerHTML = '';

        const fragment = document.createDocumentFragment();
        for (const entry of recent) {
            const li = document.createElement('li');
            li.className = 'recent-item';

            const text = document.createElement('span');
            text.className = 'recent-item-text';
            const sitePart = entry.website ? ` · ${entry.website}` : '';
            text.textContent = `${formatFacilityLabel(entry)}${sitePart}`;

            const restore = document.createElement('button');
            restore.type = 'button';
            restore.className = 'recent-restore';
            restore.textContent = 'Restore';
            restore.addEventListener('click', () => {
                restoreFacility(entry);
                websiteInput.value = entry.website || '';
                updateSiteChipState();
                runSearch(false);
            });

            li.append(text, restore);
            fragment.appendChild(li);
        }
        recentList.appendChild(fragment);
    }

    function runSearch(save = true) {
        const facility = getFacility();
        const website = websiteInput.value;
        const items = buildSearches(facility, website);
        renderResults(items);
        if (save && hasFacilityData(facility)) {
            saveRecent(facility, website.trim());
        }
    }

    function initPresets() {
        for (const site of PARKING_SITES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chip chip-site';
            btn.textContent = site.domain;
            btn.title = site.label;
            btn.dataset.domain = site.domain;
            btn.addEventListener('click', () => {
                const current = websiteInput.value.trim();
                if (cleanDomain(current) === site.domain) {
                    websiteInput.value = '';
                } else {
                    websiteInput.value = site.domain;
                }
                updateSiteChipState();
                schedulePreview();
            });
            sitePresetsEl.appendChild(btn);
        }

        for (const term of RELATED_KEYWORDS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chip';
            btn.textContent = term;
            btn.dataset.term = term;
            btn.addEventListener('click', () => {
                if (activeExtraTerms.has(term)) {
                    activeExtraTerms.delete(term);
                    btn.classList.remove('active');
                } else {
                    activeExtraTerms.add(term);
                    btn.classList.add('active');
                }
                schedulePreview();
            });
            keywordChipsEl.appendChild(btn);
        }
    }

    function updateSiteChipState() {
        const active = cleanDomain(websiteInput.value);
        sitePresetsEl.querySelectorAll('.chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.domain === active);
        });
    }

    function clearForm() {
        facilityNameInput.value = '';
        addressInput.value = '';
        cityInput.value = '';
        stateInput.value = '';
        websiteInput.value = '';
        activeExtraTerms.clear();
        keywordChipsEl.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
        updateSiteChipState();
        resultsContainer.innerHTML = '';
        resultsSection.hidden = true;
        currentUrls = [];
    }

    function schedulePreview() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(false), DEBOUNCE_MS);
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        runSearch(true);
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    for (const input of facilityInputs) {
        input.addEventListener('input', schedulePreview);
    }

    stateInput.addEventListener('input', () => {
        stateInput.value = stateInput.value.toUpperCase();
    });

    websiteInput.addEventListener('input', () => {
        updateSiteChipState();
        schedulePreview();
    });

    clearBtn.addEventListener('click', clearForm);

    copyAllBtn.addEventListener('click', () => {
        if (!currentUrls.length) return;
        navigator.clipboard.writeText(currentUrls.join('\n')).then(() => showToast('All links copied'));
    });

    openAllBtn.addEventListener('click', () => {
        if (!currentUrls.length) return;
        if (!confirm(`Open ${currentUrls.length} tabs in your browser?`)) return;
        for (const url of currentUrls) {
            window.open(url, '_blank', 'noopener');
        }
    });

    initPresets();
    renderRecent();
})();
