# Nova Asia 店内菜单屏（43 寸竖屏）

`display/` 是新的店内展示菜单，和旧的 `index.html`（横屏滚动版）完全分开，互不影响。

- 竖屏 1080×1920 布局，按屏幕大小自动缩放（4K 竖屏、1080p 竖屏都一样）。
- 自动轮播，不需要触摸，没有购物车或结账。
- 价格、名称、照片、售罄每 10 分钟从网站实时读取（和 Dashboard、Kiosk 是同一份菜单）；页面顺序和荷兰语卖点来自 `display.json`。
- 网站读不到时用上一次读到的菜单；从来没读到过时用 `menu.json` 快照。
- 断网后继续播放最后一次成功的菜单和已缓存的照片；每晚自动刷新一次；卡住会自动重启。

## 文件

| 文件 | 作用 | 谁改 |
| --- | --- | --- |
| `display.json` | 播放顺序、每页秒数、特写商品和卖点文字、底部文字 | 店主可直接改 |
| `menu.json` | 备用菜单快照（网站读不到、屏幕上也没有上一次的菜单时才用） | 由 `tools/build_menu_snapshot.py` 生成，不手改 |
| `vendor/kiosk/` | Kiosk 的价格计算程序，原样复制（来源和更新方法见 `SOURCE.txt`） | 不手改 |
| `index.html` `display.css` `display.js` | 页面和播放程序 | 开发 |
| `sw.js` `manifest.webmanifest` | 离线缓存、全屏安装 | 开发 |
| `assets/` | 白色标志、Archivo 字体（SIL OFL 开源授权） | — |

### display.json 常用改法

- 配色：白天用 `"palette"`（现在是 `red` Nova 红），天黑后自动换成 `"palette_after_dark"` 里的 `palette`（现在是 `night` 夜市暖光）。
  - 切换时间按 Hoofddorp 每天的日落、日出自动算（`lat`/`lon` 是店的位置）：日落前 `margin_minutes`（30）分钟换成夜间配色，日出后 30 分钟换回白天配色。冬天大约 16:00 换，夏天大约 21:30 换。
  - 只在翻页时换，正在显示的那一页不会突然变色。
  - 可选配色：`red`（Nova 红）、`night`（夜市暖光）、`washi`（和纸白）、`green`（Kiosk 绿）。
  - 不想自动切换：删掉 `"palette_after_dark"` 那一行，整天用 `"palette"`。
  - 预览：地址后加 `?palette=night` 可以随时看某一种配色，不影响屏幕。
  - 依赖屏幕时钟正确（见下面屏幕设置第 2 步「Date & time」）。
- 顶栏右边的介绍文字：`"tagline": "Poké · Bento · Fried rice · Sushi & meer"`。现在这一行刚好放满，不要再加长；要加词就写成两行：`["第一行", "第二行"]`。
- 「扫码点餐」页（`"type": "online"`）：大二维码通往自家网站，背景是慢慢上移的菜品照片。`url` 是二维码地址（现在 `https://novaasia.nl/?ref=scherm`，`ref=scherm` 用来以后在网站日志里认出是从屏幕扫进来的），`photos` 是背景用的菜品 ID。改了 `url` 之后要重新生成二维码：`pip install segno && python3 tools/make_qr.py`。想多播一次就加 `{ "type": "online", "ref": "online" }`。
- 改停留时间：`"durations": { "feature": 9, "list": 11, "grid": 11, "brand": 7 }`（秒）。
- 视频页（`"type": "video"`）：`src` 是 `assets/video/` 里的 MP4，全屏播放（盖住顶栏和底栏），播完一遍自动换下一页。现在是 `assets/video/nova-asia-promo-v8.mp4`（25 秒，11 个菜单分类），每轮两次，都在「扫码点餐」页前面。
  - 视频要求：1080×1920 竖屏、MP4（H.264）、不要声音、最长 50 秒（更长的会在 50 秒处切掉）。
  - 换新版本：把新文件放进 `assets/video/`，换个文件名（如 `…-v9.mp4`），改 `display.json` 里的 `src`，再发布。旧文件可以删掉。
  - 屏幕会先把整个视频下载好再播，离线也能播；还没下载好、文件不在或屏幕不能播时，这一页自动跳过。`?debug=1` 的 `video` 一行显示状态（`ready` / `loading` / `failed` 和原因）和播了几次。
- 换特写商品：复制一个 `"type": "feature"` 段，改 `item`（商品 ID 见 `menu.json`）、`kicker`、`line`。
- 一个特写想多播一次：加 `{ "type": "feature", "ref": "<那一段的 id>" }`。
- 商品下架或售罄（在 Dashboard 里设置）最多约 10 分钟后自动不显示，等当前这一轮播完才换；整页没有商品时整页跳过。
- `"menu_feed"`：实时菜单的地址（`https://www.novaasia.nl/api/menu/display`）。删掉这一行就只用 `menu.json` 快照。`"refresh_minutes"` 是多久读一次（10）。

## 实时菜单（2026-11-10 起）

- 屏幕每 `refresh_minutes`（10）分钟读一次网站的 `/api/menu/display`：网站 `/menu` 页和 Kiosk 用的同一份菜单，带当天的售罄。只读，不能下单。
- 价格用 `vendor/kiosk/` 里 Kiosk 自己的计算程序算，所以「Vanaf」价格和 Kiosk 一样；售罄的商品和选项（例如某一种卷）由它直接去掉，最低价选项售罄时「Vanaf」会跟着变。
- 内容没变就不重建页面；变了就在这一轮播完后换上。
- 读不到（断网、网站维护、超过 15 秒没回应、内容明显不对）：继续用上一次读到的菜单，下次再试。
- `?debug=1` 里的 `menu` 一行显示菜单来源：`live`（刚从网站读到，后面是时间和商品数）、`last-live`（网站读不到，用的是上一次读到的，后面是那次的时间）、`snapshot`（用 `menu.json`）、`stored`（连 `display.json` 也读不到，用屏幕上存着的上一份）。
- Kiosk 程序更新价格规则后，按 `vendor/kiosk/SOURCE.txt` 重新复制这四个文件，改 `index.html`/`sw.js` 的版本号后发布。

## 更新备用快照 menu.json

平时不需要。在三个仓库并排放置的电脑上运行：

```bash
python3 tools/build_menu_snapshot.py \
  --source ../nova-asia/catalog/operations-menu-source.json \
  --managed ../nova-asia/scripts/mobile_storefront_preview_support/public-menu.json \
  --backend ../flask-order-api --kiosk ../nova-asia-kiosk
```

价格用后端的展开逻辑和 Kiosk 的价格计算生成，所以与 Kiosk 上的价格（包括「Vanaf」）一致。
`--source` 也可以直接用线上地址 `https://www.novaasia.nl/api/menu/kiosk-publication`（Kiosk 用的同一份菜单，已含 Dashboard 新增商品），这时不需要 `--managed`。

## 发布

新版本放在 `display/` 子目录，GitHub Pages 发布后地址是：
`https://iamatimnl.github.io/NovaAsia_USB_Menu_NL/display/`
旧地址（根目录 `index.html`）保持不变，直到确认后再停用。

## 屏幕设置（iiyama ProLite LH4365UHSB-B1，Android 11）

地址：`https://iamatimnl.github.io/NovaAsia_USB_Menu_NL/display/`

网页负责：轮播、按看得见的区域自动缩放、断网继续播放、每晚刷新、卡住自动重启、保持屏幕常亮（浏览器支持时）。

屏幕负责（遥控器；菜单路径来自 LH43/50/55/65/75/8665UHSB 说明书）：

1. **HOME → Configuration 2 → System rotation → Portrait**（竖屏，说明书第 29 页）。
2. 连 Wi-Fi 或网线；**HOME → 1668 → Settings → System → Date & time**：打开「Use network-provided time」（第 36 页）。日夜配色靠这个时钟。
3. **HOME → 1668 → Apps → Browser**：New tab 输入上面的地址；在 Create list / Play list 里存成第 1 个网址（第 40 页）。
4. **HOME → Configuration 1 → Boot on source → Browser**（第 28 页），开机直接打开菜单屏。
5. **HOME → Configuration 1 → Switch on state → Last status** 或 **Forced on**（第 28 页），停电恢复后自动开机。
6. **HOME → Advanced option → Schedule**：按营业时间设置开关机（第 30–31 页）。
7. **HOME → Advanced option → IR control → Lock all but Power**，避免被人乱按；解锁：按住遥控器 INFO 键 6 秒（第 14、30 页）。
8. **HOME → Configuration 1 → Panel saving → Pixel shift**：开启，减少残影（第 28 页）。

### 排查用的网址开关（加在地址后面）

- `?debug=1`：屏幕中间显示浏览器报告的尺寸、缩放和 Chrome 版本；红框是窗口边缘，黄色虚线框是真正看得见的区域。新屏幕装好后拍一张，就知道浏览器怎么报尺寸。
- `?rotate=270`（屏幕顺时针转 90° 装）或 `?rotate=90`（逆时针）：屏幕竖着装、但浏览器还是横屏时，页面自己转过来铺满。浏览器已经是竖屏时这个开关不起作用，不会出错。
- `?palette=night` 等：临时看某一种配色。
- 多个开关用 `&` 连接，例如 `?debug=1&rotate=270`。

如果内置浏览器不能全屏或不支持离线缓存，备选：在 Android 上安装 Chrome，打开地址后「添加到主屏幕」（会以全屏 App 方式打开）；或安装 Fully Kiosk Browser（付费授权，开机自启、全屏、定时刷新、远程管理）。
