import { db, getLastReadingPosition, saveReadingPosition } from './db.js';
import { bibleClient } from './api.js';

// Application State
const state = {
    currentRoute: 'home', // Default to Home
    params: {},
    translation: null, // Start null to force DB load
    book: null,
    chapter: null,
    booksMeta: [],
    translationsMeta: []
};

// DOM Elements
const mainContent = document.getElementById('main-content');
const routerView = document.getElementById('router-view');
const navItems = document.querySelectorAll('.nav-item');
const topBarTitle = document.querySelector('#current-location');
const navModal = document.getElementById('nav-modal');
const closeNavBtn = document.getElementById('close-nav-btn');
const tabBooks = document.getElementById('tab-books');
const tabChapters = document.getElementById('tab-chapters');
const tabTranslations = document.getElementById('tab-translations');
const booksList = document.getElementById('books-list');
const chaptersList = document.getElementById('chapters-list');
const translationsList = document.getElementById('translations-list');

// --- Router ---

function handleRoute() {
    const hash = window.location.hash.slice(1) || 'home';
    const [route, paramString] = hash.split('?');

    // Parse params
    const params = new URLSearchParams(paramString);
    state.currentRoute = route;
    state.params = Object.fromEntries(params.entries());

    updateNavUI(route);
    renderRoute(route);
}

function updateNavUI(route) {
    navItems.forEach(item => {
        if (item.dataset.route === route) {
            item.classList.add('text-stone-800', 'active');
            item.classList.remove('text-stone-400');
        } else {
            item.classList.remove('text-stone-800', 'active');
            item.classList.add('text-stone-400');
        }
    });
}

async function renderRoute(route) {
    // Clear current view (or show loading)
    routerView.innerHTML = '<div class="flex justify-center p-10"><div class="animate-pulse text-stone-400">Loading...</div></div>';

    switch (route) {
        case 'read':
            updateNavUI('read');
            await renderReader();
            break;
        case 'home':
            // "Home" triggers "read" tab state or none? Let's say none or Home. 
            // For now, let's keep nav blank or highlight Read if we treat Home as part of reading flow.
            // Let's create a visual specific to Dashboard.
            navItems.forEach(i => i.classList.remove('text-stone-800', 'active')); // Clear nav integration for hero home
            await renderHome();
            break;
        case 'plans':
            routerView.innerHTML = '<h2 class="text-2xl font-serif font-bold text-stone-800 mb-4">Reading Plans</h2><p class="text-stone-600">Coming soon...</p>';
            topBarTitle.textContent = 'Reading Plans';
            break;
        case 'journal':
            routerView.innerHTML = '<h2 class="text-2xl font-serif font-bold text-stone-800 mb-4">Journal</h2><p class="text-stone-600">Coming soon...</p>';
            topBarTitle.textContent = 'Journal';
            break;
        case 'highlights':
            routerView.innerHTML = '<h2 class="text-2xl font-serif font-bold text-stone-800 mb-4">Highlights</h2><p class="text-stone-600">Coming soon...</p>';
            topBarTitle.textContent = 'Highlights';
            break;
        default:
            routerView.innerHTML = '<p class="text-center text-stone-500 mt-10">Page not found</p>';
    }
}

// --- Features ---

async function renderHome() {
    topBarTitle.textContent = 'Bible PWA';
    const lastPos = await getLastReadingPosition();

    // Default stats if empty (normally fetch from DB)
    const stats = { streak: 0, highlights: 0, entries: 0 };

    routerView.innerHTML = `
        <div class="flex flex-col items-center justify-center pt-10 pb-20 space-y-8">
            <!-- Hero Section -->
            <div class="w-full max-w-sm text-center">
                <h1 class="text-4xl font-serif font-bold text-stone-800 mb-2">Welcome Back</h1>
                <p class="text-stone-500 mb-8">Continue your journey in the Word.</p>
                
                ${lastPos ? `
                <div class="bg-white p-6 rounded-2xl shadow-lg border border-stone-100 transform transition active:scale-95 cursor-pointer" onclick="window.location.hash='read'">
                    <div class="text-xs text-stone-400 uppercase tracking-wide font-bold mb-1">Continue Reading</div>
                    <div class="text-2xl font-serif text-stone-900 font-bold mb-1">${lastPos.book} ${lastPos.chapter}</div>
                    <div class="text-sm text-stone-500">${lastPos.translation}</div>
                    <div class="mt-4 w-full bg-stone-900 text-white py-3 rounded-xl font-medium shadow-md">
                        Resume
                    </div>
                </div>
                ` : `
                <div class="bg-white p-6 rounded-2xl shadow-lg border border-stone-100 transform transition active:scale-95 cursor-pointer" onclick="window.location.hash='read'">
                    <div class="text-xl font-serif text-stone-900 font-bold mb-2">Start Reading</div>
                    <div class="w-full bg-stone-900 text-white py-3 rounded-xl font-medium shadow-md">
                        Open Bible
                    </div>
                </div>
                `}
            </div>

            <!-- Quick Actions Grid -->
            <div class="grid grid-cols-2 gap-4 w-full max-w-sm px-4">
                <div class="bg-white p-4 rounded-xl border border-stone-100 shadow-sm flex flex-col items-center justify-center py-6" onclick="window.location.hash='plans'">
                    <span class="text-2xl mb-2">📅</span>
                    <span class="font-semibold text-stone-700">Plans</span>
                </div>
                <div class="bg-white p-4 rounded-xl border border-stone-100 shadow-sm flex flex-col items-center justify-center py-6" onclick="window.location.hash='journal'">
                    <span class="text-2xl mb-2">✍️</span>
                    <span class="font-semibold text-stone-700">Journal</span>
                </div>
            </div>

            <!-- Daily Verse Stub -->
            <div class="w-full max-w-sm px-4">
                <div class="bg-stone-50 p-6 rounded-xl border border-stone-100">
                    <p class="font-serif italic text-stone-700 text-lg text-center">"Thy word is a lamp unto my feet, and a light unto my path."</p>
                    <p class="text-center text-xs text-stone-400 mt-3 font-bold uppercase">Psalm 119:105</p>
                </div>
            </div>
        </div>
    `;
}

async function renderReader() {
    // 1. Get position from state or DB
    if (!state.book || state.routeChanged) {
        const lastPos = await getLastReadingPosition();
        if (lastPos) {
            state.translation = lastPos.translation;
            state.book = lastPos.book;
            state.chapter = lastPos.chapter;
        } else {
            // Default to Gen 1
            state.translation = 'WEB';
            state.book = 'GEN';
            state.chapter = 1;
        }
    }

    // Update Header
    topBarTitle.textContent = `${state.translation} · ${state.book} ${state.chapter}`;

    // Render loading state
    routerView.innerHTML = `
        <div class="max-w-prose mx-auto mt-10 space-y-4 animate-pulse">
            <div class="h-8 bg-stone-100 rounded w-1/3 mx-auto"></div>
            <div class="h-4 bg-stone-100 rounded w-full"></div>
            <div class="h-4 bg-stone-100 rounded w-full"></div>
            <div class="h-4 bg-stone-100 rounded w-2/3"></div>
        </div>
    `;

    try {
        const chapterData = await bibleClient.getChapter(state.translation, state.book, state.chapter);

        // Render Text
        let html = `
            <div class="max-w-prose mx-auto pb-20">
                <h1 class="text-3xl font-serif font-bold text-stone-900 mb-8 text-center mt-6">${chapterData.reference}</h1>
                <div class="prose prose-stone prose-lg leading-loose text-stone-800">
        `;

        // Verses
        chapterData.verses.forEach(verse => {
            html += `
                <span class="verse inline relative group" data-verse="${verse.verse}">
                    <sup class="text-[0.6rem] text-stone-400 font-sans mr-1 select-none align-top pt-1 cursor-pointer hover:text-stone-600 top-0">${verse.verse}</sup><span class="verse-text hover:bg-stone-50 transition-colors rounded px-0.5">${verse.text}</span>
                </span>
            `;
        });

        html += `
                </div>
                
                <!-- Chapter Navigation -->
                <div class="flex justify-between items-center mt-12 pt-8 border-t border-stone-100 font-serif text-stone-600">
                    <button id="prev-chapter-btn" class="p-4 hover:bg-stone-50 rounded-lg flex items-center gap-2 ${!state.chapter > 1 ? 'invisible' : ''}"> // Crude check
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                        Previous
                    </button>
                    <button id="next-chapter-btn" class="p-4 hover:bg-stone-50 rounded-lg flex items-center gap-2">
                        Next
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                    </button>
                </div>
            </div>
        `;

        routerView.innerHTML = html;

        // Save position
        saveReadingPosition(state.translation, state.book, state.chapter);

        // Attach Navigation Listeners
        document.getElementById('next-chapter-btn').addEventListener('click', () => {
            state.chapter++;
            handleRoute(); // re-render
            window.scrollTo(0, 0);
        });

        const prevBtn = document.getElementById('prev-chapter-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (state.chapter > 1) {
                    state.chapter--;
                    handleRoute();
                    window.scrollTo(0, 0);
                }
            });
        }

    } catch (err) {
        console.error(err);
        routerView.innerHTML = `
            <div class="text-center mt-20 text-red-500">
                <p>Error loading chapter.</p>
                <button onclick="location.reload()" class="mt-4 px-4 py-2 bg-stone-100 rounded text-stone-800">Retry</button>
            </div>
        `;
    }
}

// --- Navigation UI ---

async function openNav() {
    // Lazy load metadata if needed
    if (state.booksMeta.length === 0) {
        state.booksMeta = await fetch('./assets/data/books.json').then(r => r.json());
        renderBooksList();
    }
    if (state.translationsMeta.length === 0) {
        state.translationsMeta = await fetch('./assets/data/translations.json').then(r => r.json());
        renderTranslationsList();
    }

    navModal.classList.remove('translate-y-full');
}

function closeNav() {
    navModal.classList.add('translate-y-full');
}

function switchNavTab(tab) {
    // Reset tabs
    [tabBooks, tabChapters, tabTranslations].forEach(t => {
        t.classList.remove('text-stone-800', 'border-stone-800');
        t.classList.add('text-stone-400');
        t.classList.remove('border-b-2');
    });
    // Active tab
    if (tab === 'books') {
        tabBooks.classList.add('text-stone-800', 'border-stone-800', 'border-b-2');
        tabBooks.classList.remove('text-stone-400');
        booksList.classList.remove('hidden');
        chaptersList.classList.add('hidden');
        translationsList.classList.add('hidden');
    } else if (tab === 'chapters') {
        renderChaptersList(); // Re-render to ensure current book
        tabChapters.classList.add('text-stone-800', 'border-stone-800', 'border-b-2');
        tabChapters.classList.remove('text-stone-400');
        booksList.classList.add('hidden');
        chaptersList.classList.remove('hidden');
        translationsList.classList.add('hidden');
    } else if (tab === 'translations') {
        tabTranslations.classList.add('text-stone-800', 'border-stone-800', 'border-b-2');
        tabTranslations.classList.remove('text-stone-400');
        booksList.classList.add('hidden');
        chaptersList.classList.add('hidden');
        translationsList.classList.remove('hidden');
    }
}

function renderBooksList() {
    booksList.innerHTML = state.booksMeta.map(b => `
        <button class="text-left w-full p-3 bg-white rounded border border-stone-200 hover:border-stone-400 font-serif ${state.book === b.id ? 'bg-stone-100 border-stone-400' : ''}" onclick="window.selectBook('${b.id}')">
            ${b.name}
        </button>
    `).join('');
}

function renderChaptersList() {
    const currentBookMeta = state.booksMeta.find(b => b.id === state.book);
    if (!currentBookMeta) return;

    let html = '';
    for (let i = 1; i <= currentBookMeta.chapters; i++) {
        html += `<button class="p-3 bg-white rounded border border-stone-200 hover:border-stone-400 font-sans font-semibold ${state.chapter == i ? 'bg-stone-800 text-white' : ''}" onclick="window.selectChapter(${i})">${i}</button>`;
    }
    chaptersList.innerHTML = html;
}

function renderTranslationsList() {
    translationsList.innerHTML = state.translationsMeta.map(t => {
        const isOffline = localStorage.getItem(`offline-${t.id}`) === 'true';
        return `
        <div class="p-3 bg-white rounded border border-stone-200 hover:border-stone-400 flex flex-col gap-2">
            <div class="flex justify-between items-center cursor-pointer" onclick="window.selectTranslation('${t.id}')">
                <div>
                    <span class="font-semibold text-stone-800">${t.id}</span>
                    <span class="text-sm text-stone-500 ml-2">${t.name}</span>
                </div>
                ${state.translation === t.id ? '<span class="text-green-600 font-bold">✓</span>' : ''}
            </div>
            
            <div class="flex justify-between items-center border-t border-stone-100 pt-2 mt-1">
                <span class="text-xs ${isOffline ? 'text-green-600 font-medium' : 'text-stone-400'}">
                    ${isOffline ? 'Available Offline' : 'Online Only'}
                </span>
                ${!isOffline ? `
                    <button class="text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 px-2 py-1 rounded flex items-center gap-1" onclick="window.downloadTranslation('${t.id}', this)">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 12.75l-3-3m0 0 3-3m-3 3h7.5" />
                        </svg>
                        Download
                    </button>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

window.downloadTranslation = async (transId, btn) => {
    btn.textContent = 'Downloading...';
    btn.disabled = true;
    try {
        await bibleClient.downloadTranslation(transId);
        localStorage.setItem(`offline-${transId}`, 'true');
        renderTranslationsList();
        alert(`${transId} is now available offline!`);
    } catch (e) {
        console.error(e);
        btn.textContent = 'Failed';
        alert('Download failed. Check console.');
    }
};

// Global handlers for HTML onclick access
window.selectBook = (bookId) => {
    state.book = bookId;
    state.chapter = 1; // Reset to ch 1
    switchNavTab('chapters');
};

window.selectChapter = (chapterNum) => {
    state.chapter = chapterNum;
    closeNav();
    handleRoute(); // Refresh view
    window.scrollTo(0, 0);
};

window.selectTranslation = (transId) => {
    state.translation = transId;
    renderTranslationsList(); // Update checkmark
    // Don't close immediately, maybe user wants to change book too?
    // Let's just refresh view
    handleRoute();
};

// --- Initialization ---

function init() {
    // Navigation Listeners
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const route = btn.dataset.route;
            window.location.hash = route;
        });
    });

    // Hash Change Listener
    window.addEventListener('hashchange', handleRoute);

    // Header Title Click -> Open Nav
    topBarTitle.parentElement.addEventListener('click', openNav);
    closeNavBtn.addEventListener('click', closeNav);

    // Tab Listeners
    tabBooks.addEventListener('click', () => switchNavTab('books'));
    tabChapters.addEventListener('click', () => switchNavTab('chapters'));
    tabTranslations.addEventListener('click', () => switchNavTab('translations'));

    // Initial Route
    handleRoute();
}

init();
