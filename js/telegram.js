/* Интеграция с Telegram Mini Apps (Web Apps).
 * Вне Telegram (обычный браузер) файл ничего не делает.
 * Прогресс хранится в Telegram CloudStorage (синхронизация между устройствами пользователя)
 * и по-прежнему дублируется в localStorage/IndexedDB из app.js.
 * Формат: ключ "p_<хэш названия блюда>" -> {"n": блюдо, "k": 1 если «Знаю», "g": [отмеченные ингредиенты]}
 * плюс служебный ключ "meta". Лимиты CloudStorage: 1024 ключа, значение до 4096 символов. */
(function () {
  const tg = window.Telegram && Telegram.WebApp;
  if (!tg || !tg.initData) return;

  const $ = id => document.getElementById(id);
  const has = v => tg.isVersionAtLeast && tg.isVersionAtLeast(v);
  document.documentElement.classList.add('in-telegram');
  try { tg.ready(); tg.expand(); } catch (e) {}
  try { if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) {}  // вертикальный жест не закрывает приложение

  // тема Telegram -> тема приложения
  const applyTheme = () => {
    document.documentElement.dataset.theme = tg.colorScheme === 'dark' ? 'dark' : 'light';
    try {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      if (bg) { if (tg.setHeaderColor) tg.setHeaderColor(bg); if (tg.setBackgroundColor) tg.setBackgroundColor(bg); }
    } catch (e) {}
  };
  applyTheme();
  if (tg.onEvent) tg.onEvent('themeChanged', applyTheme);

  // тактильный отклик
  window.onTick = t => {
    const h = tg.HapticFeedback; if (!h) return;
    if (t === 'ok') h.notificationOccurred('success');
    else if (t === 'bad') h.notificationOccurred('error');
    else h.impactOccurred('light');
  };

  // подтверждения через нативный диалог Telegram
  if (has('6.2') && tg.showConfirm) window.askConfirm = m => new Promise(r => tg.showConfirm(m, r));

  // в WebView Telegram скачивание файлов по ссылке ненадёжно: прогресс и так в облаке, запасной вариант — текст
  if ($('bkexp')) $('bkexp').hidden = true;
  const status = m => { if ($('bkmsg')) $('bkmsg').textContent = m; };

  // ---- облачное хранилище ----
  const CS = tg.CloudStorage;
  if (!CS || !has('6.9')) { status('Облако Telegram недоступно в этой версии: прогресс хранится на устройстве.'); return; }
  const call = (m, ...a) => new Promise((res, rej) => CS[m](...a, (err, v) => err ? rej(err) : res(v)));
  const PFX = 'p_', META = 'meta';
  const h32 = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  const keyOf = n => PFX + h32(n);

  const pack = v => {
    let s = JSON.stringify(v);
    while (s.length > 4000 && v.g.length) { v.g.pop(); s = JSON.stringify(v); }
    return s;
  };
  const snapshot = () => {                      // текущее состояние -> Map(ключ -> строка)
    const m = new Map();
    known.forEach(n => m.set(n, { n, k: 1, g: [] }));
    ings.forEach(s => {
      const i = s.indexOf('||'), n = s.slice(0, i);
      if (!m.has(n)) m.set(n, { n, k: 0, g: [] });
      m.get(n).g.push(s.slice(i + 2));
    });
    const out = new Map();
    m.forEach((v, n) => out.set(keyOf(n), pack(v)));
    return out;
  };

  const synced = new Map();                     // что уже лежит в облаке
  let ready = false, timer = null, pushing = Promise.resolve();
  const push = () => {
    if (!ready) return pushing;
    pushing = pushing.then(async () => {
      const cur = snapshot(), ops = [];
      cur.forEach((val, k) => { if (synced.get(k) !== val) ops.push(call('setItem', k, val).then(() => synced.set(k, val))); });
      [...synced.keys()].forEach(k => { if (!cur.has(k)) ops.push(call('removeItem', k).then(() => synced.delete(k))); });
      await Promise.all(ops);
      if (ops.length) status('Прогресс синхронизирован с облаком Telegram.');
    }).catch(() => status('Не удалось синхронизировать с облаком Telegram. Прогресс сохранён на устройстве.'));
    return pushing;
  };
  document.addEventListener('progress:save', () => { clearTimeout(timer); timer = setTimeout(push, 600); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); push(); } });

  (async () => {
    try {
      const keys = (await call('getKeys')).filter(k => k === META || k.startsWith(PFX));
      if (keys.includes(META)) {
        // облако — источник правды: подменяем локальный прогресс
        const pk = keys.filter(k => k !== META);
        const vals = pk.length ? await call('getItems', pk) : {};
        const names = new Set(DATA.map(c => c.d)), nk = new Set(), ng = new Set();
        pk.forEach(k => {
          try {
            const o = JSON.parse(vals[k]);
            if (!o || !names.has(o.n)) return;   // записи про блюда, которых нет в меню, не трогаем
            synced.set(k, vals[k]);
            if (o.k) nk.add(o.n);
            (o.g || []).forEach(g => ng.add(o.n + '||' + g));
          } catch (e) {}
        });
        known = nk; ings = ng;
        save(); saveIng(); build(false);
        ready = true;
      } else {
        // первый запуск с этим ботом: загружаем в облако то, что накопилось локально
        await call('setItem', META, '1');
        ready = true;
        await push();
      }
      status('Прогресс хранится в облаке Telegram и синхронизируется между вашими устройствами.');
    } catch (e) {
      status('Облако Telegram недоступно: прогресс хранится на устройстве.');
    }
  })();
})();
