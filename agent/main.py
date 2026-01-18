
import asyncio
import logging
import json
import os
import google.generativeai as genai
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import JobContext, WorkerOptions, cli, JobRequest
from livekit.agents.llm import LLM, ChatContext, ChatMessage

load_dotenv()

# Configure Gemini
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')

logger = logging.getLogger("coach-agent")
logger.setLevel(logging.INFO)

async def entrypoint(ctx: JobContext):
    logger.info("Agent starting...")
    
    # Connect to the Room
    await ctx.connect()
    
    # Identify the user (assuming the first other participant is the user)
    participant = None
    
    logger.info("Waiting for participant...")
    
    # Simple logic: Listen for Data Packets
    @ctx.room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        # Decode data
        payload_str = data_packet.data.decode('utf-8')
        logger.info(f"Received: {payload_str}")
        
        try:
            payload = json.loads(payload_str)
            if payload.get("type") == "SHOT_EVENT":
                asyncio.create_task(handle_shot(ctx, payload["data"]))
        except Exception as e:
            logger.error(f"Error parsing data: {e}")

    logger.info("Agent ready and listening for shots.")

async def handle_shot(ctx: JobContext, data: dict):
    is_perfect = data.get("isPerfect")
    angle = data.get("elbowAngle")
    feedback = data.get("feedback")
    
    # 1. Ask Gemini for a coaching tip
    prompt = f"""
    You are a professional basketball shooting coach. 
    A player just took a shot.
    Stats:
    - Result: {"SWISH (Perfect)" if is_perfect else "MISS"}
    - Elbow Angle: {angle} degrees (Ideal is 90).
    - System Feedback: {feedback}
    
    Give a VERY SHORT, punchy coaching tip (max 10 words). 
    If it was a swish, hype them up. 
    If it was a miss, tell them how to fix the angle.
    Don't say "Coach:" or anything, just the spoken text.
    """
    
    try:
        response = await model.generate_content_async(prompt)
        text_response = response.text.strip()
        logger.info(f"Coach says: {text_response}")
        
        # 2. Text-to-Speech (Simplified for Hackathon: Just Send Text back over Data for now, OR simulate speaking)
        # Note: True TTS requires `livekit-plugins-elevenlabs` or similar. 
        # Since we only have Gemini, we will send the TEXT back via Data Channel so the Frontend can display it (or speak it if it has local TTS).
        # AND we will try to use the *experimental* LiveKit TTS if available, but to be safe, let's send text.
        
        reply = json.dumps({
            "type": "COACH_VOICE",
            "text": text_response
        })
        
        await ctx.room.local_participant.publish_data(
            reply.encode('utf-8'),
            reliable=True
        )
        
    except Exception as e:
        logger.error(f"Gemini error: {e}")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
