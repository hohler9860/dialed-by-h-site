(function () {
    'use strict';

    // ── Grain Overlay ──
    function initGrainOverlay() {
        var grain = document.createElement('div');
        grain.id = 'grain-overlay';
        grain.setAttribute('aria-hidden', 'true');
        document.body.prepend(grain);
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

    // ── Shimmer Text ──
    // Pure-JS port of the shimmer-text React component.
    // Adds the .shimmer-text class to headings, paragraphs, and nav links.
    // For headings that contain children with their own text colors
    // (e.g. text-muted, stroke-text), the class is applied to each child
    // individually so colour variations are preserved.
    function initShimmerText() {
        var candidates = document.querySelectorAll(
            'h1, h2, h3, h4, p, .nav-link, #mobile-menu > a'
        );

        candidates.forEach(function (el) {
            // Skip elements inside shimmer buttons, forms, or tickers
            if (el.closest('.shimmer-btn') || el.closest('form') || el.closest('.animate-ticker')) return;
            // Skip stroke-text (has its own fill / stroke rendering)
            if (el.classList.contains('stroke-text')) return;

            // Headings with child elements → apply per-child to keep colour
            var childEls = Array.from(el.children).filter(function (c) {
                return c.tagName !== 'BR';
            });

            if (/^H[1-6]$/.test(el.tagName) && childEls.length > 0) {
                Array.from(el.childNodes).forEach(function (node) {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                        var span = document.createElement('span');
                        span.className = 'shimmer-text';
                        span.textContent = node.textContent;
                        node.parentNode.replaceChild(span, node);
                    } else if (
                        node.nodeType === Node.ELEMENT_NODE &&
                        node.tagName !== 'BR' &&
                        !node.classList.contains('stroke-text')
                    ) {
                        node.classList.add('shimmer-text');
                    }
                });
            } else {
                el.classList.add('shimmer-text');
            }
        });
    }

    // ── Initialize ──
    function init() {
        initGrainOverlay();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                initSplitText();
                initShimmerText();
            });
        } else {
            initSplitText();
            initShimmerText();
        }
    }

    init();
})();
