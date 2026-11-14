// Тест интеграции с Telegram: прогресс уходит в CloudStorage и восстанавливается в новой сессии.
// node tests/telegram.js [путь к html, по умолчанию index.html]
const { JSDOM, ResourceLoader } = require('jsdom');
const path = require('path');
const assert = require('assert');

const file = path.resolve(process.argv[2] || 'index.html');
class LocalOnly extends ResourceLoader { fetch(url, o) { return /^https?:/.test(url) ? null : super.fetch(url, o); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const cloud = new Map();                 // имитация CloudStorage одного пользователя
const haptics = [];

async function session() {
  const errors = [];
  const dom = await JSDOM.fromFile(file, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true,
    beforeParse(w) {
      w.addEventListener('error', e => errors.push(e.message));
      w.matchMedia = q => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
      w.Telegram = { WebApp: {
        initData: 'query_id=test', colorScheme: 'dark', version: '8.0', isVersionAtLeast: () => true,
        ready() {}, expand() {}, disableVerticalSwipes() {}, setHeaderColor() {}, setBackgroundColor() {}, onEvent() {},
        showConfirm: (m, cb) => cb(true),
        HapticFeedback: { notificationOccurred: t => haptics.push(t), impactOccurred: t => haptics.push(t) },
        CloudStorage: {
          getKeys: cb => cb(null, [...cloud.keys()]),
          getItems: (keys, cb) => cb(null, Object.fromEntries(keys.map(k => [k, cloud.get(k)]))),
          setItem: (k, v, cb) => { cloud.set(k, v); cb(null, true); },
          removeItem: (k, cb) => { cloud.delete(k); cb(null, true); },
        },
      } };
    },
  });
  await sleep(500);
  return { w: dom.window, d: dom.window.document, errors };
}

(async () => {
  // сессия 1: пустое облако -> ставим «Знаю» и отмечаем ингредиент
  let s = await session(); let { w, d } = s;
  assert(cloud.has('meta'), 'облако инициализировано');
  assert(d.documentElement.dataset.theme === 'dark', 'тема Telegram применена');
  assert(d.getElementById('bkexp').hidden, 'кнопка экспорта в файл скрыта в Telegram');
  const card = w.eval('DATA[deck[pos]]');
  d.getElementById('qin').value = 'абракадабра'; d.getElementById('qgo').click();
  assert(haptics.includes('error'), 'тактильный отклик на ошибку');
  d.getElementById('qin').value = card.i[0].n; d.getElementById('qgo').click();
  d.getElementById('yes').click();
  await sleep(900);
  const keys = [...cloud.keys()].filter(k => k.startsWith('p_'));
  assert(keys.length === 1, 'в облаке одна запись о блюде');
  const rec = JSON.parse(cloud.get(keys[0]));
  assert(rec.n === card.d && rec.k === 1 && rec.g.includes(card.i[0].n), 'запись содержит «Знаю» и ингредиент');
  assert(s.errors.length === 0, 'нет ошибок: ' + s.errors.join('; '));
  w.close();

  // сессия 2: новое «устройство» (пустой localStorage), прогресс приходит из облака
  s = await session(); ({ w, d } = s);
  assert(w.eval('known.has(' + JSON.stringify(card.d) + ')'), '«Знаю» восстановлено из облака');
  assert(w.eval('ings.has(' + JSON.stringify(card.d + '||' + card.i[0].n) + ')'), 'отметка ингредиента восстановлена');

  // сброс прогресса очищает облако
  d.getElementById('reset').click();
  await sleep(1000);
  assert([...cloud.keys()].filter(k => k.startsWith('p_')).length === 0, 'сброс очищает записи в облаке');
  assert(s.errors.length === 0, 'нет ошибок: ' + s.errors.join('; '));
  console.log('OK: Telegram-интеграция работает (' + path.basename(file) + ')');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
