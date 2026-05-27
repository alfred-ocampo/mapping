document.getElementById('searchForm').addEventListener('submit', function(event) {
    event.preventDefault();
    const keywords = document.getElementById('keywords').value;
    const websiteUrl = document.getElementById('websiteUrl').value;

    // Prepare the search result URLs with titles
    const urls = [
        { title: "Particular word in the URL", url: `https://www.google.com/search?q=inurl:${encodeURIComponent(websiteUrl)} ${keywords}` },
        { title: "Multiple words in the URL", url: `https://www.google.com/search?q=allinurl:${encodeURIComponent(websiteUrl)} ${keywords}` },
        { title: "Search Specific Sites", url: `https://www.google.com/search?q=site:${encodeURIComponent(websiteUrl)} ${keywords}` },
        { title: "Exact Match", url: `https://www.google.com/search?q=${encodeURIComponent(keywords)}` },
        { title: "Particular word in the title tag", url: `https://www.google.com/search?q=intitle:${encodeURIComponent(keywords)}` },
        { title: "Particular word in their content", url: `https://www.google.com/search?q=intext:${encodeURIComponent(keywords)}` },
        { title: "Particular word in their content", url: `https://www.google.com/search?q=allintext:${encodeURIComponent(keywords)}` },
        { title: "Google to show map results", url: `https://www.google.com/search?q=map:${encodeURIComponent(keywords)}`}
    ];

    // Insert the search results into the resultsContainer
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = '';
    urls.forEach(({ title, url }) => {
        const titleElement = document.createElement('p');
        titleElement.className = 'result-title';
        titleElement.textContent = title;
        resultsContainer.appendChild(titleElement);

        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank'; // Opens in a new tab
        link.textContent = url;
        link.className = 'result-link';
        resultsContainer.appendChild(link);
        resultsContainer.appendChild(document.createElement('br')); // Adds a line break for spacing
    });
});
