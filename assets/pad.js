// Draw or type a signature; export a transparent PNG. Works with mouse, pen and finger.
function SignaturePad(canvas) {
  var ctx = canvas.getContext('2d');
  var drawing = false;
  var empty = true;
  var last = null;
  var listeners = [];
  function changed() { listeners.forEach(function (f) { f(); }); }
  function setup() {
    var r = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#17233C';
    ctx.fillStyle = '#17233C';
  }
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', function (e) {
    drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drawing) return;
    var p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
    if (empty) { empty = false; changed(); }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
    canvas.addEventListener(ev, function () { drawing = false; });
  });
  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; changed(); }
  async function typed(name) {
    clear();
    if (!name) return;
    try { await document.fonts.load('600 44px "Dancing Script"'); } catch (e) { /* the fallback font still draws */ }
    var r = canvas.getBoundingClientRect();
    ctx.font = '600 44px "Dancing Script", "Brush Script MT", cursive';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 18, r.height / 2);
    empty = false;
    changed();
  }
  // The PNG of the ink only, with a small margin: a signature placed in a document is then the size of the
  // writing, not of the whole drawing box (a short typed name would otherwise shrink to a speck).
  function trimmed() {
    var w = canvas.width;
    var h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return canvas.toDataURL('image/png');
    var m = Math.round(8 * (window.devicePixelRatio || 1));
    minX = Math.max(0, minX - m); minY = Math.max(0, minY - m);
    maxX = Math.min(w - 1, maxX + m); maxY = Math.min(h - 1, maxY + m);
    var out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }
  setup();
  window.addEventListener('resize', function () { if (empty) setup(); });
  return {
    clear: clear, typed: typed,
    png: trimmed,
    isEmpty: function () { return empty; },
    onChange: function (f) { listeners.push(f); }
  };
}
