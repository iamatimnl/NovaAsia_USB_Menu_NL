window.onload = function () {
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
    setTimeout(() => {
        const current = window.location.pathname.split('/').pop();
        if (current === 'index.html') {
            window.location.href = 'index2.html';
        } else {
            window.location.href = 'index.html';
        }
    }, 15000);
};
