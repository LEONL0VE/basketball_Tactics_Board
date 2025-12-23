import numpy as np
import pandas as pd
from monte_carlo import MCPlayer, run_monte_carlo_simulation

# Court Constants
SCALE = 45.0
HOOP_X = 1.575 
HOOP_Y = 7.62 
METER_TO_FEET = 3.28084

def get_nba_zone(x_m, y_m):
    """
    Map court coordinates (meters) to NBA Shot Zone Basic and Area.
    Returns a key matching the shot chart JSON format, e.g., "Mid-Range (Center(C))"
    """
    # Convert to feet relative to hoop
    dx_ft = (x_m - HOOP_X) * METER_TO_FEET
    dy_ft = (y_m - HOOP_Y) * METER_TO_FEET
    dist_ft = np.sqrt(dx_ft**2 + dy_ft**2)
    
    # Determine Angle (degrees)
    # angle 0 is straight out from hoop (towards center court)
    # dy > 0 is Left (if Y increases "down" and we look from center to hoop? 
    # Let's assume standard: Y increases down. Hoop is Left.
    # Looking from X=14 to X=1.5. Y=0 is Right. Y=15 is Left.
    # So dy < 0 is Right, dy > 0 is Left.
    angle = np.degrees(np.arctan2(dy_ft, dx_ft))
    
    # Determine Area
    area = ""
    area_code = ""
    
    if abs(angle) < 22.5:
        area = "Center"
        area_code = "C"
    elif 22.5 <= angle < 67.5:
        area = "Left Side Center"
        area_code = "LC"
    elif angle >= 67.5:
        area = "Left Side"
        area_code = "L"
    elif -67.5 < angle <= -22.5:
        area = "Right Side Center"
        area_code = "RC"
    elif angle <= -67.5:
        area = "Right Side"
        area_code = "R"
        
    # Determine Basic Zone
    basic = ""
    
    # Corner 3 logic: Y distance > 22ft (sideline is 25ft from center) and X < 14ft (approx)
    # Actually Corner 3 is defined by the line.
    # 3PT Line: 23.75ft arc, but 22ft at corners.
    # Simple logic:
    is_corner = (dx_ft < 14.0) and (abs(dy_ft) > 21.0) # Approx corner box
    
    if dist_ft < 4.0:
        basic = "Restricted Area"
        area = "Center" # RA is always Center in stats usually
        area_code = "C"
    elif dist_ft < 16.0:
        if abs(dy_ft) < 6.0: # Inside Key width (approx 12ft)
            basic = "In The Paint (Non-RA)"
        else:
            basic = "Mid-Range"
    elif dist_ft < 23.75 and not is_corner:
        basic = "Mid-Range"
    else:
        # 3 Point
        if is_corner:
            if dy_ft > 0:
                basic = "Left Corner 3"
                area = "Left Side"
                area_code = "L"
            else:
                basic = "Right Corner 3"
                area = "Right Side"
                area_code = "R"
        else:
            basic = "Above the Break 3"
            
    return f"{basic} ({area}({area_code}))"

def calculate_epv_series(kinematics_df, shot_charts_map=None, shot_chart_data=None, sliders=None):
    """
    Calculate ESV (Expected Shot Value) based on User's Formula.
    
    Formula:
    ESV = P(Make) * Points
    P(Make) = Sigmoid(LogOdds)
    LogOdds = Beta_Base + Beta_Dribble * D + Beta_Def * Ndef + f_Identity(x, y)
    
    Ndef = ln(1 + d_min_ft)
    f_Identity = Real Shooting % (Logit transformed? Or just added?)
    
    D (Dribble) is inferred from possession duration.
    If possession > 1.0s, D = 1 (Pull-up). Else D = 0 (Catch & Shoot).
    """
    
    if sliders is None:
        sliders = {
            'base': 0.0,      # Intercept
            'dribble': -0.5,  # Penalty for dribbling
            'defense': 0.5    # Benefit of openness (Positive because Ndef increases with openness)
        }
        
    epv_curve = []
    
    if kinematics_df.empty:
        return []

    # --- 1. Coordinate Conversion (Pixels -> Meters) ---
    kinematics_df = kinematics_df.copy()
    kinematics_df['x'] = kinematics_df['x'] / SCALE
    kinematics_df['y'] = kinematics_df['y'] / SCALE

    frame_indices = sorted(kinematics_df['frame'].unique())
    
    # History for smoothing (if needed, but user wanted raw)
    history_es = []
    
    # Possession Tracking
    current_handler_id = None
    possession_start_time = 0.0
    
    for f in frame_indices:
        frame_data = kinematics_df[kinematics_df['frame'] == f]
        
        # Identify Ball
        ball = frame_data[frame_data['type'] == 'ball']
        if ball.empty:
            epv_curve.append({'frame': int(f), 'timestamp': 0.0, 'epv': 0.0})
            continue
        ball = ball.iloc[0]
        
        players = frame_data[frame_data['type'] == 'player']
        if players.empty:
            epv_curve.append({'frame': int(f), 'timestamp': float(ball['timestamp']), 'epv': 0.0})
            continue

        # Find Handler
        # Priority 1: Explicit ownerId from frontend
        handler = None
        
        if 'ownerId' in ball and pd.notna(ball['ownerId']):
             handler_candidates = players[players['id'] == ball['ownerId']]
             if not handler_candidates.empty:
                 handler = handler_candidates.iloc[0]
        
        # Priority 2: Distance based (Fallback)
        if handler is None:
            players = players.copy()
            players['dist_to_ball'] = np.sqrt((players['x'] - ball['x'])**2 + (players['y'] - ball['y'])**2)
            ball_handler = players[players['dist_to_ball'] < 2.0].sort_values('dist_to_ball')
            if not ball_handler.empty:
                handler = ball_handler.iloc[0]
        
        current_esv = 0.0
        
        if handler is not None:
            handler_team = handler['team']
            
            # --- Possession Logic ---
            if current_handler_id != handler['id']:
                current_handler_id = handler['id']
                possession_start_time = float(ball['timestamp'])
            
            possession_duration = float(ball['timestamp']) - possession_start_time
            
            # Infer Dribble vs Catch & Shoot
            # Threshold: 1.0 second
            is_dribbling = possession_duration > 1.0
            
            # --- Step 1: Defense Pressure (Ndef) ---
            defenders = players[players['team'] != handler_team]
            d_min_ft = 100.0 # Default if open
            
            if not defenders.empty:
                # Calculate distances in FEET
                dists_m = np.sqrt((defenders['x'] - handler['x'])**2 + (defenders['y'] - handler['y'])**2)
                dists_ft = dists_m * METER_TO_FEET
                d_min_ft = dists_ft.min()
            
            # Ndef = ln(1 + d_min)
            ndef = np.log(1 + d_min_ft)
            
            # --- Step 2: Spatial Effect f(x, y) ---
            # Get Zone Pct
            zone_key = get_nba_zone(handler['x'], handler['y'])
            
            raw_pct = 0.35 # Default league average
            
            # Determine which shot chart to use
            current_shot_chart = None
            if shot_charts_map:
                h_id = str(handler['id'])
                if h_id in shot_charts_map:
                    current_shot_chart = shot_charts_map[h_id]
                elif 'default' in shot_charts_map:
                    current_shot_chart = shot_charts_map['default']
            elif shot_chart_data:
                current_shot_chart = shot_chart_data
            
            if current_shot_chart:
                if zone_key in current_shot_chart:
                    zone_info = current_shot_chart[zone_key]
                    # Smoothing: (FGM + 1) / (FGA + 2) or similar?
                    # Or just use raw pct if FGA > 5
                    if zone_info['fga'] > 0:
                        raw_pct = zone_info['pct']
                        # Handle 0% with small sample
                        if zone_info['fga'] < 5:
                            # Blend with 0.35
                            raw_pct = (zone_info['fgm'] + 0.35 * 5) / (zone_info['fga'] + 5)
                    # print(f"Zone: {zone_key} | Found | Pct: {raw_pct}")
                else:
                    # print(f"Zone: {zone_key} | Not Found in Chart")
                    pass
            
            # Convert Pct to LogOdds (f_Identity)
            # Clamp pct to [0.01, 0.99] to avoid inf
            raw_pct = max(0.01, min(0.99, raw_pct))
            f_identity = np.log(raw_pct / (1 - raw_pct))
            
            # --- Step 3: Synthesize LogOdds ---
            # L = Beta_Base + (Beta_Dribble * Is_Dribbling) + (Beta_Def * Ndef) + f_Identity
            
            # Default Sliders if not provided or partial
            b_base = float(sliders.get('base', 0.0))
            b_dribble = float(sliders.get('dribble', -0.2)) # Penalty
            b_def = float(sliders.get('defense', 0.5))      # Benefit of openness
            
            dribble_val = 1.0 if is_dribbling else 0.0
            
            log_odds = b_base + (b_dribble * dribble_val) + (b_def * ndef) + f_identity
            
            # --- Step 4: Final ESV ---
            p_make = 1 / (1 + np.exp(-log_odds))
            
            # Points: Distance to Hoop Center (5.25, 25) in FEET
            # User said: "Ball_Pos to hoop center (5.25, 25) distance. If > 23.75 ft then 3 points"
            # My HOOP_X=1.575m -> 5.16ft. HOOP_Y=7.62m -> 25.0ft.
            # So (handler['x'], handler['y']) in meters needs to be converted to feet.
            
            h_x_ft = handler['x'] * METER_TO_FEET
            h_y_ft = handler['y'] * METER_TO_FEET
            
            # Distance to (5.25, 25)
            # Note: User's 5.25 is likely the hoop center X.
            dist_to_hoop_center_ft = np.sqrt((h_x_ft - 5.25)**2 + (h_y_ft - 25.0)**2)
            
            points = 3 if dist_to_hoop_center_ft > 23.75 else 2
            
            current_esv = p_make * points
            
        else:
            # Ball in air
            # Reset possession
            current_handler_id = None
            
            if history_es:
                current_esv = history_es[-1]
            else:
                current_esv = 0.0
                
        history_es.append(current_esv)
        
        epv_curve.append({
            'frame': int(f),
            'timestamp': float(ball['timestamp']),
            'epv': round(current_esv, 3)
        })
        
    return epv_curve
