from nba_api.stats.endpoints import shotchartdetail
import pandas as pd
import time

# LeBron James Player ID
PLAYER_ID = 2544 
SEASON = '2013-14'

def fetch_shot_chart():
    print(f"Fetching shot chart data for LeBron James ({SEASON})...")
    
    try:
        # Fetch data from NBA API
        shot_chart = shotchartdetail.ShotChartDetail(
            team_id=0,
            player_id=PLAYER_ID,
            season_nullable=SEASON,
            context_measure_simple='FGA' # Field Goal Attempts
        )
        
        # Get DataFrame
        df = shot_chart.get_data_frames()[0]
        
        # Select relevant columns
        # LOC_X, LOC_Y are the coordinates relative to the hoop
        # SHOT_ZONE_BASIC, SHOT_ZONE_AREA, SHOT_ZONE_RANGE are useful for grouping
        columns_to_keep = [
            'PLAYER_NAME', 'GAME_DATE', 'ACTION_TYPE', 'SHOT_TYPE',
            'SHOT_ZONE_BASIC', 'SHOT_ZONE_AREA', 'SHOT_ZONE_RANGE', 'SHOT_DISTANCE',
            'LOC_X', 'LOC_Y', 'SHOT_MADE_FLAG'
        ]
        
        df_filtered = df[columns_to_keep]
        
        # Save to CSV
        filename = f"lebron_james_shot_chart_{SEASON}.csv"
        df_filtered.to_csv(filename, index=False)
        
        print(f"Successfully saved {len(df)} shots to {filename}")
        print(df_filtered.head())
        
    except Exception as e:
        print(f"Error fetching data: {e}")

if __name__ == "__main__":
    fetch_shot_chart()
