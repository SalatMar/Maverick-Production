// ============================================================
//  Keep the layout in sync with the real header height
//  ------------------------------------------------------------
//  The header is position:fixed, so the rest of the page is
//  offset by --header-height. Measuring the header in JS keeps
//  that offset exact across desktop, mobile, and wrapping — so
//  each section + the header always fills exactly one screen.
// ============================================================

const header = document.querySelector("header");

function headerOffset() {
    return header ? header.offsetHeight : 0;
}

function syncHeaderHeight() {
    if (!header) return;
    document.documentElement.style.setProperty(
        "--header-height",
        header.offsetHeight + "px"
    );
}

syncHeaderHeight();
window.addEventListener("load", syncHeaderHeight);

if (window.ResizeObserver) {
    new ResizeObserver(syncHeaderHeight).observe(header);
} else {
    window.addEventListener("resize", syncHeaderHeight);
}

// ============================================================
//  Always open fresh at the top on (re)load
//  ------------------------------------------------------------
//  Stop the browser restoring the previous scroll position,
//  drop any "#section" hash from the URL, and jump to the top.
// ============================================================

if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
}

window.addEventListener("load", function () {
    if (location.hash) {
        history.replaceState(null, "", location.pathname + location.search);
    }
    // behavior:"instant" overrides the CSS smooth-scroll so the reset
    // is immediate rather than an animated scroll-to-top.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
});

// ============================================================
//  Full-page snap & lock
//  ------------------------------------------------------------
//  One section per gesture. A wheel notch, arrow key, or swipe
//  moves to the next/previous section; input is ignored (locked)
//  until that smooth scroll settles. All targets account for the
//  fixed header so each section lands right beneath it.
// ============================================================

const sections = Array.from(document.querySelectorAll("main > div"));

// Snap targets = every section, plus the footer as one extra stop after the
// last section (Contact). Scrolling down from Contact reveals/locks the
// footer; scrolling up from the footer returns to Contact.
const footer = document.querySelector("footer");
const targets = footer ? sections.concat(footer) : sections.slice();

let currentIndex = 0;

// Time-based lock. Input is ignored until `lockUntil`, then it auto-expires.
// Being purely time-based, the lock can NEVER get stuck (the old frame-polling
// release could fail to fire at the clamped bottom target and freeze the page).
let lockUntil = 0;
function locked() {
    return performance.now() < lockUntil;
}

function clampIndex(i) {
    return Math.max(0, Math.min(targets.length - 1, i));
}

// Largest position the page can actually scroll to.
function maxScroll() {
    return Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
    );
}

// Absolute scroll position that puts section `index` just below the header,
// clamped to what the page can actually reach (so the last section can still
// "arrive" at its target).
function targetScrollFor(index) {
    const top = targets[index].getBoundingClientRect().top + window.pageYOffset;
    return Math.min(Math.max(0, top - headerOffset()), maxScroll());
}

// Timestamp the safety net waits past before second-guessing a snap.
let lastSnapAt = 0;

function goToSection(index) {
    if (!targets.length) return;
    currentIndex = clampIndex(index);

    const startY = window.pageYOffset;
    const target = targetScrollFor(currentIndex);
    const distance = Math.abs(target - startY);

    // Lock for roughly the smooth-scroll duration (scaled by distance) so one
    // gesture = one move, then auto-release. The safety net stays out until the
    // lock ends plus its own cooldown.
    lockUntil = performance.now() + Math.min(1200, 300 + distance * 0.45);
    lastSnapAt = lockUntil;

    window.scrollTo({ top: target, behavior: "smooth" });
}

// --- Mouse wheel ------------------------------------------------------------
window.addEventListener(
    "wheel",
    function (e) {
        if (locked()) {
            e.preventDefault();
            return;
        }
        if (Math.abs(e.deltaY) < 10) return; // ignore trackpad jitter
        e.preventDefault();
        goToSection(currentIndex + (e.deltaY > 0 ? 1 : -1));
    },
    { passive: false }
);

// --- Keyboard ---------------------------------------------------------------
window.addEventListener("keydown", function (e) {
    if (locked()) return;
    switch (e.key) {
        case "ArrowDown":
        case "PageDown":
            e.preventDefault();
            goToSection(currentIndex + 1);
            break;
        case "ArrowUp":
        case "PageUp":
            e.preventDefault();
            goToSection(currentIndex - 1);
            break;
        case "Home":
            e.preventDefault();
            goToSection(0);
            break;
        case "End":
            e.preventDefault();
            goToSection(targets.length - 1);
            break;
    }
});

// --- Touch (mobile swipe) ---------------------------------------------------
let touchStartY = null;
window.addEventListener(
    "touchstart",
    function (e) {
        touchStartY = e.changedTouches[0].clientY;
    },
    { passive: true }
);

window.addEventListener(
    "touchend",
    function (e) {
        if (touchStartY === null || locked()) return;
        const delta = touchStartY - e.changedTouches[0].clientY;
        touchStartY = null;
        if (Math.abs(delta) < 50) return; // ignore taps / tiny drags
        goToSection(currentIndex + (delta > 0 ? 1 : -1));
    },
    { passive: true }
);

// --- Nav links (and the logo "home" link) snap too --------------------------
document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
        const href = this.getAttribute("href");
        // Placeholder links (e.g. the social icons with href="#") have no
        // destination yet: swallow the click so the page doesn't jump to top.
        if (!href || href === "#") {
            e.preventDefault();
            return;
        }
        const target = document.querySelector(href);
        const index = target ? targets.indexOf(target) : -1;
        if (index === -1) return;
        e.preventDefault();
        goToSection(index);
    });
});

// --- Safety net: snap to the nearest section after any OTHER scroll ----------
//  (e.g. dragging the scrollbar or flinging on a touchpad). Debounced so it
//  only fires once scrolling has stopped, never while we're locked, and not
//  right after a snap finishes (the cooldown stops it bouncing back).
let scrollEndTimer;
window.addEventListener("scroll", function () {
    if (locked()) return;
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(function () {
        if (locked() || performance.now() - lastSnapAt < 250) return;

        const y = window.pageYOffset;
        let nearest = 0;
        let best = Infinity;
        targets.forEach(function (_, i) {
            const dist = Math.abs(targetScrollFor(i) - y);
            if (dist < best) {
                best = dist;
                nearest = i;
            }
        });
        // Only re-snap for a clear miss; ignore sub-pixel/rounding residue.
        if (best > 4) {
            goToSection(nearest);
        } else {
            currentIndex = nearest;
        }
    }, 140);
});