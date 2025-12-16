import { db } from './db.js';

const API_BASE_URL = 'https://bible-api.com';

export class BibleClient {
    // Fetch a single chapter
    async getChapter(translation, book, chapter) {
        // 1. Check Offline Cache first
        // We use a composite key: "[translation+book+chapter]"
        const cacheKey = [translation, book, chapter];
        const cached = await db.bibleCache.where('[translation+book+chapter]').equals(cacheKey).first();

        if (cached) {
            console.log('Serving from Cache:', cacheKey);
            return cached.content;
        }

        // 2. Fetch from API
        // bible-api.com format: /book+chapter?translation=web
        // e.g. /Genesis+1?translation=web
        try {
            const response = await fetch(`${API_BASE_URL}/${book}+${chapter}?translation=${translation.toLowerCase()}`);
            if (!response.ok) throw new Error('Network response was not ok');

            const data = await response.json();

            // Transform to our internal format if needed, or store as is.
            // bible-api.com returns: { reference: "Genesis 1", text: "...", verses: [...] }
            // We want to store it.

            const content = {
                reference: data.reference,
                verses: data.verses,
                next_chapter: data.next_chapter,
                previous_chapter: data.previous_chapter
            };

            // 3. Cache it (non-blocking)
            // Note: If user downloads full translation, we populate this cache in bulk.
            // For now, cache individual reads.
            await db.bibleCache.put({
                translation,
                book,
                chapter: parseInt(chapter),
                content,
                timestamp: Date.now()
            });

            return content;

        } catch (error) {
            console.error('Fetch error:', error);
            throw error;
        }
    }

    // Download full translation for offline use
    async downloadTranslation(translationId) {
        console.log('Downloading', translationId);

        // Source URLs for full JSONs (using known open-source repos)
        // WEB: https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_web.json
        // KJV: https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json

        let url = '';
        if (translationId === 'WEB') url = 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_web.json';
        else if (translationId === 'KJV') url = 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json';
        else throw new Error('Offline source not available for this translation yet.');

        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to download translation');

        const data = await response.json();
        // Data format is typically Array of Objects: { abbreviation: "gn", chapters: [ ... ] } or similar
        // thiagobodruk/bible format is: [ {abbreviation: "gn", name: "Genesis", chapters: [ ["1", "In the..."], ... ]} ]
        // We need to normalize this to our db.bibleCache format.

        const bulkItems = [];
        const timestamp = Date.now();

        // Mapping raw abbreviation to our standard IDs (simplified)
        // This is tricky because raw source uses "gn", "ex", etc. We use "GEN", "EXO".
        // We might need a small map function.
        // For MVP, let's assume standard order match or simple mapping.

        for (const bookData of data) {
            // Map abbreviation "gn" -> "GEN" ?
            // We can check our books.json meta, or just rely on order if safe.
            // Let's rely on standard ID mapping helper.
            const stdId = this.mapBookId(bookData.name);
            if (!stdId) continue;

            bookData.chapters.forEach((verses, chIndex) => {
                const chapterNum = chIndex + 1;
                const verseObjects = verses.map((text, vIndex) => ({
                    verse: vIndex + 1,
                    text: text
                }));

                bulkItems.push({
                    translation: translationId,
                    book: stdId,
                    chapter: chapterNum,
                    content: {
                        reference: `${bookData.name} ${chapterNum}`,
                        verses: verseObjects
                    },
                    timestamp
                });
            });
        }

        await db.bibleCache.bulkPut(bulkItems);
        return true;
    }

    mapBookId(rawName) {
        // Simple map based on name match
        // Ideally we import the books.json here, but let's hardcode a few or accept risk for MVP demo
        // Better: Use a reliable mapping object.
        const map = {
            "Genesis": "GEN", "Exodus": "EXO", "Leviticus": "LEV", "Numbers": "NUM", "Deuteronomy": "DEU",
            "Joshua": "JOS", "Judges": "JDG", "Ruth": "RUT", "1 Samuel": "1SA", "2 Samuel": "2SA",
            "1 Kings": "1KI", "2 Kings": "2KI", "1 Chronicles": "1CH", "2 Chronicles": "2CH",
            "Ezra": "EZR", "Nehemiah": "NEH", "Esther": "EST", "Job": "JOB", "Psalms": "PSA",
            "Proverbs": "PRO", "Ecclesiastes": "ECC", "Song of Solomon": "SNG", "Isaiah": "ISA",
            "Jeremiah": "JER", "Lamentations": "LAM", "Ezekiel": "EZK", "Daniel": "DAN",
            "Hosea": "HOS", "Joel": "JOL", "Amos": "AMO", "Obadiah": "OBA", "Jonah": "JON",
            "Micah": "MIC", "Nahum": "NAM", "Habakkuk": "HAB", "Zephaniah": "ZEP", "Haggai": "HAG",
            "Zechariah": "ZEC", "Malachi": "MAL",
            "Matthew": "MAT", "Mark": "MRK", "Luke": "LUK", "John": "JHN", "Acts": "ACT",
            "Romans": "ROM", "1 Corinthians": "1CO", "2 Corinthians": "2CO", "Galatians": "GAL",
            "Ephesians": "EPH", "Philippians": "PHP", "Colossians": "COL", "1 Thessalonians": "1TH",
            "2 Thessalonians": "2TH", "1 Timothy": "1TI", "2 Timothy": "2TI", "Titus": "TIT",
            "Philemon": "PHM", "Hebrews": "HEB", "James": "JAS", "1 Peter": "1PE", "2 Peter": "2PE",
            "1 John": "1JN", "2 John": "2JN", "3 John": "3JN", "Jude": "JUD", "Revelation": "REV"
        };
        return map[rawName] || null;
    }
}

export const bibleClient = new BibleClient();
