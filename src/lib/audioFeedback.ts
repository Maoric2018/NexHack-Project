// 🎙️ HYPE COACH - Emotional Basketball Commentary
// Uses Web Speech API with personality

class AudioCoach {
    private lastSpeakTime: number = 0;
    private minInterval: number = 1500; // ms between comments
    private isMuted: boolean = false;
    private lastPhrase: string = "";
    private shotCount: number = 0;
    private streakCount: number = 0;

    // 🔥 EXPANDED PHRASE LIBRARY with personality
    private phrases = {
        perfect: [
            // Hype reactions
            "SPLASH! That's WET!",
            "OH MY GOD, BUTTER!",
            "MONEY. STRAIGHT CASH.",
            "THAT'S WHAT I'M TALKING ABOUT!",
            "BANG! Nothing but net!",
            "ARE YOU KIDDING ME?!",
            "Shooter's TOUCH baby!",
            "ICE COLD!",
            "You see that?! FILTHY!",
            "BUCKETS ON BUCKETS!",
            // Funny ones
            "Call the cops, that was ROBBERY!",
            "Did I just witness greatness?!",
            "Yo, save some buckets for the rest of us!",
            "That hoop has a FAMILY!",
            "I didn't sign up to coach Steph Curry!",
            "Alexa, play Mask Off!",
            "You're making this look too easy!"
        ],
        goodShot: [
            "Nice! Good mechanics.",
            "Solid form, keep it up!",
            "That's the motion!",
            "Looking smooth!",
            "Good extension!",
            "Follow through was clean!",
            // Personality
            "Okay okay, I see you!",
            "Not bad, not bad at all!",
            "You're getting dangerous!",
            "That's what practice looks like!"
        ],
        miss: [
            // Encouraging
            "Shake it off, next one's going in!",
            "So close! Adjust and fire again.",
            "That rim is playing defense!",
            "We don't count those.",
            "The rim said NO but we say YES!",
            "Warm up shot, doesn't count!",
            // Funny
            "Brick? Never heard of her.",
            "The wind got that one... indoor wind.",
            "That one's still buffering.",
            "Air ball? More like care ball, you're being gentle!",
            "Oops! My grandma had that same shot!",
            "Did the hoop move? I think it moved."
        ],
        elbowTuck: [
            "Tuck that elbow in!",
            "Chicken wing alert! Keep it tight!",
            "Elbow's flaring, lock it under!",
            // Funny
            "Your elbow is trying to escape!",
            "That elbow said BYE BYE!"
        ],
        tooTight: [
            "Loosen up! You're too stiff!",
            "Relax that arm!",
            "Don't choke the shot!",
            // Personality
            "You look tense! Breathe!",
            "We're shooting hoops not doing surgery!"
        ],
        arc: [
            "Get some arc on that!",
            "Too flat! Aim for the clouds!",
            "Higher release!",
            // Fun
            "That shot needs a plane ticket - more AIR!",
            "We're shooting rainbows, not lasers!"
        ],
        power: [
            "Use your LEGS!",
            "More power!",
            "EXPLODE upward!",
            "Weak release, load up!",
            // Fun
            "Did you eat breakfast? Put some POWER on it!",
            "My grandma has more pop than that!"
        ],
        streak: [
            "On FIRE! Don't stop!",
            "YOU CAN'T MISS!",
            "UNSTOPPABLE!",
            "They can't guard you!",
            "HEAT CHECK!",
            // Fun
            "Somebody get the fire extinguisher!",
            "Is it hot in here or is it just YOU?!"
        ],
        coldStart: [
            "Let's get it!",
            "Time to cook!",
            "Show time!",
            "Lock in!",
            "Let's work!",
            // Fun
            "Rise and grind shooter!",
            "The gym is open, let's EAT!"
        ]
    };

    speak(type: keyof typeof this.phrases | 'custom', customText?: string) {
        if (this.isMuted) return;

        const now = Date.now();
        // Allow perfect shots and streaks to interrupt
        if (!['perfect', 'streak'].includes(type) && now - this.lastSpeakTime < this.minInterval) return;

        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            let text = customText || "";

            // Pick random phrase if type is standard
            if (type !== 'custom' && type in this.phrases) {
                const options = this.phrases[type as keyof typeof this.phrases];
                text = options[Math.floor(Math.random() * options.length)];

                // Prevent immediate repetition
                if (text === this.lastPhrase && options.length > 1) {
                    text = options.find(p => p !== text) || text;
                }
            }

            if (!text) return;
            this.lastPhrase = text;

            // Cancel previous speech to be responsive
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            // Voice Selection (Prioritize expressive voices)
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => v.name.includes("Google US English"))
                || voices.find(v => v.name.includes("Samantha"))
                || voices.find(v => v.name.includes("Daniel"))
                || voices.find(v => v.lang.startsWith('en'));

            if (preferredVoice) utterance.voice = preferredVoice;

            // EMOTIONAL VOICE ADJUSTMENTS
            switch (type) {
                case 'perfect':
                case 'streak':
                    // HYPE MODE - high energy
                    utterance.pitch = 1.2 + (Math.random() * 0.2);
                    utterance.rate = 1.3;
                    utterance.volume = 1.0;
                    break;
                case 'miss':
                    // Encouraging but chill
                    utterance.pitch = 0.95;
                    utterance.rate = 1.0;
                    break;
                case 'goodShot':
                    // Approving tone
                    utterance.pitch = 1.05;
                    utterance.rate = 1.15;
                    break;
                case 'coldStart':
                    // Pump up energy
                    utterance.pitch = 1.1;
                    utterance.rate = 1.2;
                    break;
                default:
                    // Coaching/instructional
                    utterance.pitch = 0.9 + (Math.random() * 0.1);
                    utterance.rate = 1.1;
            }

            window.speechSynthesis.speak(utterance);
            this.lastSpeakTime = now;
        }
    }

    // Track streaks for hype commentary
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
            if (this.streakCount >= 2) {
                // Streak broken
                this.speak('miss');
            }
            this.streakCount = 0;
            // Only comment on misses occasionally
            if (Math.random() > 0.6) {
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
