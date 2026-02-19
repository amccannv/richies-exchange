# Richie's Exchange

Converts RuneScape Grand Exchange item prices from GP to real-world currencies using Bond pricing.

## Features

- Real-time Grand Exchange price conversion
- Multi-currency support (USD, CAD, GBP, EUR, AUD, BRL, DKK, SEK)
- Price history charts
- Item search and filtering
- Mobile responsive design

## Usage

Open `index.html` in a browser or serve it locally:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000

## Data Sources

- Prices: [Weird Gloop RS Dump](https://chisel.weirdgloop.org/gazproj/gazbot/rs_dump.json)
- Price History: [Weird Gloop Exchange API](https://api.weirdgloop.org/exchange/history/rs/all)
- Item Images: [RuneScape Wiki](https://runescape.wiki)
