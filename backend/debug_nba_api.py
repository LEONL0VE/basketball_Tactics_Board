from nba_api.stats.endpoints import commonplayerinfo
import pandas as pd

# LeBron James ID
player_id = 2544

try:
    info = commonplayerinfo.CommonPlayerInfo(player_id=player_id)
    df = info.get_data_frames()[0]
    print("Columns:", df.columns.tolist())
    print("First row:", df.iloc[0].to_dict())
except Exception as e:
    print("Error:", e)
