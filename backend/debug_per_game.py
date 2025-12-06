from nba_api.stats.endpoints import playercareerstats
import pandas as pd

# LeBron James ID
player_id = 2544

try:
    print("Fetching Career Stats PerGame...")
    # The parameter is often 'PerMode' or 'per_mode' depending on the version/endpoint wrapper
    # In nba_api, it's usually passed as a keyword argument that matches the API parameter name.
    # The API parameter is 'PerMode'.
    career = playercareerstats.PlayerCareerStats(player_id=player_id, per_mode36='PerGame', timeout=10)
    df = career.get_data_frames()[0]
    if not df.empty:
        print("Columns:", df.columns.tolist())
        latest = df.iloc[-1]
        print("Latest Season Stats:", latest[['PTS', 'REB', 'AST', 'FG_PCT', 'FG3_PCT']].to_dict())
        # Check for 2PT%
        if 'FG2_PCT' in df.columns:
            print("FG2_PCT found!")
        else:
            print("FG2_PCT not found.")
    else:
        print("DataFrame is empty")

except Exception as e:
    print(f"Error: {e}")
