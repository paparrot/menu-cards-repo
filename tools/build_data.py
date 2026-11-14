#!/usr/bin/env python3
"""Собирает data/cards.js и images/ из меню (Markdown) и таблицы с рецептами (xlsx).

  python3 tools/build_data.py
  python3 tools/build_data.py --menu source/menu.md --xlsx source/menu-autumn-winter-2026-2027.xlsx

Карточки берутся только из Markdown-меню. Из таблицы к ним подтягиваются
фото, рецепт и выход блюда; если в таблице чего-то нет, поле просто не заполняется.
Блюда из таблицы, которых нет в меню, игнорируются.
"""
import argparse, difflib, io, json, re, sys
from pathlib import Path

import openpyxl
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# раздел меню -> лист таблицы, на котором искать блюдо в первую очередь
SECTION_SHEET = {
    'Закуски': 'Холодные закуски', 'Салаты': 'Салаты', 'Горячие закуски': 'Горячие закуски',
    'Брускетты': 'Брускетты', 'Супы': 'Супы', 'Josper': 'Josper', 'Горячее': 'Горячее ',
    'Паста': 'Паста', 'Гарниры': 'Гарниры', 'Десерты': 'Десерты',
}
NO_RECIPE_SHEETS = {'Десерты'}   # у десертов в таблице описание, а не рецепт
MATCH_THRESHOLD = 0.85
IMG_MAX_SIDE, IMG_QUALITY = 560, 70
YIELD_RE = re.compile(r'^\s*Выход\s+блюда\s*[=:]?\s*(.*)$', re.I)


# ---------- меню (Markdown) ----------
def split_top(s):
    """Делит строку по запятым верхнего уровня (вне скобок)."""
    out, depth, cur = [], 0, ''
    for ch in s:
        depth += (ch == '(') - (ch == ')')
        if ch == ',' and depth == 0:
            out.append(cur.strip()); cur = ''
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


def parse_item(text):
    """'Соус (a, b)' -> {'n': 'Соус', 'p': ['a', 'b']}"""
    text = text.strip().rstrip(':')
    m = re.match(r'^(.*?)\s*\((.*)$', text)
    if m and m.group(1):
        inner = m.group(2).rstrip()
        if inner.endswith(')'):
            inner = inner[:-1]
        return {'n': m.group(1).strip(), 'p': split_top(inner)}
    return {'n': text, 'p': []}


def parse_menu(path):
    sections, sec, dish, last, prev_blank = [], None, None, None, True
    for raw in Path(path).read_text(encoding='utf-8').split('\n'):
        line = raw.rstrip()
        if not line.strip():
            prev_blank = True
            continue
        if line.startswith('## '):
            sec = {'name': line[3:].strip(), 'dishes': []}
            sections.append(sec); dish = None; prev_blank = True
            continue
        s = line.lstrip()
        if line.startswith('\t') and s.startswith('- '):          # вложенный пункт = состав заготовки
            if last is not None:
                last['p'].append(s[2:].strip())
        elif s.startswith('- '):                                    # ингредиент
            last = parse_item(s[2:]); dish['items'].append(last)
        elif prev_blank or dish is None:                            # название блюда
            dish = {'name': s.strip(), 'items': []}; sec['dishes'].append(dish); last = None
        elif last is not None:                                      # продолжение строки ингредиента
            last['n'] += ' ' + s
        prev_blank = False
    cards = []
    for sc in sections:
        for d in sc['dishes']:
            if not d['items']:
                continue
            name = re.sub(r'\s*-\s*\d+\s*мин$', '', d['name']).strip()
            cards.append({'s': sc['name'], 'd': name, 'i': d['items']})
    return cards


# ---------- таблица (xlsx) ----------
def cell(ws, r, c):
    v = ws.cell(r, c).value
    return '' if v is None else str(v).strip()


def parse_workbook(path):
    """Блоки блюд: каждый блок заканчивается строкой «Выход блюда»."""
    wb = openpyxl.load_workbook(path)
    blocks = []
    for ws in wb:
        images = []
        for im in ws._images:
            try:
                images.append((im.anchor._from.row + 1, im))
            except Exception:
                pass
        prev = 0
        for r in range(1, ws.max_row + 1):
            for col in (1, 2):
                m = YIELD_RE.match(cell(ws, r, col))
                if m:
                    yld = m.group(1).strip() or (cell(ws, r, 2) if col == 1 else '')
                    break
            else:
                continue
            r0, r1, prev = prev + 1, r, r
            title = trow = tcol = None
            for rr in range(r0, r1):
                a, b = cell(ws, rr, 1), cell(ws, rr, 2)
                if a:
                    title, trow, tcol = a, rr, 1; break
                if b:
                    title, trow, tcol = b, rr, 2; break
            if not title:
                continue
            recipe = [cell(ws, rr, 2) for rr in range(r0, r1)
                      if cell(ws, rr, 2) and not (rr == trow and tcol == 2)]
            blocks.append({'sheet': ws.title, 'title': title, 'yield': yld, 'recipe': recipe,
                           'images': [im for (row, im) in images if r0 <= row <= r1]})
    return blocks


def norm(t):
    t = t.lower().replace('ё', 'е')
    t = re.sub(r'\(предлагаем.*?\)|\(18\+\)', '', t)
    t = re.sub(r'[-–]\s*\d+\s*мин\.?', '', t)
    t = re.sub(r'[^\w\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def best_block(card, blocks):
    n, own = norm(card['d']), SECTION_SHEET.get(card['s'])
    scored = [(difflib.SequenceMatcher(None, n, norm(b['title'])).ratio() + (0.05 if b['sheet'] == own else 0), b)
              for b in blocks]
    return max(scored, key=lambda x: x[0])


# ---------- сборка ----------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--menu', default=ROOT / 'source' / 'menu.md')
    ap.add_argument('--xlsx', default=ROOT / 'source' / 'menu-autumn-winter-2026-2027.xlsx')
    ap.add_argument('--out', default=ROOT / 'data' / 'cards.js')
    ap.add_argument('--images', default=ROOT / 'images')
    a = ap.parse_args()

    cards, blocks = parse_menu(a.menu), parse_workbook(a.xlsx)
    img_dir = Path(a.images); img_dir.mkdir(parents=True, exist_ok=True)
    for old in img_dir.glob('*.jpg'):
        old.unlink()

    paths, missing = [], []
    for c in cards:
        score, b = best_block(c, blocks)
        if score < MATCH_THRESHOLD:
            missing.append(c['d']); continue
        if b['yield']:
            c['y'] = b['yield']
        if b['sheet'] not in NO_RECIPE_SHEETS:
            rec = '\n\n'.join(x for x in b['recipe'] if x)
            if rec:
                c['r'] = rec
        if b['images']:
            try:
                im = Image.open(io.BytesIO(b['images'][0]._data())).convert('RGB')
                im.thumbnail((IMG_MAX_SIDE, IMG_MAX_SIDE))
                name = f'{len(paths) + 1:03d}.jpg'
                im.save(img_dir / name, 'JPEG', quality=IMG_QUALITY, optimize=True)
                paths.append(f'images/{name}'); c['im'] = len(paths) - 1
            except Exception as e:
                print('! картинка не обработана:', c['d'], e, file=sys.stderr)

    lines = ['// Файл создаётся скриптом tools/build_data.py. Вручную не редактировать.',
             'const DATA=[']
    lines.append(',\n'.join(json.dumps(c, ensure_ascii=False, separators=(',', ':')) for c in cards))
    lines.append('];')
    lines.append('const IMGS=' + json.dumps(paths, ensure_ascii=False) + ';')
    Path(a.out).write_text('\n'.join(lines) + '\n', encoding='utf-8')

    print(f'карточек: {len(cards)}, картинок: {len(paths)}, '
          f'с рецептом: {sum("r" in c for c in cards)}, с выходом: {sum("y" in c for c in cards)}')
    if missing:
        print('не найдены в таблице:', *missing, sep='\n  ')


if __name__ == '__main__':
    main()
