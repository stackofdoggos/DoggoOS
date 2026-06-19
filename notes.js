// ---------------------------------------------------------------------------
// Notes app:
//   - Sidebar list of notes
//   - Editable title and contenteditable rich-text body
//   - Visual toolbar (bold, italic, underline, strike, H2, quote, code, lists,
//     link, clear formatting)
//   - "+ New Note" and per-note delete
//   - Autosaves to localStorage on every keystroke / formatting action, so
//     edits survive reloads and future deploys.
// ---------------------------------------------------------------------------
(function () {
  var STORAGE_KEY = "milesos:notes:v1";

  // Default notes, used only the very first time the app is opened (or after
  // the user clears their browser storage).
  var DEFAULT_NOTES = [
    {
      title: "Welcome",
      date: "06/09/2026",
      content:
        "<h2>Welcome to Notes</h2>" +
        "<p>A little about the app.</p>" +
        "<p>This notes app lives on your milesOS desktop. Click <strong>+ New Note</strong> in the sidebar to start writing. Use the toolbar above to format text however you'd like.</p>" +
        "<blockquote>The pen is mightier than the sword, but a folded-paper sword is mightier than both :D</blockquote>" +
        "<p>Everything you type is saved automatically to your browser.</p>",
    },
    {
      title: "About Kartana",
      date: "06/09/2026",
      content:
        "<h2>About Kartana</h2>" +
        "<p>Kartana is an Ultra Beast Pok&eacute;mon, Steel/Grass type, that resembles a sheet of folded paper sharpened into a blade.</p>" +
        "<p>Its body is so sharp that, like a finely-honed katana, it can slice through the thickest steel as if it were paper. A fitting mascot for cutting through clutter in your thinking.</p>" +
        "<ul><li>Type: Grass / Steel</li><li>Category: Drawn Sword Pok&eacute;mon</li><li>Inspired by: origami &amp; the Japanese katana</li></ul>",
    },
    {
      title: "Sharp Notes",
      date: "06/09/2026",
      content:
        "<h2>More About Me</h2>" +
        "<p>A few more things about me:</p>" +
        "<ul><li>I work in a lab</li><li>I'm a huge huge sports fan, so much so that I coach my own basketball team</li><li>In my free time, I'm usually reading textbooks or coding or playing basketball</li></ul>",
    },
  ];

  // -- State --------------------------------------------------------------
  var notes = loadNotes();
  var activeIndex = 0;
  var saveTimer = null;

  // -- Storage ------------------------------------------------------------
  function loadNotes() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed.notes) && parsed.notes.length > 0) {
          return parsed.notes;
        }
      }
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_NOTES));
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ notes: notes, version: 1 }),
      );
    } catch (e) {}
  }

  // Debounced persist so we don't hammer storage on every keystroke.
  function persistSoon() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 150);
  }

  // -- Helpers ------------------------------------------------------------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function today() {
    var d = new Date();
    return (
      String(d.getMonth() + 1).padStart(2, "0") +
      "/" +
      String(d.getDate()).padStart(2, "0") +
      "/" +
      d.getFullYear()
    );
  }

  // -- Rendering ----------------------------------------------------------
  function renderSidebar() {
    var list = document.getElementById("notes-list");
    if (!list) return;
    list.innerHTML = "";
    notes.forEach(function (n, i) {
      var item = document.createElement("div");
      item.className = "notes-sidebar__item";
      if (i === activeIndex) item.classList.add("notes-sidebar__item--active");
      item.innerHTML =
        '<div class="notes-sidebar__meta">' +
        '<p class="notes-sidebar__title">' +
        escapeHtml(n.title || "Untitled") +
        "</p>" +
        '<p class="notes-sidebar__date">' +
        escapeHtml(n.date || "") +
        "</p>" +
        "</div>" +
        '<button class="notes-sidebar__delete" data-delete="' +
        i +
        '" title="Delete note">&times;</button>';
      item.addEventListener("click", function (e) {
        if (e.target.closest("[data-delete]")) return;
        setActive(i);
      });
      list.appendChild(item);
    });
    list.querySelectorAll("[data-delete]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute("data-delete"), 10);
        deleteNote(idx);
      });
    });
  }

  function loadActiveIntoEditor() {
    var n = notes[activeIndex];
    document.getElementById("notes-title").value = n.title || "";
    document.getElementById("notes-date").textContent = n.date || "";
    document.getElementById("notes-content").innerHTML = n.content || "";
  }

  function setActive(i) {
    if (i < 0 || i >= notes.length) return;
    activeIndex = i;
    loadActiveIntoEditor();
    renderSidebar();
    updateToolbarState();
  }

  // -- Mutations ----------------------------------------------------------
  function captureFromEditor() {
    if (!notes[activeIndex]) return;
    notes[activeIndex].title = document.getElementById("notes-title").value;
    notes[activeIndex].content =
      document.getElementById("notes-content").innerHTML;
  }

  function autosave() {
    captureFromEditor();
    persistSoon();
    // Live-update sidebar title preview without re-rendering everything.
    var items = document.querySelectorAll(".notes-sidebar__item");
    if (items[activeIndex]) {
      var titleEl = items[activeIndex].querySelector(".notes-sidebar__title");
      if (titleEl) {
        titleEl.textContent = notes[activeIndex].title || "Untitled";
      }
    }
  }

  function newNote() {
    notes.unshift({
      title: "Untitled note",
      date: today(),
      content: "<p></p>",
    });
    activeIndex = 0;
    persist();
    setActive(0);
    var titleInput = document.getElementById("notes-title");
    titleInput.focus();
    titleInput.select();
  }

  function deleteNote(i) {
    if (notes.length <= 1) {
      notes[0] = { title: "Untitled note", date: today(), content: "<p></p>" };
      activeIndex = 0;
    } else {
      notes.splice(i, 1);
      if (activeIndex > i) {
        activeIndex--;
      } else if (activeIndex === i) {
        activeIndex = Math.min(activeIndex, notes.length - 1);
      }
    }
    persist();
    setActive(activeIndex);
  }

  // -- Formatting toolbar -------------------------------------------------
  function runCommand(cmd) {
    var content = document.getElementById("notes-content");
    if (!content) return;
    content.focus();

    if (cmd.indexOf("formatBlock:") === 0) {
      var tag = cmd.split(":")[1];
      // Toggle: if the current block is already this tag, revert to P.
      var current = "";
      try {
        current = (document.queryCommandValue("formatBlock") || "")
          .toLowerCase()
          .replace(/[<>]/g, "");
      } catch (e) {}
      var target = current === tag.toLowerCase() ? "P" : tag;
      document.execCommand("formatBlock", false, target);
    } else if (cmd === "createLink") {
      var url = prompt("Link URL");
      if (url) document.execCommand("createLink", false, url);
    } else if (cmd === "unlink") {
      document.execCommand("unlink", false, null);
    } else if (cmd === "insertImage") {
      var src = prompt("Image URL");
      if (src) document.execCommand("insertImage", false, src);
    } else {
      document.execCommand(cmd, false, null);
    }

    autosave();
    updateToolbarState();
  }

  function updateToolbarState() {
    var toolbar = document.getElementById("notes-toolbar");
    if (!toolbar) return;
    toolbar.querySelectorAll("[data-cmd]").forEach(function (btn) {
      var cmd = btn.getAttribute("data-cmd");
      var active = false;
      try {
        if (
          cmd === "bold" ||
          cmd === "italic" ||
          cmd === "underline" ||
          cmd === "strikeThrough"
        ) {
          active = document.queryCommandState(cmd);
        } else if (
          cmd === "insertUnorderedList" ||
          cmd === "insertOrderedList"
        ) {
          active = document.queryCommandState(cmd);
        } else if (cmd.indexOf("formatBlock:") === 0) {
          var want = cmd.split(":")[1].toLowerCase();
          var current = (document.queryCommandValue("formatBlock") || "")
            .toLowerCase()
            .replace(/[<>]/g, "");
          active = current === want;
        }
      } catch (e) {}
      btn.classList.toggle("active", active);
    });
  }

  function setupToolbar() {
    var toolbar = document.getElementById("notes-toolbar");
    if (!toolbar) return;
    toolbar.querySelectorAll("[data-cmd]").forEach(function (btn) {
      // mousedown preventDefault keeps focus on the contenteditable so the
      // execCommand applies to the current selection.
      btn.addEventListener("mousedown", function (e) {
        e.preventDefault();
      });
      btn.addEventListener("click", function () {
        runCommand(btn.getAttribute("data-cmd"));
      });
    });
  }

  function init() {
    if (!document.getElementById("notes")) return;

    setupToolbar();

    document.getElementById("notes-title").addEventListener("input", autosave);

    var content = document.getElementById("notes-content");
    content.addEventListener("input", autosave);
    content.addEventListener("keyup", updateToolbarState);
    content.addEventListener("mouseup", updateToolbarState);
    content.addEventListener("focus", updateToolbarState);

    document.getElementById("notes-new").addEventListener("click", newNote);

    renderSidebar();
    loadActiveIntoEditor();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
