(function () {
  var whale = document.getElementById('whale');
  var bubble = document.getElementById('bubble');
  var panel = document.getElementById('panel');
  var balEl = document.getElementById('bal');
  var usedEl = document.getElementById('used');
  var peakEl = document.getElementById('peak');
  var range = document.getElementById('sizeRange');
  var sizeVal = document.getElementById('sizeVal');
  var rua = document.getElementById('rua');
  var ruaImg = document.getElementById('ruaImg');
  var ruaText = document.getElementById('ruaText');

  var dragging = false, moved = false, pressStart = null, hideTimer = null;

  function play(src, vol) {
    try { var a = new Audio(src); a.volume = vol; a.play().catch(function () {}); } catch (e) {}
  }
  function money(n, cur) { return (cur === 'USD' ? '$' : '¥') + Number(n || 0).toFixed(2); }

  function render(d) {
    if (!d) return;
    if (!d.ok) {
      balEl.textContent = '读取失败'; balEl.classList.add('bad');
      usedEl.textContent = '--'; peakEl.textContent = '--';
      bubble.title = d.error || '';
      return;
    }
    balEl.classList.remove('bad');
    balEl.textContent = money(d.total, d.currency);
    balEl.classList.toggle('bad', Number(d.total) < 2);
    usedEl.textContent = '-' + money(d.used, d.currency);
    peakEl.textContent = d.isPeak ? '峰价' : '谷价';
    peakEl.classList.toggle('bad', !!d.isPeak);
  }

  function sendHit() {
    var r = whale.getBoundingClientRect();
    var box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    [bubble, panel, rua].forEach(function (el) {
      if (el.classList.contains('hide')) return;
      var q = el.getBoundingClientRect();
      box.l = Math.min(box.l, q.left);
      box.t = Math.min(box.t, q.top);
      box.r = Math.max(box.r, q.right);
      box.b = Math.max(box.b, q.bottom);
    });
    box.wl = r.left; box.wt = r.top; box.wr = r.right; box.wb = r.bottom;
    window.pet.hit(box);
  }
  function sendHitSoon() { setTimeout(sendHit, 260); }

  // ===== 抚摸音效：原版 Ya1(按下) / Ya2(松开) =====
  var pressAudio = new Audio('assets/press.mp3');
  var relAudio = new Audio('assets/release.mp3');
  pressAudio.preload = 'auto';
  relAudio.preload = 'auto';
  function playPress() {
    try { pressAudio.currentTime = 0; pressAudio.volume = 0.55; pressAudio.play().catch(function () {}); } catch (e) {}
  }
  function playRelease() {
    try { relAudio.currentTime = 0; relAudio.volume = 0.55; relAudio.play().catch(function () {}); } catch (e) {}
  }

  // ===== 抚摸（rua）：气泡里放原版动图 + 一句随机台词 =====
  var RUA_LINES = ['rua~', '摸摸头', '好舒服…', '再摸一下', '咕噜咕噜', '别停呀', '嘿嘿'];
  var ruaTimer = null;
  function showRua() {
    ruaText.textContent = RUA_LINES[Math.floor(Math.random() * RUA_LINES.length)];
    try { ruaImg.src = 'assets/rua.gif?' + Date.now(); } catch (e) {}  // 重播动图
    rua.classList.remove('hide');
    hideBubble();
    if (ruaTimer) clearTimeout(ruaTimer);
    ruaTimer = setTimeout(hideRua, 2200);
    sendHitSoon();
  }
  function hideRua() {
    rua.classList.add('hide');
    if (ruaTimer) { clearTimeout(ruaTimer); ruaTimer = null; }
    sendHitSoon();
  }
  function onTap() {
    if (!rua.classList.contains('hide')) { hideRua(); showBubble(true); }
    else { showRua(); }
    window.pet.refresh().then(render);
  }

  function showBubble(auto) {
    bubble.classList.remove('hide');
    if (hideTimer) clearTimeout(hideTimer);
    if (auto) hideTimer = setTimeout(function () { bubble.classList.add('hide'); sendHitSoon(); }, 9000);
    sendHitSoon();
  }
  function hideBubble() {
    bubble.classList.add('hide');
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    sendHitSoon();
  }
  function toggleBubble() {
    if (bubble.classList.contains('hide')) showBubble(true);
    else hideBubble();
  }
  function togglePanel() {
    panel.classList.toggle('hide');
    var open = !panel.classList.contains('hide');
    document.getElementById('stage').classList.toggle('panel-open', open);
    if (open) bubble.classList.add('hide');
    sendHitSoon();
  }

  whale.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    dragging = true; moved = false;
    pressStart = { sx: e.screenX, sy: e.screenY };
    whale.classList.add('press');
    try { whale.setPointerCapture(e.pointerId); } catch (err) {}
    playPress();
  });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    whale.classList.remove('press');
    whale.classList.remove('grab');
    if (moved) window.pet.dragEnd();
    moved = false;
  }

  whale.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.screenX - pressStart.sx, dy = e.screenY - pressStart.sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) > 5) {
      moved = true;
      whale.classList.add('grab');
      window.pet.dragStart();
    }
    if (moved) window.pet.dragMove();
  });

  whale.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    whale.classList.remove('press');
    whale.classList.remove('grab');
    var wait = 0;
    try {
      var d = pressAudio.duration, t = pressAudio.currentTime;
      if (isFinite(d) && d > 0) wait = Math.max(0, (d - t) * 1000);
    } catch (err) {}
    setTimeout(playRelease, wait);
    try { whale.releasePointerCapture(e.pointerId); } catch (err) {}
    if (moved) {
      window.pet.dragEnd();
    } else {
      onTap();
    }
    moved = false;
  });

  whale.addEventListener('pointercancel', endDrag);
  whale.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('blur', endDrag);

  whale.addEventListener('contextmenu', function (e) { e.preventDefault(); window.pet.menu(); });

  range.addEventListener('input', function () {
    sizeVal.textContent = range.value;
    window.pet.resize(Number(range.value));
  });

  document.getElementById('btnRefresh').addEventListener('click', function () {
    window.pet.refresh().then(render);
    showBubble(true);
  });
  document.getElementById('btnQuit').addEventListener('click', function () { window.pet.quit(); });



  window.pet.onData(render);
  window.pet.onCfg(function (c) {
    if (c && c.whale) { range.value = c.whale; sizeVal.textContent = c.whale; }
    sendHitSoon();
  });
  window.pet.onOpenSettings(togglePanel);
  window.pet.onPing(function () { showBubble(true); window.pet.refresh().then(render); });

  window.pet.refresh().then(function (d) { render(d); showBubble(false); sendHit(); });
  setTimeout(sendHit, 400);
  window.addEventListener('resize', sendHitSoon);
})();
