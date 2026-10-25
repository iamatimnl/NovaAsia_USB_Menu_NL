# Nova Asia 店内菜单屏（43 寸竖屏）

`display/` 是新的店内展示菜单，和旧的 `index.html`（横屏滚动版）完全分开，互不影响。

- 竖屏 1080×1920 布局，按屏幕大小自动缩放（4K 竖屏、1080p 竖屏都一样）。
- 自动轮播，不需要触摸，没有购物车或结账。
- 价格、名称、照片、是否在售来自 `menu.json`；页面顺序和荷兰语卖点来自 `display.json`。
- 断网后继续播放最后一次成功的菜单和已缓存的照片；每晚自动刷新一次；卡住会自动重启。

## 文件

| 文件 | 作用 | 谁改 |
| --- | --- | --- |
| `display.json` | 播放顺序、每页秒数、特写商品和卖点文字、底部文字 | 店主可直接改 |
| `menu.json` | 菜单快照：名称、价格（含 Vanaf）、照片地址、是否在售 | 由 `tools/build_menu_snapshot.py` 生成，不手改 |
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
  - 依赖屏幕时钟正确（见下面屏幕设置第 2 步「Auto sync」）。
- 改停留时间：`"durations": { "feature": 9, "list": 11, "grid": 11, "brand": 7 }`（秒）。
- 换特写商品：复制一个 `"type": "feature"` 段，改 `item`（商品 ID 见 `menu.json`）、`kicker`、`line`。
- 一个特写想多播一次：加 `{ "type": "feature", "ref": "<那一段的 id>" }`。
- 商品下架或售罄（`menu.json` 里 `available: false`）会自动不显示；整页没有商品时整页跳过。

## 更新菜单（现在的做法）

在三个仓库并排放置的电脑上运行：

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

## 屏幕设置（iiyama ProLite LH4360UHS-B2AG，Android 11）

网页负责：轮播、自动缩放、断网继续播放、每晚刷新、卡住自动重启、保持屏幕常亮（浏览器支持时）。

屏幕负责（遥控器菜单，名称以到货后的实际菜单为准）：

1. **Configuration2 → Rotation → Portrait**（竖屏）。
2. 连 Wi-Fi 或网线；**Advanced option → Date and time → Auto sync**。
3. 打开内置 **Browser**，在 Settings 里把上面的地址存成第 1 个网址。
4. **Configuration1 → Boot on source → Browser**（播放列表 1），开机直接打开菜单屏。
5. **Configuration1 → Switch on state → Last status** 或 **Forced on**，停电恢复后自动开机。
6. **Advanced option → Schedule**：按营业时间设置开关机。
7. **Advanced option → IR control / Keyboard control → Lock**，避免被人乱按。
8. **Panel saving → Pixel shift**：开启，减少长时间显示固定画面造成的残影。

如果内置浏览器不能全屏或不支持离线缓存，备选：在 Android 上安装 Chrome，打开地址后「添加到主屏幕」（会以全屏 App 方式打开）；或安装 Fully Kiosk Browser（付费授权，开机自启、全屏、定时刷新、远程管理）。
