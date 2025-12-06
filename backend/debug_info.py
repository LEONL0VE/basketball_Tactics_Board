from nba_api.stats.endpoints import commonplayerinfo, playercareerstats
import pandas as pd
import sys

# LeBron James ID
player_id = 2544

print("Testing connection...")

try:
    # Test 1: Stats (which seems to work)
    print("Fetching Career Stats...")
    career = playercareerstats.PlayerCareerStats(player_id=player_id, timeout=10)
    df_stats = career.get_data_frames()[0]
    print(f"Stats fetched. Rows: {len(df_stats)}")
except Exception as e:
    print(f"Stats failed: {e}")

try:
    # Test 2: Common Info (which seems to fail)
    print("Fetching Common Info...")
    info = commonplayerinfo.CommonPlayerInfo(player_id=player_id, timeout=10)
    df_info = info.get_data_frames()[0]
    print(f"Info fetched. Rows: {len(df_info)}")
    if not df_info.empty:
        print("Columns:", df_info.columns.tolist())
        print("Row 0:", df_info.iloc[0].to_dict())
    else:
        print("Info DataFrame is empty")
except Exception as e:
    print(f"Info failed: {e}")
