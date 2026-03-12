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

    // ── Initialize ──
    function init() {
        initGrainOverlay();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initSplitText);
        } else {
            initSplitText();
        }
    }

    init();
})();
