#!/usr/bin/env python3

import asyncio
import json
import time
import urllib.parse
import urllib.request
import re

RS_DUMP_URL = "https://chisel.weirdgloop.org/gazproj/gazbot/rs_dump.json"
OUTPUT_FILE = "item_images.json"
MISSING_FILE = "missing_images.json"
USER_AGENT = "grand-money-exchange-inventory-crawler/3.0"

BATCH_SIZE = 20          # items per queue
CONCURRENT_BATCHES = 5   # number of async workers
REQUEST_DELAY = 0.2      # seconds between requests per worker

BASE_FILE_PAGE_URL = "https://runescape.wiki/w/File:"
BASE_IMAGE_URL = "https://runescape.wiki"

# ---------- Async HTTP using thread pool ----------
async def http_get(url):
    loop = asyncio.get_running_loop()

    def fetch():
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read().decode(errors="ignore")

    return await loop.run_in_executor(None, fetch)

# ---------- Rate limiter ----------
class RateLimiter:
    def __init__(self, delay):
        self.delay = delay
        self.lock = asyncio.Lock()
        self.last = 0

    async def wait(self):
        async with self.lock:
            now = time.time()
            wait = self.delay - (now - self.last)
            if wait > 0:
                await asyncio.sleep(wait)
            self.last = time.time()

rate_limiter = RateLimiter(REQUEST_DELAY)

# ---------- Fetch items from rs_dump.json ----------
async def fetch_items():
    print("Fetching items from rs_dump.json...")
    text = await http_get(RS_DUMP_URL)
    data = json.loads(text)
    items = [v["name"] for k, v in data.items() if not k.startswith("%")]
    print(f"Found {len(items)} items\n")
    return items

# ---------- Build File page URL ----------
def file_page_url(item_name):
    # Escape spaces, parentheses, apostrophes, etc.
    escaped = urllib.parse.quote(f"{item_name}.png")
    return BASE_FILE_PAGE_URL + escaped

# ---------- Parse direct image URL from File page ----------
async def fetch_image_url(item_name):
    await rate_limiter.wait()
    url = file_page_url(item_name)
    html = await http_get(url)
    # Look for <div class="fullImageLink" id="file"><a href="...">
    match = re.search(r'<div class="fullImageLink" id="file">.*?<a href="([^"]+)"', html, re.DOTALL)
    if match:
        href = match.group(1)
        if href.startswith("/images/"):
            return BASE_IMAGE_URL + href
        return href
    return None

# ---------- Worker ----------
async def worker(name, queue, image_map, stats):
    while True:
        item_name = await queue.get()
        if item_name is None:
            break
        try:
            url = await fetch_image_url(item_name)
            stats["processed"] += 1
            if url:
                image_map[item_name] = url
                stats["found"] += 1
            else:
                stats["missing"] += 1
                stats["missing_records"].append({"item": item_name, "result": "no_url_found"})
            if stats["processed"] % 50 == 0:
                print(f"[{stats['processed']}/{stats['total_items']}] found={stats['found']} missing={stats['missing']}")
        except Exception as e:
            print(f"Error fetching {item_name}: {e}")
            stats["processed"] += 1
            stats["missing"] += 1
            stats["missing_records"].append({"item": item_name, "result": "error"})
        queue.task_done()

# ---------- Main ----------
async def main():
    dump_items = await fetch_items()
    queue = asyncio.Queue()
    for item in dump_items:
        queue.put_nowait(item)

    stats = {"processed": 0, "found": 0, "missing": 0, "missing_records": [], "total_items": len(dump_items)}
    image_map = {}

    workers = [asyncio.create_task(worker(i, queue, image_map, stats)) for i in range(CONCURRENT_BATCHES)]
    await queue.join()
    for _ in workers:
        queue.put_nowait(None)
    await asyncio.gather(*workers)

    # Save results
    with open(OUTPUT_FILE, "w") as f:
        json.dump(image_map, f, indent=2)

    with open(MISSING_FILE, "w") as f:
        json.dump(stats["missing_records"], f, indent=2)

    print(f"\nSaved item images: {OUTPUT_FILE}")
    print(f"Saved missing items: {MISSING_FILE}")
    print(f"Found: {stats['found']} Missing: {stats['missing']}")

if __name__ == "__main__":
    asyncio.run(main())
