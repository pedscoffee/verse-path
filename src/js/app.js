import { db, getLastReadingPosition, saveReadingPosition } from './db.js';
import { bibleClient } from './api.js';
import { TTSController } from './tts.js';
import { plansController } from './plans.js';
import { connectionsController } from './connections.js';

// Application State
const state = {
    currentRoute: 'home', // Default to Home
    params: {},
    translation: null, // Start null to force DB load
    book: null,
    chapter: null,
    booksMeta: [],
    translationsMeta: [],
    // Audio State
    currentVerses: [], // Cached verses for current chapter
    audioTimestamp: 0, // Current verse index being played
    translation: null,
    book: null,
    chapter: null
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

// Audio DOM
const miniPlayer = document.getElementById('mini-player');
const playerPlayBtn = document.getElementById('player-play-btn');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const playerTitle = document.getElementById('player-title');
const playerVerse = document.getElementById('player-verse');
const playerNextBtn = document.getElementById('player-next-btn');
const playerSpeedBtn = document.getElementById('player-speed-btn');

// --- TTS Integration ---

const tts = new TTSController({
    onVerseStart: (verseNum, index) => {
        state.audioTimestamp = index;
        updatePlayerUI(true);
        highlightVerse(verseNum);

        // Save minimal position during playback (optional, maybe throttle)
        saveReadingPosition(state.translation, state.book, state.chapter, verseNum, index, state.chapter);
    },
    onStateChange: (isPlaying, index) => {
        updatePlayerUI(isPlaying);
    },
    onChapterEnd: () => {
        console.log('Chapter Ended, advancing...');
        // Auto-advance
        if (state.chapter < getBookChapters(state.book)) { // Crude check, need helper
            state.chapter++;
            handleRoute().then(() => {
                // Auto-play next chapter after load
                // We need a short delay or check
                setTimeout(() => tts.play(), 500);
            });
            window.scrollTo(0, 0);
        } else {
            console.log('End of book?');
            // Try next book? For MVP just stop.
        }
    },
    onError: (e) => {
        console.error("TTS Error", e);
    }
});

function updatePlayerUI(isPlaying) {
    if (isPlaying) {
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
    } else {
        iconPlay.classList.remove('hidden');
        iconPause.classList.add('hidden');
    }

    // Update labels
    const currentVerse = state.currentVerses[state.audioTimestamp];
    if (currentVerse) {
        playerVerse.textContent = `Verse ${currentVerse.verse}`;
        // Ensure player is visible
        if (miniPlayer.classList.contains('hidden')) miniPlayer.classList.remove('hidden');
        // Add padding to main content so player doesn't cover text
        mainContent.style.paddingBottom = '80px';
    }
}

function highlightVerse(verseNum) {
    // Remove old highlights
    document.querySelectorAll('.verse-text.bg-yellow-100').forEach(el => {
        el.classList.remove('bg-yellow-100', 'transition-colors', 'duration-300');
    });

    const verseEl = document.querySelector(`.verse[data-verse="${verseNum}"] .verse-text`);
    if (verseEl) {
        verseEl.classList.add('bg-yellow-100', 'transition-colors', 'duration-300');
        // Auto-scroll logic (smooth)
        const rect = verseEl.getBoundingClientRect();
        if (rect.top < 100 || rect.bottom > window.innerHeight - 150) {
            verseEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}


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
    if (route !== 'read') routerView.innerHTML = '<div class="flex justify-center p-10"><div class="animate-pulse text-stone-400">Loading...</div></div>';

    switch (route) {
        case 'read':
            updateNavUI('read');
            await renderReader();
            break;
        case 'home':
            navItems.forEach(i => i.classList.remove('text-stone-800', 'active'));
            await renderHome();
            break;
        case 'plans':
            updateNavUI('plans');
            await renderPlans();
            break;
        case 'journal':
            updateNavUI('journal');
            routerView.innerHTML = '<h2 class="text-2xl font-serif font-bold text-stone-800 mb-4">Journal</h2><p class="text-stone-600">Coming soon...</p>';
            topBarTitle.textContent = 'Journal';
            break;
        case 'highlights':
            updateNavUI('highlights');
            routerView.innerHTML = '<h2 class="text-2xl font-serif font-bold text-stone-800 mb-4">Highlights</h2><p class="text-stone-600">Coming soon...</p>';
            topBarTitle.textContent = 'Highlights';
            break;
        default:
            if (route === '') {
                await renderHome();
            } else {
                routerView.innerHTML = '<p class="text-center text-stone-500 mt-10">Page not found</p>';
            }
    }
}

// --- Features ---

async function renderHome() {
    topBarTitle.textContent = 'Bible PWA';
    const lastPos = await getLastReadingPosition();
    const activePlans = await db.plans.toArray();

    // Default stats if empty (normally fetch from DB)
    const stats = { streak: 0, highlights: await db.highlights.count(), entries: await db.journal.count() };

    // Determine "Next Up" Plan
    const primaryPlan = activePlans.length > 0 ? activePlans[0] : null;

    let html = `
        <div class="flex flex-col items-center justify-center pt-10 pb-20 space-y-6">
            <!-- Hero Section -->
            <div class="w-full max-w-sm text-center">
                <h1 class="text-4xl font-serif font-bold text-stone-800 mb-2">Welcome Back</h1>
                <p class="text-stone-500 mb-6">Continue your journey in the Word.</p>
                
                ${lastPos ? `
                <div class="bg-white p-6 rounded-2xl shadow-lg border border-stone-100 transform transition active:scale-95 cursor-pointer text-left" onclick="window.location.hash='read'">
                    <div class="flex justify-between items-start mb-2">
                         <div class="text-xs text-stone-400 uppercase tracking-wide font-bold">Continue Reading</div>
                         <div class="text-xs text-stone-300 font-mono">${new Date(lastPos.timestamp).toLocaleDateString()}</div>
                    </div>
                    <div class="text-3xl font-serif text-stone-900 font-bold mb-1">${lastPos.book} ${lastPos.chapter}</div>
                    <div class="text-sm text-stone-500">${lastPos.translation}</div>
                    <div class="mt-4 w-full bg-stone-900 text-white py-3 rounded-xl font-medium shadow-md text-center">
                        Resume
                    </div>
                </div>
                ` : ''}

                ${primaryPlan ? `
                <div class="mt-4 bg-stone-50 p-5 rounded-xl border border-stone-200 text-left cursor-pointer hover:bg-stone-100 transition" onclick="window.location.hash='plans'">
                    <div class="flex justify-between items-center mb-1">
                        <span class="text-xs font-bold text-stone-500 uppercase">Current Plan</span>
                        <span class="text-xs font-bold text-stone-400 bg-white px-2 py-0.5 rounded border border-stone-100">${primaryPlan.progress}%</span>
                    </div>
                    <h3 class="font-serif font-bold text-lg text-stone-800">${primaryPlan.title}</h3>
                    <p class="text-sm text-stone-500">Day ${primaryPlan.completedDays.length + 1}</p>
                </div>
                ` : ''}

                ${lastPos && lastPos.audioTimestamp !== undefined ? `
                <div class="mt-4 bg-stone-50 p-4 rounded-xl border border-stone-200 flex items-center justify-between cursor-pointer hover:bg-stone-100" onclick="resumeAudio()">
                     <div class="flex items-center gap-3">
                        <div class="bg-stone-200 p-2 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-stone-600">
                                <path fill-rule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div class="text-left">
                           <div class="text-sm font-bold text-stone-800">Continue Listening</div>
                           <div class="text-xs text-stone-500">${lastPos.book} ${lastPos.audioChapter || lastPos.chapter}</div>
                        </div>
                     </div>
                     <div class="text-stone-400">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z" clip-rule="evenodd" /></svg>
                     </div>
                </div>
                ` : ''}
            </div>

            <!-- Stats Grid -->
            <div class="w-full max-w-sm grid grid-cols-2 gap-4">
                <div class="bg-stone-50 p-4 rounded-xl text-center border border-stone-100">
                    <div class="text-2xl font-bold text-stone-800">${stats.highlights}</div>
                    <div class="text-xs text-stone-400 uppercase tracking-wide">Highlights</div>
                </div>
                <div class="bg-stone-50 p-4 rounded-xl text-center border border-stone-100">
                    <div class="text-2xl font-bold text-stone-800">${stats.entries}</div>
                    <div class="text-xs text-stone-400 uppercase tracking-wide">Journal Entries</div>
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

async function renderPlans() {
    topBarTitle.textContent = 'Reading Plans';
    await plansController.load();

    const mode = state.params.mode || 'list'; // list, browse, detail

    if (mode === 'list') {
        const activePlans = plansController.activePlans;

        let html = `
            <div class="max-w-md mx-auto space-y-6">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-serif font-bold text-stone-800">My Plans</h2>
                    <button onclick="window.location.hash='plans?mode=browse'" class="text-stone-600 bg-stone-100 hover:bg-stone-200 px-3 py-1 rounded-full text-sm font-medium transition">
                        + Add Plan
                    </button>
                </div>
        `;

        if (activePlans.length === 0) {
            html += `
                <div class="text-center py-10 bg-stone-50 rounded-xl border border-stone-100 border-dashed">
                    <p class="text-stone-500 mb-4">You haven't started any reading plans yet.</p>
                    <button onclick="window.location.hash='plans?mode=browse'" class="bg-stone-800 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-stone-700 transition">Browse Plans</button>
                </div>
            `;
        } else {
            html += `<div class="grid grid-cols-1 gap-4">`;
            activePlans.forEach(plan => {
                html += `
                    <div class="bg-white p-4 rounded-xl border border-stone-200 shadow-sm cursor-pointer hover:border-stone-400 transition" onclick="window.location.hash='plans?mode=detail&id=${plan.id}'">
                        <div class="flex justify-between items-start mb-2">
                             <h3 class="font-serif font-bold text-lg text-stone-800">${plan.title}</h3>
                             <span class="text-xs font-bold text-stone-400 bg-stone-50 px-2 py-1 rounded-full">${plan.progress}%</span>
                        </div>
                        <div class="w-full bg-stone-100 rounded-full h-1.5 mb-2">
                            <div class="bg-green-500 h-1.5 rounded-full" style="width: ${plan.progress}%"></div>
                        </div>
                        <div class="text-xs text-stone-500">
                             Day ${plan.completedDays.length + 1} of ${plan.totalDays}
                        </div>
                    </div>
                `;
            });
            html += `</div>`;
        }

        html += `</div>`;
        routerView.innerHTML = html;

    } else if (mode === 'browse') {
        const templates = plansController.availablePlans;

        let html = `
            <div class="max-w-md mx-auto space-y-4">
                <button onclick="window.location.hash='plans'" class="mb-4 text-stone-500 hover:text-stone-800 flex items-center gap-1 text-sm font-medium">
                    ← Back to My Plans
                </button>
                <h2 class="text-2xl font-serif font-bold text-stone-800 mb-6">Available Plans</h2>
                <div class="grid grid-cols-1 gap-4">
        `;

        templates.forEach(tpl => {
            html += `
                <div class="bg-white p-5 rounded-xl border border-stone-200 shadow-sm">
                    <h3 class="font-serif font-bold text-lg text-stone-800 mb-1">${tpl.name}</h3>
                    <p class="text-sm text-stone-500 mb-4 leading-relaxed">${tpl.description}</p>
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-stone-400 font-medium bg-stone-50 px-2 py-1 rounded border border-stone-100">${tpl.days} Days</span>
                        <button onclick="window.startPlan('${tpl.id}')" class="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm hover:bg-stone-700 transition">Start Plan</button>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
        routerView.innerHTML = html;

    } else if (mode === 'detail') {
        const planId = state.params.id;
        const plan = plansController.activePlans.find(p => p.id === planId);

        if (!plan) {
            window.location.hash = 'plans';
            return;
        }

        let html = `
             <div class="max-w-md mx-auto space-y-6">
                <button onclick="window.location.hash='plans'" class="mb-2 text-stone-500 hover:text-stone-800 flex items-center gap-1 text-sm font-medium">
                    ← Back
                </button>
                
                <div class="bg-stone-50 p-6 rounded-2xl border border-stone-100 text-center">
                     <h2 class="text-2xl font-serif font-bold text-stone-800 mb-2">${plan.title}</h2>
                     <div class="text-4xl font-bold text-stone-900 mb-1">${plan.progress}%</div>
                     <p class="text-stone-500 text-sm">Completed</p>
                </div>

                <div class="space-y-2">
                    <h3 class="font-bold text-stone-800 text-lg px-2">Days</h3>
        `;

        for (let i = 1; i <= plan.totalDays; i++) {
            const isCompleted = plan.completedDays.includes(i);
            const isNext = !isCompleted && !plan.completedDays.includes(i - 1) && (i === 1 || plan.completedDays.includes(i - 1));

            html += `
                <div class="flex items-center p-3 rounded-lg border ${isCompleted ? 'bg-stone-50 border-stone-100' : 'bg-white border-stone-200'} ${isNext ? 'ring-2 ring-stone-800 border-transparent shadow-md' : ''}">
                    <button onclick="window.toggleDay('${plan.id}', ${i})" class="flex-none p-2 rounded-full border ${isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-stone-300 text-transparent hover:border-stone-400'} transition mr-3">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
                            <path fill-rule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-9a.75.75 0 0 1 1.06-1.06l5.353 8.03 8.493-12.74a.75.75 0 0 1 1.04-.208Z" clip-rule="evenodd" />
                        </svg>
                    </button>
                    <div class="flex-1">
                        <div class="text-sm font-medium ${isCompleted ? 'text-stone-400 line-through' : 'text-stone-800'}">Day ${i}</div>
                    </div>
                </div>
            `;
        }

        html += `</div></div>`;
        routerView.innerHTML = html;

        setTimeout(() => {
            const nextEl = document.querySelector('.ring-2');
            if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
    }
}

async function renderJournal() {
    topBarTitle.textContent = 'Journal';
    const mode = state.params.mode || 'list';

    if (mode === 'list') {
        const entries = await db.journal.reverse().toArray();

        let html = `
            <div class="max-w-md mx-auto space-y-6">
                <div class="flex justify-between items-center">
                    <h2 class="text-2xl font-serif font-bold text-stone-800">My Journal</h2>
                    <button onclick="window.location.hash='journal?mode=edit'" class="text-white bg-stone-800 hover:bg-stone-700 px-3 py-1 rounded-full text-sm font-medium transition shadow-sm">
                        + New Entry
                    </button>
                </div>
                <div class="relative">
                    <input type="text" placeholder="Search entries..." class="w-full bg-stone-50 border border-stone-200 rounded-lg py-2 px-4 pl-10 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400">
                    <svg class="w-4 h-4 text-stone-400 absolute left-3 top-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
        `;

        if (entries.length === 0) {
            html += `
                <div class="text-center py-10">
                    <p class="text-stone-400 mb-4">No journal entries yet.</p>
                </div>
            </div>`;
        } else {
            html += `<div class="grid grid-cols-1 gap-4">`;
            entries.forEach(entry => {
                const dateStr = new Date(entry.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                const preview = entry.content.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...';

                html += `
                    <div class="bg-white p-5 rounded-xl border border-stone-200 shadow-sm cursor-pointer hover:border-stone-400 transition" onclick="window.location.hash='journal?mode=edit&id=${entry.id}'">
                        <div class="mb-2">
                             <h3 class="font-serif font-bold text-lg text-stone-800">${entry.title || 'Untitled'}</h3>
                             <div class="text-xs text-stone-400 font-medium uppercase tracking-wide">${dateStr}</div>
                        </div>
                        <p class="text-sm text-stone-600 leading-relaxed">${preview}</p>
                         ${entry.tags ? `
                            <div class="mt-3 flex gap-2">
                                ${entry.tags.map(t => `<span class="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded">${t}</span>`).join('')}
                            </div>
                         ` : ''}
                    </div>
                `;
            });
            html += `</div></div>`;
        }
        routerView.innerHTML = html;

    } else if (mode === 'edit') {
        const id = state.params.id ? parseInt(state.params.id) : null;
        let entry = { title: '', content: '', tags: [] };

        if (id) {
            entry = await db.journal.get(id);
        }

        let html = `
            <div class="max-w-md mx-auto flex flex-col h-full">
                <div class="flex justify-between items-center mb-4">
                    <button onclick="window.location.hash='journal'" class="text-stone-500 hover:text-stone-800 text-sm font-medium">Cancel</button>
                    <button onclick="window.saveJournalEntry(${id})" class="text-white bg-stone-800 hover:bg-stone-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition">Save</button>
                </div>
                
                <input type="text" id="journal-title" value="${entry.title}" placeholder="Title" class="text-2xl font-serif font-bold text-stone-800 placeholder-stone-300 border-none focus:ring-0 p-0 mb-4 bg-transparent w-full">
                
                <div class="flex gap-2 mb-2 border-b border-stone-100 pb-2 overflow-x-auto">
                    <button class="p-2 text-stone-500 hover:bg-stone-100 rounded" onclick="document.execCommand('bold')"><b>B</b></button>
                    <button class="p-2 text-stone-500 hover:bg-stone-100 rounded" onclick="document.execCommand('italic')"><i>I</i></button>
                    <button class="p-2 text-stone-500 hover:bg-stone-100 rounded" onclick="document.execCommand('underline')"><u>U</u></button>
                    <div class="w-px bg-stone-200 mx-1"></div>
                    <button class="p-2 text-stone-500 hover:bg-stone-100 rounded" onclick="document.execCommand('insertUnorderedList')">• List</button>
                    <button class="p-2 text-stone-500 hover:bg-stone-100 rounded" onclick="document.execCommand('insertOrderedList')">1. List</button>
                </div>
                
                <div id="journal-editor" contenteditable="true" class="flex-1 text-lg text-stone-800 leading-relaxed outline-none min-h-[300px] prose prose-stone" placeholder="Write your thoughts...">${entry.content}</div>
                
                <div class="mt-4 pt-4 border-t border-stone-100">
                    <input type="text" id="journal-tags" value="${entry.tags ? entry.tags.join(', ') : ''}" placeholder="Tags (comma separated)" class="w-full text-sm text-stone-500 bg-transparent border-none focus:ring-0 p-0">
                </div>
            </div>
        `;
        routerView.innerHTML = html;

        if (!id) document.getElementById('journal-title').focus();
    }
}

window.saveJournalEntry = async (id) => {
    const title = document.getElementById('journal-title').value;
    const content = document.getElementById('journal-editor').innerHTML;
    const tagsStr = document.getElementById('journal-tags').value;
    const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);

    const entry = {
        title,
        content,
        tags,
        date: id ? (await db.journal.get(id)).date : Date.now()
    };

    if (id) {
        await db.journal.update(id, entry);
    } else {
        await db.journal.add(entry);
    }

    window.location.hash = 'journal';
};

window.startPlan = async (tplId) => {
    try {
        await plansController.startPlan(tplId);
        window.location.hash = 'plans';
    } catch (e) {
        console.error(e);
        alert('Error starting plan');
    }
};
window.resumeAudio = async () => {
    const lastPos = await getLastReadingPosition();
    if (lastPos) {
        state.translation = lastPos.translation;
        state.book = lastPos.book;
        state.chapter = lastPos.audioChapter || lastPos.chapter;
        state.audioTimestamp = lastPos.audioTimestamp || 0;

        window.location.hash = 'read';
        // renderReader will handle loading, then we need to triggering play
        // We can set a temporary flag
        state.autoPlay = true;
    }
};

async function renderReader() {
    // 1. Get position from state or DB
    if (!state.book || state.routeChanged) {
        const lastPos = await getLastReadingPosition();
        if (lastPos && !state.book) { // Only overwrite if state is empty, otherwise respect manual nav
            state.translation = lastPos.translation;
            state.book = lastPos.book;
            state.chapter = lastPos.chapter;
        } else if (!state.book) {
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
        state.currentVerses = chapterData.verses; // Store for TTS

        // Load TTS
        // If we are navigating to a new chapter, we should load it into TTS, but don't auto-play unless flagged
        tts.loadChapter(state.currentVerses, 0);
        playerTitle.textContent = `${state.book} ${state.chapter}`;

        // Show Mini Player if it was active or always? Maybe always show stub?
        // Let's show it.
        miniPlayer.classList.remove('hidden');

        // Render Text
        let html = `
            <div class="max-w-prose mx-auto pb-20">
                <h1 class="text-3xl font-serif font-bold text-stone-900 mb-8 text-center mt-6">${chapterData.reference}</h1>
                <div class="prose prose-stone prose-lg leading-loose text-stone-800">
        `;

        // Verses
        // Pre-fetch highlights
        const highlights = await db.highlights.where('[translation+book+chapter]').equals([state.translation, state.book, state.chapter]).toArray();
        const highlightMap = {};
        highlights.forEach(h => highlightMap[h.verse] = h.color);

        chapterData.verses.forEach(verse => {
            const hlColor = highlightMap[verse.verse] ? `bg-${highlightMap[verse.verse]}-200` : '';

            html += `
                <span class="verse inline relative group cursor-pointer" data-verse="${verse.verse}">
                    <sup class="text-[0.6rem] text-stone-400 font-sans mr-1 select-none align-top pt-1 hover:text-stone-600 top-0">${verse.verse}</sup><span class="verse-text hover:bg-stone-50 transition-colors rounded px-0.5 ${hlColor}">${verse.text}</span>
                </span>
            `;
        });

        html += `
                </div>
                
                <!-- Chapter Navigation -->
                <div class="flex justify-between items-center mt-12 pt-8 border-t border-stone-100 font-serif text-stone-600">
                    <button id="prev-chapter-btn" class="p-4 hover:bg-stone-50 rounded-lg flex items-center gap-2 ${state.chapter <= 1 ? 'invisible' : ''}"> 
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

        // Auto Play check
        if (state.autoPlay) {
            state.autoPlay = false;
            // Seek to timestamp
            tts.currentIndex = state.audioTimestamp || 0;
            updatePlayerUI(true); // pre-optimistic
            tts.play();
        }

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

        // Verse click interactions (for future HIGHLIGHTS feature)
        document.querySelectorAll('.verse').forEach(v => {
            v.addEventListener('click', (e) => {
                // For now, maybe just log or seek audio?
                // Future: Show Highlight Toolbar
                const verseNum = parseInt(v.dataset.verse);
                console.log('Clicked verse', verseNum);
            });
        });

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

// --- Highlights Logic ---

async function renderHighlights() {
    topBarTitle.textContent = 'Highlights & Notes';

    // Fetch all highlights with notes
    const highlights = await db.highlights.reverse().toArray();
    // For each highlight, fetch notes? Or just show highlights.
    // Let's perform a join if needed, or simple iteration.

    let html = `
        <div class="max-w-md mx-auto space-y-4">
             <div class="relative mb-6">
                <input type="text" placeholder="Search highlights..." class="w-full bg-stone-50 border border-stone-200 rounded-lg py-2 px-4 pl-10 text-sm focus:outline-none focus:ring-1 focus:ring-stone-400">
                <svg class="w-4 h-4 text-stone-400 absolute left-3 top-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
    `;

    if (highlights.length === 0) {
        html += `
            <div class="text-center py-10">
                <p class="text-stone-400">No highlights yet. Tap a verse number to highlight it.</p>
            </div>
        </div>`;
    } else {
        html += `<div class="grid grid-cols-1 gap-4">`;
        for (const h of highlights) {
            const note = await db.notes.where('highlightId').equals(h.id).first();
            // Get verse text? We might need to fetch it or store snippet. 
            // Storing snippet in highlight is better for performance than fetching chapter every time.
            // For now, let's assume we didn't store snippet, so we show ref.

            // Color map
            const colorMap = {
                'yellow': 'bg-yellow-200',
                'green': 'bg-green-200',
                'blue': 'bg-blue-200',
                'pink': 'bg-pink-200'
            };

            html += `
                <div class="bg-white p-4 rounded-xl border border-stone-200 shadow-sm cursor-pointer hover:border-stone-400 transition" onclick="window.navigateToVerse('${h.book}', ${h.chapter}, ${h.verse})">
                    <div class="flex items-start gap-3">
                        <div class="w-1.5 h-full self-stretch rounded-full ${colorMap[h.color] || 'bg-yellow-200'} shrink-0"></div>
                        <div class="flex-1">
                             <div class="flex justify-between items-center mb-1">
                                 <h3 class="font-serif font-bold text-stone-800">${h.book} ${h.chapter}:${h.verse}</h3>
                                 <span class="text-xs text-stone-400">${new Date(h.timestamp).toLocaleDateString()}</span>
                             </div>
                             ${note ? `<p class="text-sm text-stone-600 italic border-l-2 border-stone-100 pl-2 mb-2">"${note.text}"</p>` : ''}
                             <!-- Snippet placeholder -->
                             <p class="text-xs text-stone-500">Tap to view in context &rarr;</p>
                        </div>
                    </div>
                </div>
             `;
        }
        html += `</div></div>`;
    }
    routerView.innerHTML = html;
}

window.navigateToVerse = async (book, chapter, verse) => {
    state.book = book;
    state.chapter = chapter;
    window.location.hash = 'read';
    // Optionally wait for load then scroll
    setTimeout(() => {
        const el = document.querySelector(`.verse[data-verse="${verse}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 800);
};

window.toggleDay = async (planId, dayNum) => {
    // For now only mark complete, toggle logic is inside controller if built that way
    await plansController.markDayComplete(planId, dayNum);
    renderPlans(); // Refresh
};

// --- Verse Interaction Sheet ---
// Stub for showing a bottom sheet when clicking a verse index

let activeVerse = null;

function showVerseActions(verseNum) {
    activeVerse = verseNum;
    // Create or show modal
    let modal = document.getElementById('verse-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'verse-modal';
        modal.className = 'fixed inset-0 z-[60] flex items-end justify-center pointer-events-none';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/20 pointer-events-auto" onclick="closeVerseActions()"></div>
            <div class="bg-white w-full max-w-lg rounded-t-2xl p-6 pb-safe pointer-events-auto transform transition-transform translate-y-full duration-300">
                <div class="flex justify-between items-center mb-6">
                    <h3 id="vm-title" class="font-serif font-bold text-xl text-stone-800">Verse Actions</h3>
                    <button onclick="closeVerseActions()" class="p-2 bg-stone-100 rounded-full text-stone-500"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
                
                <div class="grid grid-cols-4 gap-4 mb-6">
                    <button onclick="addHighlight('yellow')" class="flex flex-col items-center gap-2">
                        <div class="w-12 h-12 rounded-full bg-yellow-200 border border-yellow-300"></div>
                        <span class="text-xs font-medium text-stone-600">Yellow</span>
                    </button>
                    <button onclick="addHighlight('green')" class="flex flex-col items-center gap-2">
                        <div class="w-12 h-12 rounded-full bg-green-200 border border-green-300"></div>
                        <span class="text-xs font-medium text-stone-600">Green</span>
                    </button>
                    <button onclick="addHighlight('blue')" class="flex flex-col items-center gap-2">
                        <div class="w-12 h-12 rounded-full bg-blue-200 border border-blue-300"></div>
                        <span class="text-xs font-medium text-stone-600">Blue</span>
                    </button>
                    <button onclick="addHighlight('pink')" class="flex flex-col items-center gap-2">
                        <div class="w-12 h-12 rounded-full bg-pink-200 border border-pink-300"></div>
                        <span class="text-xs font-medium text-stone-600">Pink</span>
                    </button>
                </div>
                
                <button onclick="openNoteEditor()" class="w-full flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 py-3 rounded-xl text-stone-700 font-medium mb-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM16.862 4.487L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>
                    Add / Edit Note
                </button>
                
                <button onclick="copyVerse()" class="w-full flex items-center justify-center gap-2 bg-stone-100 hover:bg-stone-200 py-3 rounded-xl text-stone-700 font-medium">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    Copy Text
                </button>

                <!-- Connections Feature Hook -->
                <button onclick="showConnections()" class="w-full mt-2 flex items-center justify-center gap-2 bg-stone-800 text-white hover:bg-stone-700 py-3 rounded-xl font-medium">
                     <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 0 0 0 2.25-2.25V6a2.25 0 0 0-2.25-2.25H6A2.25 0 0 0 3.75 6v2.25A2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 0 0 0 10.5 18v-2.25a2.25 0 0 0-2.25-2.25H6a2.25 0 0 0-2.25 2.25V18A2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 0 0 0 2.25-2.25V6A2.25 0 0 0 18 3.75h-2.25A2.25 0 0 0 13.5 6v2.25a2.25 0 0 0 2.25 2.25Z" /></svg>
                     Verse Connections
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    document.getElementById('vm-title').textContent = `${state.book} ${state.chapter}:${verseNum}`;

    // Show
    modal.classList.remove('hidden'); // Ensure visible
    setTimeout(() => {
        modal.querySelector('div.bg-white').classList.remove('translate-y-full');
    }, 10);
}

window.closeVerseActions = () => {
    const modal = document.getElementById('verse-modal');
    if (modal) {
        modal.querySelector('div.bg-white').classList.add('translate-y-full');
        setTimeout(() => modal.remove(), 300); // Remove from DOM to reset state logic easily
    }
    activeVerse = null;
};

window.addHighlight = async (color) => {
    // Check if exists
    const existing = await db.highlights.where('[translation+book+chapter+verse]').equals([state.translation, state.book, state.chapter, activeVerse]).first();

    if (existing) {
        if (existing.color === color) {
            // Remove (Toggle off)
            await db.highlights.delete(existing.id);
        } else {
            // Update
            await db.highlights.update(existing.id, { color });
        }
    } else {
        // Add
        await db.highlights.add({
            translation: state.translation,
            book: state.book,
            chapter: state.chapter,
            verse: activeVerse,
            color,
            timestamp: Date.now()
        });
    }
    closeVerseActions();
    renderReader(); // Re-render to show highlight
};

window.copyVerse = async () => {
    if (!state.currentVerses) return;
    const verseData = state.currentVerses.find(v => v.verse === activeVerse);
    if (verseData) {
        const text = `${verseData.text} (${state.book} ${state.chapter}:${verseData.verse} ${state.translation})`;
        try {
            await navigator.clipboard.writeText(text);
            alert('Verse copied to clipboard');
            closeVerseActions();
        } catch (e) {
            console.error('Copy failed', e);
        }
    }
};

window.openNoteEditor = async () => {
    // 1. Ensure highlight exists (if not, default to yellow)
    let highlight = await db.highlights.where('[translation+book+chapter+verse]').equals([state.translation, state.book, state.chapter, activeVerse]).first();

    if (!highlight) {
        // Create default yellow highlight
        const id = await db.highlights.add({
            translation: state.translation,
            book: state.book,
            chapter: state.chapter,
            verse: activeVerse,
            color: 'yellow',
            timestamp: Date.now()
        });
        highlight = await db.highlights.get(id);
    }

    // 2. Get existing note
    const note = await db.notes.where('highlightId').equals(highlight.id).first();

    // 3. Show Editor Modal (reuse or new simple one)
    const existingText = note ? note.text : '';

    // Simple prompt for MVP, or custom modal?
    // Let's use a custom modal for better UX than prompt()

    let modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl w-full max-w-sm p-4 shadow-xl">
            <h3 class="font-bold text-lg mb-2">Note for Verse ${activeVerse}</h3>
            <textarea id="note-input" class="w-full h-32 border border-stone-200 rounded-lg p-3 text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-400 resize-none" placeholder="Add your thoughts...">${existingText}</textarea>
            <div class="flex justify-end gap-2 mt-4">
                <button onclick="this.closest('.fixed').remove()" class="text-stone-500 font-medium px-4 py-2 hover:bg-stone-50 rounded-lg">Cancel</button>
                <button onclick="saveNote(${highlight.id}, this)" class="bg-stone-800 text-white font-medium px-4 py-2 rounded-lg hover:bg-stone-700">Save Note</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    closeVerseActions(); // Close bottom sheet
};

window.saveNote = async (highlightId, btn) => {
    const text = document.getElementById('note-input').value;

    const existing = await db.notes.where('highlightId').equals(highlightId).first();
    if (existing) {
        if (text.trim() === '') {
            await db.notes.delete(existing.id);
        } else {
            await db.notes.update(existing.id, { text, timestamp: Date.now() });
        }
    } else if (text.trim() !== '') {
        await db.notes.add({
            highlightId,
            text,
            timestamp: Date.now()
        });
    }

    btn.closest('.fixed').remove();
    // Maybe show toast?
};

window.showConnections = () => {
    closeVerseActions();
    if (activeVerse || state.currentVerses) {
        // Use active verse or default to verse 1?
        // If coming from Action sheet, activeVerse is set.
        const v = activeVerse || 1;
        connectionsController.showGraph(state.book, state.chapter, v);
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
    renderTranslationsList();
    handleRoute();
};

function getBookChapters(bookId) {
    // Helper to find chapter count. 
    // Assumes booksMeta loaded. If not, safe default 1 or rely on error handling.
    const meta = state.booksMeta.find(b => b.id === bookId);
    return meta ? meta.chapters : 999;
}

// --- Initialization ---

async function init() {
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

    // Player Events
    playerPlayBtn.addEventListener('click', () => tts.toggle());
    playerNextBtn.addEventListener('click', () => tts.next());
    playerSpeedBtn.addEventListener('click', () => {
        // Toggle speeds: 1 -> 1.5 -> 0.75 -> 1
        const rates = [1, 1.25, 1.5, 2, 0.75];
        const currentRateIdx = rates.indexOf(tts.rate);
        const nextRate = rates[(currentRateIdx + 1) % rates.length];
        tts.setSpeed(nextRate);
        playerSpeedBtn.textContent = nextRate + 'x';
    });

    // Initial Load
    await plansController.load();

    // Initial Route
    handleRoute();
}

init();
