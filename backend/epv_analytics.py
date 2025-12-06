import numpy as np
import pandas as pd
from monte_carlo import MCPlayer, run_monte_carlo_simulation

# Court Constants
# Frontend uses pixels with SCALE = 45 (1 meter = 45 pixels)
# We must convert pixels to meters for analysis
SCALE = 45.0

# NBA/FIBA Court Dimensions in Meters
# Frontend: Width (X) = 28.65m, Height (Y) = 15.24m
# Hoop is at (1.575, 7.62) for the left side
HOOP_X = 1.575 
HOOP_Y = 7.62 

def calculate_epv_series(kinematics_df, shot_chart_data=None):
    """
    Rule-based Custom EPV (Expected Score) Calculation
    Formula: ES = Potential Points * Base Pct * (1 - Defense Pressure + Screen Bonus)
    """
    epv_curve = []
    
    # Get all frames
    if kinematics_df.empty:
        return []

    # --- 1. Coordinate Conversion (Pixels -> Meters) ---
    # The frontend sends raw pixel coordinates. We convert them to meters here.
    kinematics_df = kinematics_df.copy()
    kinematics_df['x'] = kinematics_df['x'] / SCALE
    kinematics_df['y'] = kinematics_df['y'] / SCALE

    # --- 1.5 Calculate Velocity (Needed for Monte Carlo) ---
    # Sort by id and frame to calculate diff
    kinematics_df = kinematics_df.sort_values(['id', 'frame'])
    kinematics_df['vx'] = kinematics_df.groupby('id')['x'].diff() / 0.04 # dt=0.04
    kinematics_df['vy'] = kinematics_df.groupby('id')['y'].diff() / 0.04
    kinematics_df['vx'] = kinematics_df['vx'].fillna(0.0)
    kinematics_df['vy'] = kinematics_df['vy'].fillna(0.0)

    frame_indices = sorted(kinematics_df['frame'].unique())
    
    # History for smoothing
    history_es = []
    
    for f in frame_indices:
        frame_data = kinematics_df[kinematics_df['frame'] == f]
        
        # 2. Identify Ball Handler
        # Logic: Find ball, then find closest player
        ball = frame_data[frame_data['type'] == 'ball']
        if ball.empty:
            # If no ball, assume 0 or last value
            epv_curve.append({'frame': int(f), 'timestamp': 0.0, 'epv': 0.0})
            continue
            
        ball = ball.iloc[0]
        
        # Find all players
        players = frame_data[frame_data['type'] == 'player']
        if players.empty:
            epv_curve.append({'frame': int(f), 'timestamp': float(ball['timestamp']), 'epv': 0.0})
            continue

        # Calculate distance to ball for each player
        # Threshold 2.0m is generous enough to catch dribbling
        players = players.copy()
        players['dist_to_ball'] = np.sqrt((players['x'] - ball['x'])**2 + (players['y'] - ball['y'])**2)
        ball_handler = players[players['dist_to_ball'] < 2.0].sort_values('dist_to_ball')
        
        current_es = 0.0
        
        if not ball_handler.empty:
            handler = ball_handler.iloc[0]
            handler_team = handler['team']
            
            # --- A. Base Score Expectation (Base Value) ---
            dist_to_hoop = np.sqrt((handler['x'] - HOOP_X)**2 + (handler['y'] - HOOP_Y)**2)
            
            # Zone determination
            is_3pt = dist_to_hoop > 6.75 # FIBA/NBA 3pt line approx 6.75m - 7.24m
            shot_value = 3 if is_3pt else 2
            
            # Base Accuracy Model (Closer is better)
            # Rim (0m): 70%, 3pt (7m): 35%, Mid-court (14m): 0%
            if dist_to_hoop < 1.5:
                base_pct = 0.70
            elif is_3pt:
                base_pct = 0.38 # Good shooter open look
            else:
                # Mid-range 1.5m - 6.75m -> 45% - 40%
                base_pct = 0.45 - (dist_to_hoop - 1.5) * 0.01
            
            base_pct = max(0.0, base_pct)
            
            # --- B. Defense Pressure ---
            # Find closest opponent
            defenders = players[players['team'] != handler_team]
            pressure_factor = 0.0 # 0 = Open, 1 = Fully Contested
            
            if not defenders.empty:
                dists = np.sqrt((defenders['x'] - handler['x'])**2 + (defenders['y'] - handler['y'])**2)
                min_def_dist = dists.min()
                
                # Pressure Model: Closer is more pressure
                # 0.5m -> 1.0 (Full contest), 3.0m -> 0.0 (Open)
                if min_def_dist < 0.5:
                    pressure_factor = 1.0
                elif min_def_dist > 3.0:
                    pressure_factor = 0.0
                else:
                    # Linear decay
                    pressure_factor = 1.0 - (min_def_dist - 0.5) / 2.5
            
            # --- C. Teammate Screening / Crowding ---
            # Find closest teammate (excluding self)
            teammates = players[(players['team'] == handler_team) & (players['id'] != handler['id'])]
            screen_relief = 0.0 # Relief from pressure due to screen
            crowding_penalty = 0.0 # Penalty due to crowding
            is_screen_active = False

            if not teammates.empty:
                tm_dists = np.sqrt((teammates['x'] - handler['x'])**2 + (teammates['y'] - handler['y'])**2)
                min_tm_dist = tm_dists.min()
                
                if min_tm_dist < 2.0:
                    # [Screen Detection] Teammate very close, assume Pick & Roll / Screen
                    # Effect: Significantly reduce defense pressure
                    screen_relief = 0.6 # Reduce pressure by 60%
                    is_screen_active = True
                elif min_tm_dist < 3.5:
                    # [Crowding Detection] Teammate close but not screening
                    # Effect: Increase pressure (brings extra defender)
                    crowding_penalty = 0.1 # Increase pressure by 10%
            
            # --- D. Final Calculation ---
            # Final Pressure = Raw Pressure * (1 - Relief) + Crowding
            final_pressure = pressure_factor * (1.0 - screen_relief) + crowding_penalty
            final_pressure = min(1.0, max(0.0, final_pressure)) # Clamp 0-1
            
            # Impact on Accuracy
            # Full Pressure -> 0.3x multiplier
            # Open -> 1.1x multiplier (Rhythm bonus)
            # Screen Bonus -> Extra 0.1x multiplier if screen is active (Tactical advantage)
            
            tactical_bonus = 0.1 if is_screen_active else 0.0
            impact_multiplier = 1.1 - (final_pressure * 0.8) + tactical_bonus
            
            final_pct = base_pct * impact_multiplier
            current_es = shot_value * final_pct

            # --- E. Monte Carlo Look-ahead ---
            # Prepare MC Players
            mc_players = []
            for _, p in players.iterrows():
                role = 'offense'
                if p['id'] == handler['id']:
                    role = 'handler'
                elif p['team'] != handler_team:
                    role = 'defense'
                
                mc_players.append(MCPlayer(
                    id=p['id'],
                    x=p['x'],
                    y=p['y'],
                    vx=p['vx'],
                    vy=p['vy'],
                    team=p['team'],
                    role=role
                ))
            
            # Run Simulation (Look ahead 15 frames ~ 0.6s)
            future_es = run_monte_carlo_simulation(mc_players, handler['id'], steps=15, simulations=20)
            
            # Blend: 60% Current, 40% Future
            current_es = 0.6 * current_es + 0.4 * future_es
            
        else:
            # Ball in air (Pass or Shot)
            # Maintain last ES (creates "plateaus" in the chart)
            if history_es:
                current_es = history_es[-1]
            else:
                current_es = 0.0

        # Smoothing REMOVED
        # User requested a raw, responsive curve with visible steps
        smoothed_es = current_es
            
        history_es.append(smoothed_es)
        
        epv_curve.append({
            'frame': int(f),
            'timestamp': float(ball['timestamp']),
            'epv': round(smoothed_es, 3)
        })
        
    return epv_curve

