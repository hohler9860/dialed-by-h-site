(function () {
    'use strict';

    // ── Grain Overlay ──
    function initGrainOverlay() {
        var grain = document.createElement('div');
        grain.id = 'grain-overlay';
        grain.setAttribute('aria-hidden', 'true');
        document.body.prepend(grain);
    }

    // ── Page Transitions (overlay approach) ──
    function initPageTransitions() {
        // Entrance: fade-in overlay
        var overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:#0a0a0a;z-index:9999;pointer-events:none;transition:opacity 0.5s cubic-bezier(0.23,1,0.32,1);';
        document.body.prepend(overlay);

        requestAnimationFrame(function () {
            overlay.style.opacity = '0';
            setTimeout(function () {
                overlay.remove();
            }, 600);
        });

        // Exit: intercept internal navigation
        document.addEventListener('click', function (e) {
            var link = e.target.closest('a[href]');
            if (!link) return;

            var href = link.getAttribute('href');
            if (!href) return;
            // Skip external links
            if (link.target === '_blank') return;
            if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;
            if (href.startsWith('https://') || href.startsWith('http://')) return;

            e.preventDefault();
            var exitOverlay = document.createElement('div');
            exitOverlay.style.cssText =
                'position:fixed;inset:0;background:#0a0a0a;z-index:9999;pointer-events:none;opacity:0;transition:opacity 0.3s ease-in;';
            document.body.appendChild(exitOverlay);
            requestAnimationFrame(function () {
                exitOverlay.style.opacity = '1';
            });
            setTimeout(function () {
                window.location.href = href;
            }, 300);
        });
    }

    // ── Lenis Smooth Scroll ──
    function initLenis() {
        if (typeof Lenis === 'undefined') return;

        var lenis = new Lenis({
            duration: 1.2,
            easing: function (t) {
                return Math.min(1, 1.001 - Math.pow(2, -10 * t));
            },
            orientation: 'vertical',
            smoothWheel: true,
            touchMultiplier: 2,
        });

        // Connect to GSAP ticker for perfect ScrollTrigger sync
        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
            lenis.on('scroll', ScrollTrigger.update);
            gsap.ticker.add(function (time) {
                lenis.raf(time * 1000);
            });
            gsap.ticker.lagSmoothing(0);
        } else {
            // Fallback RAF loop (404.html etc)
            function raf(time) {
                lenis.raf(time);
                requestAnimationFrame(raf);
            }
            requestAnimationFrame(raf);
        }

        window.__lenis = lenis;
    }

    // ── Split-Text Reveal ──
    function initSplitText() {
        var targets = document.querySelectorAll('[data-split-text]');
        if (!targets.length) return;

        targets.forEach(function (el) {
            var wordIndex = 0;

            function wrapTextNodes(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    var text = node.textContent;
                    var parts = text.split(/(\s+)/);
                    var frag = document.createDocumentFragment();
                    parts.forEach(function (part) {
                        if (part.trim() === '') {
                            frag.appendChild(document.createTextNode(part));
                        } else {
                            var span = document.createElement('span');
                            span.className = 'split-word';
                            span.style.transitionDelay = wordIndex * 0.06 + 's';
                            span.textContent = part;
                            wordIndex++;
                            frag.appendChild(span);
                        }
                    });
                    node.parentNode.replaceChild(frag, node);
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    Array.from(node.childNodes).forEach(wrapTextNodes);
                }
            }

            Array.from(el.childNodes).forEach(wrapTextNodes);
            el.classList.add('split-text-ready');
        });

        // IntersectionObserver to trigger reveal
        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('split-text-visible');
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.2 }
        );

        document.querySelectorAll('.split-text-ready').forEach(function (el) {
            observer.observe(el);
        });
    }

    // ── Initialize ──
    function init() {
        initGrainOverlay();
        initPageTransitions();
        initLenis();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initSplitText);
        } else {
            initSplitText();
        }
    }

    init();
})();
