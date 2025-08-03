<script>
window.onload = function () {
    setInterval(() => {
        window.scrollBy(0, 2); // 每次向下滚动 2 像素
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight) {
            window.scrollTo(0, 0);   // 到底部就回到顶部
        }
    }, 20); // 每 20 毫秒滚动一次，速度较快
};
</script>
