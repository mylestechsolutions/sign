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
  setup();
  window.addEventListener('resize', function () { if (empty) setup(); });
  return {
    clear: clear, typed: typed,
    png: function () { return canvas.toDataURL('image/png'); },
    isEmpty: function () { return empty; },
    onChange: function (f) { listeners.push(f); }
  };
}
