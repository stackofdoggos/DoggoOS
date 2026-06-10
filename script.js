// ---------------------------------------------------------------------------
// WindowManager: turns any element with [data-window] into a macOS-style
// window (draggable by its .window__titlebar, raised on click, with buttons
// that declare their behavior via data-action="close|minimize|maximize").
//
// Multiple windows can coexist; each maintains its own drag/focus state.
// To add a new window, just drop the markup into the page -- no JS needed:
//
//   <div class="window" data-window data-appname="My App" id="my-app">
//     <div class="window__titlebar">
//       <button class="tl tl--close" data-action="close"></button>
//       <button class="tl tl--min"   data-action="minimize"></button>
//       <button class="tl tl--max"   data-action="maximize"></button>
//     </div>
//     <div class="window__body">...</div>
//   </div>
//
// Optionally add a matching `.dock-item[data-app="my-app"]` to the dock so
// minimize has a target to animate into.
//
// And open it programmatically with WindowManager.open("my-app").
// ---------------------------------------------------------------------------
(function () {
  var TOPBAR_HEIGHT = 25; // keep in sync with .topbar height in style.css
  var MIN_VISIBLE = 100; // px of a window that must stay on screen horizontally
  var BOTTOM_GRAB = 40; // px of room left at the bottom so the titlebar stays grabbable
  var Z_BASE = 100;
  var Z_LIMIT = 9000; // stay below the dock/topbar z-indexes
  var DEFAULT_APP_NAME = "Finder";

  var topZ = Z_BASE;
  var registry = Object.create(null);
  var focusedEl = null;

  function resolve(target) {
    if (typeof target === "string") return registry[target] || null;
    return target || null;
  }

  function allWindows() {
    return Object.keys(registry).map(function (k) {
      return registry[k];
    });
  }

  function isVisible(el) {
    return el.style.display !== "none" && el.dataset.wmMinimized !== "1";
  }

  // -- Topbar app name ------------------------------------------------------
  function setTopbarApp(name) {
    var label = document.getElementById("topbar-appname");
    if (label) label.textContent = name || DEFAULT_APP_NAME;
  }

  // -- Focus ----------------------------------------------------------------
  function focus(el) {
    if (!el) return;
    topZ += 1;
    if (topZ > Z_LIMIT) renormalizeZ();
    el.style.zIndex = String(topZ);
    if (focusedEl && focusedEl !== el) {
      focusedEl.classList.remove("window--focused");
    }
    focusedEl = el;
    el.classList.add("window--focused");
    setTopbarApp(el.dataset.appname);
  }

  function blurFocus() {
    if (focusedEl) focusedEl.classList.remove("window--focused");
    focusedEl = null;
    setTopbarApp(DEFAULT_APP_NAME);
  }

  // Focus whichever visible window is on top; fall back to the desktop.
  function focusTopmost() {
    var best = null;
    var bestZ = -1;
    allWindows().forEach(function (el) {
      if (!isVisible(el)) return;
      var z = parseInt(el.style.zIndex, 10) || 0;
      if (z > bestZ) {
        bestZ = z;
        best = el;
      }
    });
    if (best) focus(best);
    else blurFocus();
  }

  // z-index values grow forever as windows are focused; re-pack them before
  // they can climb above the dock/topbar layers.
  function renormalizeZ() {
    var sorted = allWindows().sort(function (a, b) {
      return (
        (parseInt(a.style.zIndex, 10) || 0) -
        (parseInt(b.style.zIndex, 10) || 0)
      );
    });
    topZ = Z_BASE;
    sorted.forEach(function (el) {
      topZ += 1;
      el.style.zIndex = String(topZ);
    });
  }

  // -- Open / close -----------------------------------------------------------
  function open(target) {
    var el = resolve(target);
    if (!el) return;
    if (el.dataset.wmMinimized === "1") {
      unminimize(el);
      return;
    }
    el.style.display = "";
    clampIntoView(el);
    focus(el);
    updateDock();
  }

  function close(target) {
    var el = resolve(target);
    if (!el) return;
    el.style.display = "none";
    el.dataset.wmMinimized = "";
    if (focusedEl === el) focusTopmost();
    updateDock();
  }

  // -- Animation helper -------------------------------------------------------
  // Runs `cb` exactly once when the transition on `prop` finishes, with a
  // timeout fallback in case the transition never fires (e.g. hidden tab).
  function onTransitionEnd(el, prop, cb) {
    var done = false;
    function finish(e) {
      if (done) return;
      if (e && (e.target !== el || (prop && e.propertyName !== prop))) return;
      done = true;
      el.removeEventListener("transitionend", finish);
      cb();
    }
    el.addEventListener("transitionend", finish);
    setTimeout(finish, 500);
  }

  // Center point of the window's dock icon (fallback: bottom-center of screen).
  function dockTargetFor(el) {
    var item = document.querySelector('.dock-item[data-app="' + el.id + '"]');
    if (item) {
      var r = item.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight - 30 };
  }

  // -- Minimize / restore (shrink into the dock, macOS-style) -----------------
  function minimize(target) {
    var el = resolve(target);
    if (!el || el.dataset.wmMinimized === "1" || el.dataset.wmAnimating === "1")
      return;
    pinPosition(el);
    el.dataset.wmAnimating = "1";

    var rect = el.getBoundingClientRect();
    var t = dockTargetFor(el);
    var dx = t.x - (rect.left + rect.width / 2);
    var dy = t.y - (rect.top + rect.height / 2);

    el.style.transition =
      "transform 0.32s cubic-bezier(0.4, 0, 1, 1), opacity 0.32s ease-in";
    el.getBoundingClientRect(); // flush so the transition picks up the change
    el.style.transform =
      "translate(" + dx + "px, " + dy + "px) scale(0.05)";
    el.style.opacity = "0";

    onTransitionEnd(el, "transform", function () {
      el.style.display = "none";
      el.style.transition = "";
      el.style.transform = "none";
      el.style.opacity = "";
      el.dataset.wmMinimized = "1";
      el.dataset.wmAnimating = "";
      if (focusedEl === el) focusTopmost();
      updateDock();
    });
  }

  function unminimize(el) {
    if (!el || el.dataset.wmAnimating === "1") return;
    el.dataset.wmMinimized = "";
    el.dataset.wmAnimating = "1";
    el.style.display = "";
    clampIntoView(el);

    var rect = el.getBoundingClientRect();
    var t = dockTargetFor(el);
    var dx = t.x - (rect.left + rect.width / 2);
    var dy = t.y - (rect.top + rect.height / 2);

    el.style.transition = "none";
    el.style.transform =
      "translate(" + dx + "px, " + dy + "px) scale(0.05)";
    el.style.opacity = "0";
    el.getBoundingClientRect();
    el.style.transition =
      "transform 0.32s cubic-bezier(0, 0, 0.2, 1), opacity 0.32s ease-out";
    el.style.transform = "none";
    el.style.opacity = "1";

    onTransitionEnd(el, "transform", function () {
      el.style.transition = "";
      el.style.opacity = "";
      el.dataset.wmAnimating = "";
    });

    focus(el);
    updateDock();
  }

  // -- Maximize / restore (zoom animation) -------------------------------------
  var GEOM_TRANSITION =
    "top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease, " +
    "border-radius 0.3s ease";

  // Fill the area between the topbar and the dock.
  function maxGeometry() {
    var bottom = window.innerHeight;
    var dock = document.getElementById("dock");
    if (dock) bottom = dock.getBoundingClientRect().top - 10;
    return {
      top: TOPBAR_HEIGHT,
      left: 0,
      width: window.innerWidth,
      height: bottom - TOPBAR_HEIGHT,
    };
  }

  function applyGeometry(el, g) {
    el.style.top = g.top + "px";
    el.style.left = g.left + "px";
    el.style.width = g.width + "px";
    el.style.height = g.height + "px";
  }

  function maximize(target) {
    var el = resolve(target);
    if (!el || el.dataset.wmMinimized === "1" || el.dataset.wmAnimating === "1")
      return;
    pinPosition(el);

    if (el.dataset.wmMaximized === "1") {
      // Restore previous geometry.
      var prev = JSON.parse(el.dataset.wmPrevGeom || "{}");
      el.dataset.wmMaximized = "";
      el.dataset.wmAnimating = "1";
      el.style.transition = GEOM_TRANSITION;
      el.getBoundingClientRect();
      el.classList.remove("window--maximized");
      applyGeometry(el, prev);
      onTransitionEnd(el, "width", function () {
        el.style.transition = "";
        // Windows that originally sized to their content go back to auto.
        if (prev.autoWidth) el.style.width = "";
        if (prev.autoHeight) el.style.height = "";
        el.dataset.wmAnimating = "";
      });
    } else {
      var rect = el.getBoundingClientRect();
      el.dataset.wmPrevGeom = JSON.stringify({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        autoWidth: !el.style.width,
        autoHeight: !el.style.height,
      });
      // Freeze the current geometry in px so the transition has a start value.
      applyGeometry(el, rect);
      el.dataset.wmMaximized = "1";
      el.dataset.wmAnimating = "1";
      el.classList.add("window--maximized");
      el.getBoundingClientRect();
      el.style.transition = GEOM_TRANSITION;
      applyGeometry(el, maxGeometry());
      onTransitionEnd(el, "width", function () {
        el.style.transition = "";
        el.dataset.wmAnimating = "";
      });
      focus(el);
    }
  }

  // -- Positioning -------------------------------------------------------------
  // Replace transform/percentage-based centering with explicit pixel
  // top/left the first time a window is moved, so subsequent moves don't
  // fight the transform offset.
  function pinPosition(el) {
    if (el.dataset.wmPinned === "1") return;
    var rect = el.getBoundingClientRect();
    el.style.top = rect.top + "px";
    el.style.left = rect.left + "px";
    el.style.transform = "none";
    el.dataset.wmPinned = "1";
  }

  function clampTop(top) {
    return Math.max(
      TOPBAR_HEIGHT,
      Math.min(top, window.innerHeight - BOTTOM_GRAB)
    );
  }

  function clampLeft(left, width) {
    return Math.max(
      MIN_VISIBLE - width,
      Math.min(left, window.innerWidth - MIN_VISIBLE)
    );
  }

  // Pull a window back on screen so its titlebar is always reachable.
  function clampIntoView(el) {
    if (el.dataset.wmMaximized === "1") {
      applyGeometry(el, maxGeometry());
      return;
    }
    if (el.dataset.wmPinned !== "1") return; // still transform-centered: fine
    el.style.top = clampTop(el.offsetTop) + "px";
    el.style.left = clampLeft(el.offsetLeft, el.offsetWidth) + "px";
  }

  // -- Dragging ------------------------------------------------------------------
  function makeDraggable(windowEl, handleEl) {
    var grabDX = 0;
    var grabDY = 0;

    handleEl.addEventListener("mousedown", function (e) {
      // Don't initiate a drag if the user clicked on a titlebar button.
      if (e.target.closest("[data-action]")) return;
      if (windowEl.dataset.wmAnimating === "1") return;

      e.preventDefault();
      focus(windowEl);
      pinPosition(windowEl);

      // Dragging a maximized window "tears" it off into its restored size,
      // keeping the cursor over the titlebar (like macOS).
      if (windowEl.dataset.wmMaximized === "1") {
        var prev = JSON.parse(windowEl.dataset.wmPrevGeom || "{}");
        var rect = windowEl.getBoundingClientRect();
        var ratio = (e.clientX - rect.left) / rect.width;
        windowEl.dataset.wmMaximized = "";
        windowEl.classList.remove("window--maximized");
        windowEl.style.width = prev.autoWidth ? "" : prev.width + "px";
        windowEl.style.height = prev.autoHeight ? "" : prev.height + "px";
        var w = windowEl.offsetWidth;
        windowEl.style.left = e.clientX - w * ratio + "px";
        windowEl.style.top = e.clientY - 14 + "px";
      }

      grabDX = e.clientX - windowEl.offsetLeft;
      grabDY = e.clientY - windowEl.offsetTop;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", stopDrag);
      window.addEventListener("blur", stopDrag);
    });

    // Double-click on the titlebar toggles maximize (macOS zoom).
    handleEl.addEventListener("dblclick", function (e) {
      if (e.target.closest("[data-action]")) return;
      maximize(windowEl);
    });

    function onMove(e) {
      e.preventDefault();
      // Absolute positioning from the original grab point, clamped so the
      // titlebar can never leave the screen (above the topbar, below the
      // viewport, or too far off either side).
      windowEl.style.top = clampTop(e.clientY - grabDY) + "px";
      windowEl.style.left =
        clampLeft(e.clientX - grabDX, windowEl.offsetWidth) + "px";
    }

    function stopDrag() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", stopDrag);
      window.removeEventListener("blur", stopDrag);
    }
  }

  // -- Dock -------------------------------------------------------------------
  function updateDock() {
    document.querySelectorAll(".dock-item[data-app]").forEach(function (item) {
      var el = registry[item.getAttribute("data-app")];
      var running =
        el && (el.style.display !== "none" || el.dataset.wmMinimized === "1");
      item.classList.toggle("dock-item--running", !!running);
    });
  }

  function setupDock() {
    document.querySelectorAll(".dock-item[data-app]").forEach(function (item) {
      item.addEventListener("click", function () {
        open(item.getAttribute("data-app"));
      });
    });
    updateDock();
  }

  // -- Registration ------------------------------------------------------------
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

    if (isVisible(el)) focus(el);
  }

  function init() {
    document.querySelectorAll("[data-window]").forEach(register);
    setupDock();
    focusTopmost();

    // Clicking the bare desktop defocuses every window (topbar shows Finder).
    document.addEventListener("mousedown", function (e) {
      if (
        !e.target.closest(".window") &&
        !e.target.closest(".topbar") &&
        !e.target.closest(".dock")
      ) {
        blurFocus();
      }
    });

    // Keep windows reachable when the browser is resized.
    window.addEventListener("resize", function () {
      allWindows().forEach(function (el) {
        if (el.style.display === "none") return;
        clampIntoView(el);
      });
    });
  }

  window.WindowManager = {
    init: init,
    register: register,
    open: open,
    close: close,
    minimize: minimize,
    maximize: maximize,
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

// ---------------------------------------------------------------------------
// Desktop icons: single-click selects (highlight), double-click opens the
// associated window. Any element with `class="app-icon" data-app="<windowId>"`
// becomes a launcher automatically.
// ---------------------------------------------------------------------------
(function () {
  var selectedIcon = null;

  function selectIcon(el) {
    if (selectedIcon && selectedIcon !== el) deselectIcon(selectedIcon);
    el.classList.add("selected");
    selectedIcon = el;
  }

  function deselectIcon(el) {
    if (!el) return;
    el.classList.remove("selected");
    if (selectedIcon === el) selectedIcon = null;
  }

  function init() {
    document.querySelectorAll(".app-icon").forEach(function (icon) {
      icon.addEventListener("click", function (e) {
        e.stopPropagation();
        selectIcon(icon);
      });
      icon.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        var appId = icon.getAttribute("data-app");
        if (appId && window.WindowManager) {
          window.WindowManager.open(appId);
          deselectIcon(icon);
        }
      });
    });

    // Click anywhere else on the page deselects the current icon.
    document.addEventListener("click", function () {
      if (selectedIcon) deselectIcon(selectedIcon);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
