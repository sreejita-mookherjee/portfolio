/* GA4 events, shared by the home page and the case-study pages (work/*.html).
   Page views (including which project page was opened, and from where) come
   from gtag itself; this adds:

   Home
     section_view   {section_name, landed}      a section became the one showing;
                                                 landed "yes" = the section this visit started on
     project_click  {project_name, click_source} a project card was opened (home_carousel)
     contact_click  {contact_method}            email / linkedin / behance link in Contact
     email_copy                                 the copy-email button
   Case studies
     case_study_scroll {project_name, percent_scrolled}  25 / 50 / 75 / 100, once each per visit
     project_click  {project_name, click_source} a card in "Keep exploring" (keep_exploring)
     back_to_work   {project_name}              the "Go back" link

   Plain script (not a module) so flip.js can call __trackSectionView. Does
   nothing if gtag is missing (blocked by an ad blocker etc.). */
(function () {
  "use strict";
  if (typeof gtag !== "function") return;
  var send = function (name, params) { gtag("event", name, params || {}); };
  var slug = function (href) { return (href || "").split("/").pop().split("#")[0].replace(/\.html$/, ""); };

  /* ---------- home page ---------- */
  var SECTION_NAMES = { "panel-1": "Home", "panel-2": "Selected Work", "panel-3": "About", "panel-4": "Journey", "panel-5": "Contact" };
  if (document.getElementById("panel-1")) {
    // flip.js reports sections as they change. Until the page has loaded it may
    // still be jumping to a shared link's section (…/#contact), so nothing is
    // sent before then; the landing section is the one in the URL by then.
    var SLUG_IDS = { "#home": "panel-1", "#work": "panel-2", "#about": "panel-3", "#journey": "panel-4", "#contact": "panel-5" };
    var loaded = false, pending = null, last = null;
    var report = function (id, landed) {
      if (id === last) return;
      last = id;
      send("section_view", { section_name: SECTION_NAMES[id] || id, landed: landed ? "yes" : "no" });
    };
    window.__trackSectionView = function (id) { if (loaded) report(id, false); else pending = id; };
    window.addEventListener("load", function () {
      setTimeout(function () {                            // after flip.js's own load jump
        loaded = true;
        report(SLUG_IDS[location.hash.toLowerCase()] || pending || "panel-1", true);
      }, 0);
    });

    document.querySelectorAll(".pcard[data-href]").forEach(function (card) {
      card.addEventListener("click", function () {
        send("project_click", { project_name: slug(card.dataset.href), click_source: "home_carousel" });
      });
    });

    document.querySelectorAll(".p5-link").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var method = /^mailto:/.test(href) ? "email" : /linkedin\./.test(href) ? "linkedin" : /behance\./.test(href) ? "behance" : null;
      if (!method) return;
      a.addEventListener("click", function (e) {
        if (e.target.closest(".p5-copy-btn")) return;     // that's a copy, not a click on the link
        send("contact_click", { contact_method: method });
      });
    });
    var copy = document.querySelector(".p5-copy-btn");
    if (copy) copy.addEventListener("click", function () { send("email_copy"); });
    return;
  }

  /* ---------- case-study pages ---------- */
  if (!document.querySelector(".cs-top")) return;
  var project = slug(location.pathname);

  var THRESHOLDS = [25, 50, 75, 100], seen = {};
  function checkScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    var pct = Math.round(window.scrollY / max * 100);
    THRESHOLDS.forEach(function (t) {
      if (!seen[t] && pct >= (t === 100 ? 98 : t)) {        // 98: the last pixel or two is easy to miss
        seen[t] = true;
        send("case_study_scroll", { project_name: project, percent_scrolled: t });
      }
    });
  }
  window.addEventListener("scroll", checkScroll, { passive: true });

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    if (a.classList.contains("cs-back")) send("back_to_work", { project_name: project });
    else if (a.classList.contains("cs-film__item") && !a.classList.contains("is-current") && !e.defaultPrevented)   // not the end of a drag
      send("project_click", { project_name: slug(a.getAttribute("href")), click_source: "keep_exploring" });
  });
})();
