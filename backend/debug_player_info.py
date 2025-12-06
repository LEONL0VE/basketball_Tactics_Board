from nba_api.stats.endpoints import commonplayerinfo
import json

# LeBron James ID: 2544
player_id = 2544
info = commonplayerinfo.CommonPlayerInfo(player_id=player_id)
data = info.get_dict()['resultSets'][0]['rowSet'][0]
headers = info.get_dict()['resultSets'][0]['headers']
player_info = dict(zip(headers, data))

print(json.dumps(player_info, indent=2))
