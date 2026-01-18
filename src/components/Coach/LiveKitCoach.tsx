"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    useLocalParticipant,
    useRoomContext,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { ShotRecord } from '@/lib/shotTypes';
import { RoomEvent } from "livekit-client";

interface LiveKitCoachProps {
    onDataChannelReady?: (sendFn: (data: any) => void) => void;
}

export function LiveKitCoach({ onDataChannelReady }: LiveKitCoachProps) {
    const [token, setToken] = useState("");
    const [url, setUrl] = useState("");

    const roomName = "coach-session-" + (Math.random().toString(36).substring(7));

    useEffect(() => {
        (async () => {
            try {
                const resp = await fetch(`/api/livekit/token?room=${roomName}&username=user`);
                const data = await resp.json();
                setToken(data.token);
                setUrl(process.env.NEXT_PUBLIC_LIVEKIT_URL || "");
            } catch (e) {
                console.error(e);
            }
        })();
    }, []);

    if (token === "") {
        return <div className="text-xs text-gray-500">Initializing Coach Link...</div>;
    }

    return (
        <LiveKitRoom
            video={false}
            audio={true}
            token={token}
            serverUrl={url}
            data-lk-theme="default"
            connect={true}
            className="hidden" // Hidden because we only need audio
            onConnected={() => console.log("Connected to LiveKit as User")}
        >
            <InnerCoach onDataChannelReady={onDataChannelReady} />
            <RoomAudioRenderer />
        </LiveKitRoom>
    );
}

function InnerCoach({ onDataChannelReady }: { onDataChannelReady?: (fn: (d: any) => void) => void }) {
    const { localParticipant } = useLocalParticipant();
    const [isMicOn, setIsMicOn] = useState(true);
    const [coachMessage, setCoachMessage] = useState<string | null>(null);

    // Expose the send function
    const sendData = useCallback((payload: any) => {
        if (!localParticipant) return;

        const str = JSON.stringify(payload);
        const encoder = new TextEncoder();
        const data = encoder.encode(str);

        localParticipant.publishData(data, { reliable: true });
        // console.log("Sent data:", payload); 
    }, [localParticipant]);

    useEffect(() => {
        if (onDataChannelReady) {
            onDataChannelReady(sendData);
        }
    }, [onDataChannelReady, sendData]);

    // Handle Mic Toggle
    const toggleMic = async () => {
        if (localParticipant) {
            setIsMicOn(!isMicOn);
            localParticipant.setMicrophoneEnabled(!isMicOn);
        }
    };


    return (
        <>
            <CoachListener onMessage={(text) => {
                setCoachMessage(text);
                // Simple TTS
                const u = new SpeechSynthesisUtterance(text);
                const voices = window.speechSynthesis.getVoices();
                // Try to find a good Google voice if on Chrome
                const goodVoice = voices.find(v => v.name.includes("Google US English")) || voices[0];
                if (goodVoice) u.voice = goodVoice;
                u.rate = 1.1;
                window.speechSynthesis.speak(u);
            }} />

            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
                {coachMessage && (
                    <div className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 px-4 py-2 rounded-lg mb-2 text-sm font-mono max-w-[200px] text-right animate-in slide-in-from-right fade-in backdrop-blur-md">
                        "{coachMessage}"
                    </div>
                )}
                <div className="flex items-center gap-3 bg-black/80 backdrop-blur-md border border-cyan-500/30 px-4 py-2 rounded-full">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs font-bold text-cyan-400">AI COACH ONLINE</span>
                    </div>
                    <div className="h-4 w-px bg-white/20" />
                    <button onClick={toggleMic} className="hover:text-cyan-400 transition-colors">
                        {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-400" />}
                    </button>
                </div>
            </div>
        </>
    );
}

function CoachListener({ onMessage }: { onMessage: (msg: string) => void }) {
    const room = useRoomContext();

    useEffect(() => {
        if (!room) return;

        const handleData = (payload: Uint8Array, participant: any, kind: any) => {
            const str = new TextDecoder().decode(payload);
            try {
                const msg = JSON.parse(str);
                if (msg.type === "COACH_VOICE") {
                    onMessage(msg.text);
                }
            } catch (e) { console.error(e); }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => { room.off(RoomEvent.DataReceived, handleData); };
    }, [room, onMessage]);

    return null;
}
