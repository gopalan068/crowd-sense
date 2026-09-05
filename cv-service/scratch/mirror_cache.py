import json
import os

cache_file = "zone_density_cache.json"
if os.path.exists(cache_file):
    with open(cache_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    frames = data.get("frames", {})
    if "zone_1" in frames and "zone_2" not in frames:
        frames["zone_2"] = dict(frames["zone_1"])
        print("Mirrored zone_1 cache to zone_2")
    elif "zone_2" in frames and "zone_1" not in frames:
        frames["zone_1"] = dict(frames["zone_2"])
        print("Mirrored zone_2 cache to zone_1")
    
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Updated {cache_file} with keys: {list(frames.keys())}")
