const searchInput = document.querySelector('.search input[type="text"]');
const searchIcon = document.querySelector('.search .icon');

function performSearch() {
    const query = searchInput.value.trim();
    if (query) {
        if (isURL(query)) {
            window.location.href = query.startsWith('http') ? query : `https://${query}`;
        } else {
            window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        }
    }
}

function isURL(string) {
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    return urlPattern.test(string);
}

if (searchIcon) {
    searchIcon.addEventListener('click', performSearch);
}

if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}
        

