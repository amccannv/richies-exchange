#!/usr/bin/env python3

import asyncio
import json
import time
import urllib.parse
import urllib.request
import re

MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping"
OUTPUT_FILE = "osrs_item_images.json"
MISSING_FILE = "osrs_missing_images.json"
USER_AGENT = "grand-money-exchange-osrs-crawler/1.0"

BATCH_SIZE = 20
CONCURRENT_BATCHES = 5
REQUEST_DELAY = 0.2

BASE_FILE_PAGE_URL = "https://oldschool.runescape.wiki/w/File:"
BASE_IMAGE_URL = "https://oldschool.runescape.wiki"


async def http_get(url):
    loop = asyncio.get_running_loop()

    def fetch():
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.read().decode(errors="ignore")

    return await loop.run_in_executor(None, fetch)


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


async def fetch_items():
    print("Fetching items from mapping API...")
    text = await http_get(MAPPING_URL)
    data = json.loads(text)
    items = [item["name"] for item in data]
    print(f"Found {len(items)} items\n")
    return items


def file_page_url(item_name):
    escaped = urllib.parse.quote(f"{item_name}.png")
    return BASE_FILE_PAGE_URL + escaped


async def fetch_image_url(item_name):
    await rate_limiter.wait()

    url = file_page_url(item_name)
    html = await http_get(url)

    # Primary: fullImageLink block (most reliable)
    match = re.search(
        r'<div[^>]+class="fullImageLink"[^>]*>.*?<a[^>]+href="([^"]+)"',
        html,
        re.DOTALL
    )

    # Fallback: download button
    if not match:
        match = re.search(r'class="fileDownload"[^>]*href="([^"]+)"', html)

    if match:
        href = match.group(1)
        if href.startswith("/"):
            return BASE_IMAGE_URL + href
        return href

    print(f"MISSING: '{item_name}' - URL tried: {url}")
    return None


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
                stats["missing_records"].append({
                    "item": item_name,
                    "url_tried": file_page_url(item_name),
                    "result": "no_url_found"
                })

            if stats["processed"] % 50 == 0:
                print(
                    f"[{stats['processed']}/{stats['total_items']}] "
                    f"found={stats['found']} missing={stats['missing']}"
                )

        except Exception as e:
            print(f"Error fetching {item_name}: {e}")
            stats["processed"] += 1
            stats["missing"] += 1
            stats["missing_records"].append({
                "item": item_name,
                "url_tried": file_page_url(item_name),
                "result": "error",
                "error": str(e)
            })

        queue.task_done()


async def main():
    items = await fetch_items()

    queue = asyncio.Queue()
    for item in items:
        queue.put_nowait(item)

    stats = {
        "processed": 0,
        "found": 0,
        "missing": 0,
        "missing_records": [],
        "total_items": len(items)
    }

    image_map = {}

    workers = [
        asyncio.create_task(worker(i, queue, image_map, stats))
        for i in range(CONCURRENT_BATCHES)
    ]

    await queue.join()

    for _ in workers:
        queue.put_nowait(None)

    await asyncio.gather(*workers)

    with open(OUTPUT_FILE, "w") as f:
        json.dump(image_map, f, indent=2)

    with open(MISSING_FILE, "w") as f:
        json.dump(stats["missing_records"], f, indent=2)

    print(f"\nSaved OSRS item images: {OUTPUT_FILE}")
    print(f"Saved missing items: {MISSING_FILE}")
    print(f"Found: {stats['found']} Missing: {stats['missing']}")


if __name__ == "__main__":
    asyncio.run(main())