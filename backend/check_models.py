
import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY not found in .env")
    exit(1)

print(f"Checking models with key: {api_key[:10]}...")

try:
    client = genai.Client(api_key=api_key)
    # List models
    # Note: the new SDK list_models might return an iterator or specific object structure
    # We'll try to iterate and print
    for model in client.models.list(config={"page_size": 100}):
        print(f"Model: {model.name}")
        print(f"  Display Name: {model.display_name}")
        print(f"  Supported Actions: {model.supported_generation_methods}")
        print("-" * 20)
        
except Exception as e:
    print(f"Error listing models: {e}")
