// Database configuration using Dexie.js

export const db = new Dexie('BiblePWA_DB');

db.version(1).stores({
    // User Settings & State
    settings: 'key, value', // generic key-value store for preferences
    readingPosition: '++id, translation, book, chapter, verse, timestamp', // History of reading

    // User Created Content
    highlights: '++id, translation, book, chapter, verse, color, timestamp',
    notes: '++id, highlightId, text, timestamp',
    journal: '++id, title, content, date, tags', // content is rich text html/markdown
    plans: 'id, title, type, startDate, progress', // Reading plans

    // Cache content for offline usage
    translations: 'id, name, language, offlineAvailable',
    bibleCache: '[translation+book+chapter], content, timestamp' // Cache individual chapters
});

// Helper to save reading position
export async function saveReadingPosition(translation, book, chapter, verse = 1) {
    await db.readingPosition.put({
        id: 1, // Keep only one "current" position with ID 1, or use add for history
        translation,
        book,
        chapter,
        verse,
        timestamp: Date.now()
    });
}

// Helper to get last reading position
export async function getLastReadingPosition() {
    return await db.readingPosition.get(1);
}
