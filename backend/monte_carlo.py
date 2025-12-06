import numpy as np
import random
import math

# Constants (Must match epv_analytics.py)
HOOP_X = 1.575
HOOP_Y = 7.62
COURT_WIDTH = 28.65
COURT_HEIGHT = 15.24

class MCPlayer:
    def __init__(self, id, x, y, vx, vy, team, role):
        self.id = id
        self.x = x
        self.y = y
        self.vx = vx
        self.vy = vy
        self.team = team
        self.role = role  # 'handler', 'offense', 'defense'

    def clone(self):
        return MCPlayer(self.id, self.x, self.y, self.vx, self.vy, self.team, self.role)

def get_distance(p1, p2):
    return math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2)

def get_distance_sq(p1, p2):
    return (p1.x - p2.x)**2 + (p1.y - p2.y)**2

def evaluate_state(players, handler_id):
    """
    Simplified EPV evaluation for a simulation state.
    Focuses on: Distance to Hoop, Openness (Distance to nearest defender).
    """
    handler = next((p for p in players if p.id == handler_id), None)
    if not handler:
        return 0.0

    # 1. Base Value based on Distance to Hoop
    dist_to_hoop = math.sqrt((handler.x - HOOP_X)**2 + (handler.y - HOOP_Y)**2)
    
    is_3pt = dist_to_hoop > 6.75
    shot_value = 3 if is_3pt else 2
    
    if dist_to_hoop < 1.5:
        base_pct = 0.70
    elif is_3pt:
        base_pct = 0.38
    else:
        base_pct = 0.45 - (dist_to_hoop - 1.5) * 0.01
    base_pct = max(0.0, base_pct)

    # 2. Defense Pressure
    min_def_dist = 999.0
    for p in players:
        if p.team != handler.team:
            d = math.sqrt((p.x - handler.x)**2 + (p.y - handler.y)**2)
            if d < min_def_dist:
                min_def_dist = d
    
    pressure_factor = 0.0
    if min_def_dist < 0.5:
        pressure_factor = 1.0
    elif min_def_dist > 3.0:
        pressure_factor = 0.0
    else:
        pressure_factor = 1.0 - (min_def_dist - 0.5) / 2.5

    # Impact
    impact_multiplier = 1.1 - (pressure_factor * 0.8)
    final_pct = base_pct * impact_multiplier
    
    return shot_value * final_pct

def run_monte_carlo_simulation(current_players, handler_id, steps=10, simulations=20, dt=0.04):
    """
    Runs Monte Carlo simulations to predict future EPV.
    
    Args:
        current_players: List of MCPlayer objects
        handler_id: ID of the ball handler
        steps: How many frames to look ahead (e.g., 10 frames = 0.4s)
        simulations: Number of simulation runs (e.g., 20)
        dt: Time step in seconds
    """
    total_score = 0.0
    
    # Physics Parameters
    MAX_SPEED = 8.0 # m/s
    ACCEL = 4.0 # m/s^2
    FRICTION = 0.95
    
    for _ in range(simulations):
        # Clone state
        sim_players = [p.clone() for p in current_players]
        handler = next((p for p in sim_players if p.id == handler_id), None)
        
        if not handler:
            continue

        for _ in range(steps):
            # Update each player
            for p in sim_players:
                # --- 1. Determine Intention Force ---
                fx, fy = 0.0, 0.0
                
                if p.role == 'handler':
                    # Attacker: Drive to hoop + Random Noise
                    # Vector to hoop
                    dx = HOOP_X - p.x
                    dy = HOOP_Y - p.y
                    dist = math.sqrt(dx*dx + dy*dy)
                    
                    if dist > 0:
                        # Normalized direction
                        dir_x, dir_y = dx/dist, dy/dist
                        
                        # Add randomness (Intent uncertainty)
                        # Attackers might zig-zag
                        noise_angle = random.uniform(-0.5, 0.5) # +/- ~30 degrees
                        cos_a = math.cos(noise_angle)
                        sin_a = math.sin(noise_angle)
                        
                        # Rotate direction
                        ndx = dir_x * cos_a - dir_y * sin_a
                        ndy = dir_x * sin_a + dir_y * cos_a
                        
                        fx = ndx * ACCEL
                        fy = ndy * ACCEL
                        
                elif p.role == 'defense':
                    # Defender: Stay between handler and hoop + Reaction Lag + Error
                    # Target: Midpoint between handler and hoop (Sagging) or Tight (Handler pos)
                    # Simple logic: Move towards handler
                    
                    # Find handler in current sim state
                    curr_handler = next((h for h in sim_players if h.id == handler_id), None)
                    if curr_handler:
                        target_x = curr_handler.x
                        target_y = curr_handler.y
                        
                        # Vector to target
                        dx = target_x - p.x
                        dy = target_y - p.y
                        dist = math.sqrt(dx*dx + dy*dy)
                        
                        if dist > 0:
                            dir_x, dir_y = dx/dist, dy/dist
                            
                            # Defense Error (Bite on fake) - 10% chance to move wrong way
                            if random.random() < 0.1:
                                dir_x = -dir_x
                                dir_y = -dir_y
                            
                            fx = dir_x * ACCEL
                            fy = dir_y * ACCEL
                
                # --- 2. Update Physics ---
                p.vx += fx * dt
                p.vy += fy * dt
                
                # Friction
                p.vx *= FRICTION
                p.vy *= FRICTION
                
                # Cap Speed
                speed = math.sqrt(p.vx**2 + p.vy**2)
                if speed > MAX_SPEED:
                    scale = MAX_SPEED / speed
                    p.vx *= scale
                    p.vy *= scale
                
                # Move
                p.x += p.vx * dt
                p.y += p.vy * dt
                
                # Boundary Check
                p.x = max(0, min(COURT_WIDTH, p.x))
                p.y = max(0, min(COURT_HEIGHT, p.y))

        # End of simulation run: Evaluate final state
        score = evaluate_state(sim_players, handler_id)
        total_score += score

    return total_score / simulations
