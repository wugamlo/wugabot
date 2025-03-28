
from google import genai
from google.genai import types
import os
import logging

logger = logging.getLogger(__name__)

class GoogleAIHandler:
    def __init__(self):
        api_key = os.getenv('GOOGLE_API_KEY')
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set")
        self.client = genai.Client(api_key=api_key)
        
    async def generate_response(self, messages, model="gemini-pro", temperature=0.7):
        try:
            # Initialize model
            model = self.client.models.get_model(model)
            
            # Create chat
            chat = model.start_chat()
            
            # Send messages
            for msg in messages:
                if msg["role"] != "system":  # Skip system messages
                    response = await chat.send_message(
                        contents=[{"text": msg["content"]}],
                        generation_config={"temperature": temperature}
                    )
            
            # Format response to match Venice format
            return {
                "content": response.text,
                "role": "assistant"
            }
            
        except Exception as e:
            logger.error(f"Google AI generation error: {str(e)}")
            raise
