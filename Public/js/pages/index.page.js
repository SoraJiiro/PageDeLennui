                (function () {
                    function protectZone() {
                        const z = document.querySelector('.zone');
                        if (!z) return;

                        const blocker = function () { return 'Action bloquée'; };

                        const captureHandler = function (e) {
                            if (!e.isTrusted) {
                                try { e.stopImmediatePropagation(); } catch (ie) {}
                                e.preventDefault();
                                console.warn('Clic synthétique bloqué sur .zone');
                            }
                        };

                        const bubbleHandler = function (e) {
                            e.preventDefault();
                        };

                        try {
                            Object.defineProperty(z, 'onclick', {
                                configurable: false,
                                writable: false,
                                value: blocker
                            });
                        } catch (err) {
                             
                        }

                        try {
                            if (!z.__zone_protection) {
                                z.addEventListener('click', bubbleHandler, false);
                                z.addEventListener('click', captureHandler, true);
                                z.__zone_protection = { captureHandler: captureHandler, bubbleHandler: bubbleHandler, blocker: blocker };
                            }
                        } catch (err) {
                        }

                        try {
                            if (z.onclick !== blocker) {
                                try {
                                    Object.defineProperty(z, 'onclick', {
                                        configurable: false,
                                        writable: false,
                                        value: blocker
                                    });
                                } catch (err) {
                                    z.onclick = blocker;
                                }
                            }
                        } catch (err) {
                        }
                    }

                    setTimeout(function () {
                        protectZone();

                        const observer = new MutationObserver(function (mutations) {
                            protectZone();
                        });
                        observer.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });

                        const periodic = setInterval(protectZone, 1500);

                        window.addEventListener('beforeunload', function () { observer.disconnect(); clearInterval(periodic); });
                    }, 400);
                })();
                

