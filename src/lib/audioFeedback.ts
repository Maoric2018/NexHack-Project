class AudioCoach {
    private lastSpeakTime: number = 0;
    private minInterval: number = 2000; // ms between comments
    private isMuted: boolean = false;
    private lastPhrase: string = "";

    // Humanized Phrase Library
    private phrases = {
        perfect: [
            "That's wet! 💦",
            "Money! 💰",
            "Perfect form.",
            "That's the one!",
            "Pure splash.",
            "buckets."
        ],
        elbowTuck: [
            "Tuck that elbow in.",
            "Elbow is flaring, keep it tight.",
            "Watch the chicken wing.",
            "Keep the elbow under the ball."
        ],
        tooTight: [
            "Too stiff, relax the arm.",
            "Extend that elbow out a bit.",
            "Don't choke the shot."
        ],
        arc: [
            "Get some air under it.",
            "Too flat, arc it up.",
            "Aim for the clouds.",
            "Higher release point."
        ],
        power: [
            "Explode up!",
            "Use your legs.",
            "Too soft, push it.",
            "Weak release."
        ]
    };

    speak(type: 'perfect' | 'elbowTuck' | 'tooTight' | 'arc' | 'power' | 'custom', customText?: string) {
        if (this.isMuted) return;

        const now = Date.now();
        // Allow perfect shots to interrupt, others adhere to interval
        if (type !== 'perfect' && now - this.lastSpeakTime < this.minInterval) return;

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            let text = customText || "";

            // Pick random phrase if type is standard
            if (type !== 'custom') {
                const options = this.phrases[type];
                text = options[Math.floor(Math.random() * options.length)];

                // Prevent immediate repetition
                if (text === this.lastPhrase && options.length > 1) {
                    text = options.find(p => p !== text) || text;
                }
            }

            this.lastPhrase = text;

            // Cancel previous speech to be responsive
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            // Voice Selection (Prioritize "Natural" voices)
            const voices = window.speechSynthesis.getVoices();
            // Try to find a good English voice (e.g. Google US English, Samantha)
            const preferredVoice = voices.find(v => v.name.includes("Google US English"))
                || voices.find(v => v.name.includes("Samantha"))
                || voices.find(v => v.lang.startsWith('en'));

            if (preferredVoice) utterance.voice = preferredVoice;

            // Humanize Pitch/Rate
            if (type === 'perfect') {
                utterance.pitch = 1.1 + (Math.random() * 0.2); // Higher pitch excitement
                utterance.rate = 1.2; // Faster
            } else {
                utterance.pitch = 0.9 + (Math.random() * 0.1); // Slightly serious/coaching tone
                utterance.rate = 1.1;
            }

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
