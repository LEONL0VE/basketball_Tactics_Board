import os, asyncio, httpx; async def main():
    url='https://generativelanguage.googleapis.com/v1beta/models/gemini-play:generateContent'; print('starting...'); 
    try:
        async with httpx.AsyncClient(timeout=15.0) as c: r=await c.get('https://google.com'); print('ok')
    except Exception as e: print(type(e), e)
asyncio.run(main())