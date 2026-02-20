#!/usr/bin/env python3

import json
import urllib.request

RS_DUMP_URL = "https://chisel.weirdgloop.org/gazproj/gazbot/rs_dump.json"
IMAGE_MAP_FILE = "item_images.json"
USER_AGENT = "grand-money-exchange-image-checker/1.1"

def fetch_dump_items():
    print("Fetching latest item list from rs_dump.json...")
    req = urllib.request.Request(RS_DUMP_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    items = [v["name"] for k, v in data.items() if not k.startswith("%")]
    print(f"Total items in dump: {len(items)}")
    return set(items)

def load_existing_images():
    print("Loading existing item_images.json...")
    try:
        with open(IMAGE_MAP_FILE, "r") as f:
            data = json.load(f)
        print(f"Items with images: {len(data)}")
        return set(data.keys())
    except FileNotFoundError:
        print("item_images.json not found — assuming empty.")
        return set()

def main():
    dump_items = fetch_dump_items()
    existing_items = load_existing_images()

    missing_items = sorted(dump_items - existing_items)

    print("\n=== Missing Items ===")

    if not missing_items:
        print("None — your dataset is up to date ✅")
        return

    for item in missing_items:
        print(item)

    print(f"\nTotal missing items: {len(missing_items)}")
    print("You should rerun the image crawler.")

if __name__ == "__main__":
    main()
