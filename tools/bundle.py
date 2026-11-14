#!/usr/bin/env python3
"""Собирает один самодостаточный файл dist/menu-cards.html (CSS, JS, данные и фото внутри).

  python3 tools/bundle.py
"""
import base64, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'css' / 'style.css').read_text(encoding='utf-8')
    cards = (ROOT / 'data' / 'cards.js').read_text(encoding='utf-8')
    app = (ROOT / 'js' / 'app.js').read_text(encoding='utf-8')

    def inline_images(m):
        paths = json.loads(m.group(1))
        uris = ['data:image/jpeg;base64,' + base64.b64encode((ROOT / p).read_bytes()).decode() for p in paths]
        return 'const IMGS=' + json.dumps(uris, separators=(',', ':')) + ';'
    cards = re.sub(r'const IMGS=(\[.*?\]);', inline_images, cards, flags=re.S)

    html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '</style>')
    html = html.replace('<script src="data/cards.js"></script>', '<script>\n' + cards + '</script>', 1)
    html = html.replace('<script src="js/app.js"></script>', '<script>\n' + app + '</script>', 1)
    out = ROOT / 'dist' / 'menu-cards.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(f'{out.relative_to(ROOT)}: {out.stat().st_size / 1e6:.1f} МБ')


if __name__ == '__main__':
    main()
