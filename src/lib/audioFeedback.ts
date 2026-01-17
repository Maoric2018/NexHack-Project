class AudioCoach {
    private lastSpeakTime: number = 0;
    private minInterval: number = 2500; // ms between comments
    private isMuted: boolean = false;

    speak(text: string, force: boolean = false) {
        if (this.isMuted) return;

        const now = Date.now();
        if (!force && now - this.lastSpeakTime < this.minInterval) return;

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            // Cancel previous speech if forceful
            if (force) window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.1; // Slightly faster
            utterance.pitch = 1.0;
            // distinct voice if possible?
            // const voices = window.speechSynthesis.getVoices();
            // utterance.voice = voices.find(v => v.lang === 'en-US' && v.name.includes("Male")) || null;

            window.speechSynthesis.speak(utterance);
            this.lastSpeakTime = now;
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }
}

export const audioCoach = new AudioCoach();
