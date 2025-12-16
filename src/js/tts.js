export class TTSController {
    constructor(callbacks) {
        this.synth = window.speechSynthesis;
        this.utterance = null;
        this.verses = []; // Array of { verse: number, text: string }
        this.currentIndex = 0;
        this.isPlaying = false;
        this.rate = 1.0;

        // Callbacks
        this.onVerseStart = callbacks.onVerseStart || (() => { });
        this.onStateChange = callbacks.onStateChange || (() => { }); // (isPlaying, currentVerseIndex)
        this.onChapterEnd = callbacks.onChapterEnd || (() => { });
        this.onError = callbacks.onError || console.error;

        // Sleep Timer
        this.sleepTimerId = null;
        this.sleepEndTime = null;

        // Voice Init
        this.voices = [];
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => this.loadVoices();
        }
        this.loadVoices();

        // Media Session Init
        this.initMediaSession();
    }

    loadVoices() {
        this.voices = this.synth.getVoices();
        // Try to find a good English voice
        // Prefer "Google US English" or "Samantha" or similar
        this.selectedVoice = this.voices.find(v => v.name.includes('Google US English'))
            || this.voices.find(v => v.name.includes('Samantha'))
            || this.voices.find(v => v.lang === 'en-US')
            || this.voices[0];
    }

    initMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.resume());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
        }
    }

    updateMediaSession(title, artist) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title,
                artist: artist,
                album: 'Verse Path Bible',
                artwork: [{ src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            });
        }
    }

    loadChapter(verses, startIndex = 0) {
        this.cancel();
        this.verses = verses;
        this.currentIndex = startIndex;
    }

    startSleepTimer(minutes) {
        this.cancelSleepTimer();
        if (minutes > 0) {
            console.log(`Sleep timer set for ${minutes} minutes`);
            this.sleepTimerId = setTimeout(() => {
                console.log('Sleep timer triggered');
                this.pause();
                this.sleepTimerId = null;
            }, minutes * 60 * 1000);
        }
    }

    cancelSleepTimer() {
        if (this.sleepTimerId) {
            clearTimeout(this.sleepTimerId);
            this.sleepTimerId = null;
        }
    }

    play() {
        if (this.synth.paused && this.isPlaying) {
            this.synth.resume();
            this.notifyState();
            return;
        }

        if (this.currentIndex >= this.verses.length) {
            this.onChapterEnd();
            return;
        }

        this.isPlaying = true;
        this.speakVerse(this.currentIndex);
        this.notifyState();
    }

    speakVerse(index) {
        if (index >= this.verses.length) {
            this.onChapterEnd();
            return;
        }

        this.currentIndex = index;
        this.cancel(); // Stop current

        const verseData = this.verses[index];
        // Clean text reference like [1] tags if they exist in text
        const text = verseData.text.replace(/\[\d+\]/g, '');

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.selectedVoice;
        utterance.rate = this.rate;

        utterance.onstart = () => {
            if (this.onVerseStart) this.onVerseStart(verseData.verse, index);
        };

        utterance.onend = () => {
            // Only advance if we are still "playing" (not cancelled manually)
            // However, cancel() triggers onend with no error usually.
            // We need to check if we should continue.
            if (this.isPlaying) {
                this.currentIndex++;
                if (this.currentIndex < this.verses.length) {
                    this.speakVerse(this.currentIndex);
                } else {
                    this.isPlaying = false;
                    this.notifyState();
                    this.onChapterEnd();
                }
            }
        };

        utterance.onerror = (e) => {
            console.error('TTS Error', e);
            this.isPlaying = false;
            this.notifyState();
            if (this.onError) this.onError(e);
        };

        this.utterance = utterance;
        this.synth.speak(utterance);
    }

    pause() {
        if (this.synth.speaking && !this.synth.paused) {
            this.synth.pause();
            this.isPlaying = false; // Logically paused
            this.notifyState();
        }
    }

    resume() {
        if (this.synth.paused) {
            this.synth.resume();
            this.isPlaying = true;
            this.notifyState();
        } else if (!this.synth.speaking && this.verses.length > 0) {
            this.play();
        }
    }

    toggle() {
        if (this.isPlaying && this.synth.speaking && !this.synth.paused) {
            this.pause();
        } else {
            // Resume or Play
            if (this.synth.paused) this.resume();
            else this.play();
        }
    }

    next() {
        if (this.currentIndex + 1 < this.verses.length) {
            this.speakVerse(this.currentIndex + 1);
        } else {
            this.onChapterEnd();
        }
    }

    prev() {
        if (this.currentIndex > 0) {
            this.speakVerse(this.currentIndex - 1);
        } else {
            // Restart current or go to prev chapter? restart for now
            this.speakVerse(0);
        }
    }

    setSpeed(rate) {
        this.rate = rate;
        // If speaking, we need to restart current utterance to change rate
        if (this.synth.speaking) {
            const wasPaused = this.synth.paused;
            this.cancel();
            // Restart current verse
            if (this.isPlaying && !wasPaused) {
                this.speakVerse(this.currentIndex);
            }
        }
    }

    cancel() {
        this.synth.cancel();
    }

    notifyState() {
        if (this.onStateChange) this.onStateChange(this.isPlaying, this.currentIndex);
    }
}
