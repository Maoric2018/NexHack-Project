// 🎙️ CONSTRUCTIVE COACH - Basketball Form Feedback
// Uses Web Speech API with calm, supportive tone

class AudioCoach {
    private lastSpeakTime: number = 0;
    private minInterval: number = 2000; // ms between comments
    private isMuted: boolean = false;
    private lastPhrase: string = "";
    private shotCount: number = 0;
    private streakCount: number = 0;

    // ✅ CONSTRUCTIVE FEEDBACK LIBRARY
    private phrases = {
        perfect: [
            "Beautiful form. Keep that consistency.",
            "Clean release. That's the technique.",
            "Excellent follow-through.",
            "Great arc on that shot.",
            "Perfect elbow alignment.",
            "That's textbook form right there.",
            "Smooth release, nice work.",
            "Your mechanics are looking solid."
        ],
        goodShot: [
            "Good shot. Mechanics are improving.",
            "Nice extension on that one.",
            "Good balance through the release.",
            "Your wrist snap is getting stronger.",
            "Solid fundamental form."
        ],
        miss: [
            "Stay focused. Visualize the arc before your next shot.",
            "Try squaring your shoulders a bit more to the basket.",
            "Focus on a higher release point next time.",
            "Keep your eyes on the rim through the follow-through.",
            "Slight adjustment needed. You've got this."
        ],
        elbowTuck: [
            "Try bringing your elbow in closer to your body.",
            "Keep your shooting elbow aligned under the ball.",
            "Focus on elbow position for better accuracy."
        ],
        tooTight: [
            "Relax your grip slightly for a smoother release.",
            "Loosen your wrist for better rotation.",
            "Try a more fluid motion through the shot."
        ],
        arc: [
            "Aim for a higher arc. It increases your margin for error.",
            "Try releasing at a higher point.",
            "A steeper entry angle gives you more room."
        ],
        power: [
            "Engage your legs more for power.",
            "Drive through your lower body.",
            "Use your legs to generate force, not just your arm."
        ],
        streak: [
            "You're in rhythm. Keep the same form.",
            "Consistent mechanics. Stay focused.",
            "Great sequence. Maintain that release point."
        ],
        coldStart: [
            "Ready? Focus on form first.",
            "Let's work on your technique.",
            "Take your time. Quality over quantity.",
            "Let's get some good reps in."
        ]
    };

    speak(type: keyof typeof this.phrases | 'custom', customText?: string) {
        if (this.isMuted) return;

        const now = Date.now();
        if (now - this.lastSpeakTime < this.minInterval) return;

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            let text = customText || "";

            if (type !== 'custom' && type in this.phrases) {
                const options = this.phrases[type as keyof typeof this.phrases];
                text = options[Math.floor(Math.random() * options.length)];

                if (text === this.lastPhrase && options.length > 1) {
                    text = options.find(p => p !== text) || text;
                }
            }

            if (!text) return;
            this.lastPhrase = text;

            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            // Voice Selection (Prioritize calm, clear voices)
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes("Google UK English Male"))
                || voices.find(v => v.name.includes("Daniel"))
                || voices.find(v => v.name.includes("Alex"))
                || voices.find(v => v.name.includes("Google US English"))
                || voices.find(v => v.lang.startsWith('en'));

            if (preferredVoice) utterance.voice = preferredVoice;

            // Calm, supportive voice settings
            utterance.pitch = 0.95;
            utterance.rate = 0.95;
            utterance.volume = 0.9;

            window.speechSynthesis.speak(utterance);
            this.lastSpeakTime = now;
        }
    }

    recordShot(isPerfect: boolean) {
        this.shotCount++;
        if (isPerfect) {
            this.streakCount++;
            if (this.streakCount >= 3) {
                this.speak('streak');
            } else {
                this.speak('perfect');
            }
        } else {
            this.streakCount = 0;
            // Only give constructive feedback occasionally, not every miss
            if (Math.random() > 0.5) {
                this.speak('miss');
            }
        }
    }

    sessionStart() {
        this.shotCount = 0;
        this.streakCount = 0;
        this.speak('coldStart');
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }
}

export const audioCoach = new AudioCoach();
