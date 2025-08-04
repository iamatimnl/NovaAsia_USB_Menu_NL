
window.onload = function () {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
    setInterval(() => {
        window.scrollBy(0, 1);
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
            window.scrollTo(0, 0);
        }
    }, 20);
};
