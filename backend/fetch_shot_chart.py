from nba_api.stats.endpoints import shotchartdetail
from nba_api.stats.static import players
import pandas as pd
import json
import time

def get_player_id(player_name):
    nba_players = players.get_players()
    for player in nba_players:
        if player['full_name'].lower() == player_name.lower():
            return player['id']
    return None

def fetch_player_shot_chart(player_name, season='2023-24'):
    player_id = get_player_id(player_name)
    if not player_id:
        print(f"Player {player_name} not found.")
        return None

    print(f"Fetching shot chart for {player_name} (ID: {player_id}) Season: {season}...")
    
    try:
        # Fetch shot chart data
        shot_chart = shotchartdetail.ShotChartDetail(
            team_id=0,
            player_id=player_id,
            season_nullable=season,
            context_measure_simple='FGA'
        )
        
        # Get DataFrame
        df = shot_chart.get_data_frames()[0]
        
        # Check if data is empty
        if df.empty:
            print("No shot data found.")
            return None

        # Group by Shot Zone
        # NBA data has 'SHOT_ZONE_BASIC', 'SHOT_ZONE_AREA', 'SHOT_ZONE_RANGE'
        # We will combine Basic and Area for detailed zones
        
        # Define a custom zone key
        df['CustomZone'] = df['SHOT_ZONE_BASIC'] + " - " + df['SHOT_ZONE_AREA']
        
        # Aggregate
        zone_stats = df.groupby(['SHOT_ZONE_BASIC', 'SHOT_ZONE_AREA']).agg(
            FGM=('SHOT_MADE_FLAG', 'sum'),
            FGA=('SHOT_ATTEMPTED_FLAG', 'count')
        ).reset_index()
        
        # Calculate Percentage
        zone_stats['PCT'] = (zone_stats['FGM'] / zone_stats['FGA']).round(3)
        
        # Convert to dictionary format for frontend
        # Structure: { "Zone Name": { "pct": 0.45, "attempts": 150 } }
        hot_zones = {}
        
        for _, row in zone_stats.iterrows():
            zone_key = f"{row['SHOT_ZONE_BASIC']} ({row['SHOT_ZONE_AREA']})"
            hot_zones[zone_key] = {
                "pct": row['PCT'],
                "fga": int(row['FGA']),
                "fgm": int(row['FGM'])
            }
            
        return hot_zones

    except Exception as e:
        print(f"Error fetching data: {e}")
        return None

if __name__ == "__main__":
    # Test with Stephen Curry
    player_name = "Stephen Curry"
    zones = fetch_player_shot_chart(player_name)
    
    if zones:
        print(f"\nShot Chart Data for {player_name}:")
        print(json.dumps(zones, indent=2))
        
        # Save to a file for inspection
        with open('backend/data/curry_shot_chart.json', 'w') as f:
            json.dump(zones, f, indent=2)
        print("\nSaved to backend/data/curry_shot_chart.json")
