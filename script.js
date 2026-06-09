// ---------------------------------------------------------------------------
// WindowManager: turns any element with [data-window] into a macOS-style
// window (draggable by its .window__titlebar, raised on click, with buttons
// that declare their behavior via data-action="close|minimize|maximize").
//
// Multiple windows can coexist; each maintains its own drag/focus state.
// To add a new window, just drop the markup into the page -- no JS needed:
//
//   <div class="window" data-window id="my-app">
//     <div class="window__titlebar">
//       <button class="tl tl--close" data-action="close"></button>
//       <button class="tl tl--min"   data-action="minimize"></button>
//       <button class="tl tl--max"   data-action="maximize"></button>
//     </div>
//     <div class="window__body">...</div>
//   </div>
//
// And open it programmatically with WindowManager.open("my-app").
// ---------------------------------------------------------------------------
(function () {
  var topZ = 100;
  var registry = Object.create(null);

  function resolve(target) {
    if (typeof target === "string") return registry[target] || null;
    return target || null;
  }

  function focus(el) {
    if (!el) return;
    topZ += 1;
    el.style.zIndex = String(topZ);
  }

  function open(target) {
    var el = resolve(target);
    if (!el) return;
    el.style.display = "";
    focus(el);
  }

  function close(target) {
    var el = resolve(target);
    if (!el) return;
    el.style.display = "none";
  }

  function minimize(_el) {
    // Stub: placeholder for future dock-style minimize behavior.
  }

  function maximize(_el) {
    // Stub: placeholder for future fullscreen toggle.
  }

  // Replace transform/percentage-based centering with explicit pixel
  // top/left the first time a window is dragged, so subsequent drags don't
  // fight the transform offset.
  function pinPosition(el) {
    if (el.dataset.wmPinned === "1") return;
    var rect = el.getBoundingClientRect();
    el.style.top = rect.top + "px";
    el.style.left = rect.left + "px";
    el.style.transform = "none";
    el.dataset.wmPinned = "1";
  }

  function makeDraggable(windowEl, handleEl) {
    var initialX = 0;
    var initialY = 0;

    handleEl.addEventListener("mousedown", function (e) {
      // Don't initiate a drag if the user clicked on a titlebar button.
      if (e.target.closest("[data-action]")) return;

      e.preventDefault();
      focus(windowEl);
      pinPosition(windowEl);
      initialX = e.clientX;
      initialY = e.clientY;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", stopDrag);
    });

    function onMove(e) {
      e.preventDefault();
      var dx = initialX - e.clientX;
      var dy = initialY - e.clientY;
      initialX = e.clientX;
      initialY = e.clientY;
      windowEl.style.top = windowEl.offsetTop - dy + "px";
      windowEl.style.left = windowEl.offsetLeft - dx + "px";
    }

    function stopDrag() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", stopDrag);
    }
  }

  function register(el) {
    if (!el || el.dataset.wmRegistered === "1") return;
    if (!el.id) el.id = "win-" + Math.random().toString(36).slice(2, 8);
    registry[el.id] = el;
    el.dataset.wmRegistered = "1";

    var titlebar = el.querySelector(".window__titlebar");
    if (titlebar) makeDraggable(el, titlebar);

    // Wire titlebar buttons to their declared actions.
    el.querySelectorAll("[data-action]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var action = btn.getAttribute("data-action");
        if (action === "close") close(el);
        else if (action === "minimize") minimize(el);
        else if (action === "maximize") maximize(el);
      });
    });

    // Clicking anywhere on a window brings it to the front.
    el.addEventListener("mousedown", function () {
      focus(el);
    });

    focus(el);
  }

  function init() {
    document.querySelectorAll("[data-window]").forEach(register);
  }

  window.WindowManager = {
    init: init,
    register: register,
    open: open,
    close: close,
    focus: function (target) {
      focus(resolve(target));
    },
    get: function (id) {
      return registry[id] || null;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
