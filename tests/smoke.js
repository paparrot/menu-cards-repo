// Дымовой тест в jsdom: node tests/smoke.js [путь к html, по умолчанию index.html]
const { JSDOM, ResourceLoader } = require('jsdom');
const path = require('path');
const assert = require('assert');

const file = path.resolve(process.argv[2] || 'index.html');
// внешние ресурсы (шрифты Google) в тестах не загружаем
class LocalOnly extends ResourceLoader { fetch(url, o) { return /^https?:/.test(url) ? null : super.fetch(url, o); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const errors = [];
  const dom = await JSDOM.fromFile(file, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true,
    beforeParse(w) {
      w.addEventListener('error', e => errors.push(e.message));
      w.confirm = () => true;
      w.matchMedia = q => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} });
      w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { w.__downloaded = this.download; };
    },
  });
  const w = dom.window, d = w.document, $ = id => d.getElementById(id);
  await sleep(700);

  const card = w.eval('DATA[deck[pos]]');
  assert(w.eval('DATA.length') > 100, 'данные загружены');
  assert($('qin') && $('flipbtn'), 'на карточке есть поле ввода и кнопка переворота');
  assert(!$('prev') && !$('next'), 'кнопок «Назад»/«Пропустить» нет');

  // самопроверка: неверный ингредиент не проходит, верный принимается и отмечается на обороте
  $('qin').value = 'абракадабра'; $('qgo').click();
  assert($('qin').classList.contains('bad'), 'неверный ингредиент отклонён');
  $('qin').value = card.i[0].n; $('qgo').click();
  assert(/угадано 1/.test($('fcnt').textContent), 'верный ингредиент засчитан');
  $('flipbtn').click();
  assert(d.querySelectorAll('.back ul.ing input:checked').length === 1, 'на обороте отмечен угаданный ингредиент');
  $('flipbtn').click();
  $('qclr').click();
  assert(d.querySelectorAll('.back ul.ing input:checked').length === 0, '«Начать заново» снимает отметки');

  // свайпы
  const ev = (type, x, y) => Object.assign(new w.Event(type, { bubbles: true }), { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', button: 0 });
  const sc = d.querySelector('.scene'); Object.defineProperty(sc, 'offsetWidth', { value: 400 });
  d.querySelector('.dish').dispatchEvent(ev('pointerdown', 100, 200));
  sc.dispatchEvent(ev('pointermove', 180, 202)); sc.dispatchEvent(ev('pointermove', 280, 203)); sc.dispatchEvent(ev('pointerup', 280, 203));
  await sleep(350);
  assert(w.eval('known.has(' + JSON.stringify(card.d) + ')'), 'свайп вправо = «Знаю»');

  // двойное нажатие переворачивает
  const tap = (el, x, y) => { el.dispatchEvent(ev('pointerdown', x, y)); d.querySelector('.scene').dispatchEvent(ev('pointerup', x, y)); };
  tap(d.querySelector('.dish'), 50, 50); tap(d.querySelector('.dish'), 51, 50);
  assert($('card').classList.contains('flip'), 'двойное нажатие переворачивает карточку');

  // меню-шторка
  $('menuToggle').click(); assert(d.body.classList.contains('menu-open'), 'меню открывается');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert(!d.body.classList.contains('menu-open'), 'Escape закрывает меню');

  // экспорт / импорт
  assert($('drawer').contains($('bk')), 'экспорт/импорт находятся в меню');
  $('bkexp').click(); await sleep(50);
  assert(/^menu-progress-.*\.json$/.test(w.__downloaded || ''), 'экспорт запускает скачивание файла');
  w.eval('known.clear();ings.clear()');
  $('bkmode').value = 'merge';
  $('bkt').value = JSON.stringify({ known: [card.d], ings: [card.d + '||' + card.i[0].n, 'Нет такого||X'] });
  $('bkload').click();
  assert(w.eval('known.size') === 1 && w.eval('ings.size') === 1, 'импорт добавляет известные записи и пропускает лишние');

  assert(errors.length === 0, 'ошибки в консоли: ' + errors.join('; '));
  console.log('OK: все проверки пройдены (' + path.basename(file) + ')');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
