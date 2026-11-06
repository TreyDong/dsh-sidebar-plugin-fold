# sidebar-plugin-fold

DSH 插件：折叠左侧栏里的插件入口，把不常用的行收起来。

## 问题

插件装多后，左侧栏的插件入口（Plugins、自媒体工作台、读书、做图、media-studio、自媒体、Automation tasks、Agent office、media-workbench……）会占掉很长一段竖向空间，把工作区/会话列表挤到下面。

## 做法

侧栏的插件行由 DSH 自带的 `dsh-client-ui-sidebar` 渲染；它把「未固定（unpinned）」的面板行隐藏掉，而这个未固定集合保存在侧栏自己的内存 store 里，唯一能改它的入口是侧栏「更多」菜单的 `sidebar.panellist.actions` 插槽（owner props 提供 `onPinnedChange`）。

本插件因此在「更多」菜单里加了一段折叠区：

- 每个插件入口一行，左侧复选框切换该行在侧栏的显示/隐藏，右侧「Open」直接打开被折叠的面板。
- 底部「Collapse all / Expand all」一键收起或展开全部。
- 顶部显示当前可见数量（如 `showing 3/8`）。
- 折叠选择写入 `localStorage`（`dsh.sidebar.plugin-fold.v1`）；侧栏在页面刷新后会忘记自己的未固定集合，所以下次打开「更多」菜单时插件会把上次的折叠恢复，并提示「Restored your last fold (N hidden)」。

## 已知边界

- 恢复发生在打开「更多」菜单时：刷新页面后侧栏会先恢复成全部展开的样子，打开「更多」即自动折叠回上次的状态。
- 折叠状态由浏览器 `localStorage` 保存，换浏览器或清缓存后需要重新折叠。
- 「Plugins」本身是侧栏固定行，不参与折叠。

## 目录

| 文件 | 作用 |
|---|---|
| `package.json` | 包清单；`dsh.bundle.patch` 指向补丁，`dsh.client` 声明 Web 端插件 |
| `cordis.patch.yml` | Loader 补丁，插入 `@local/sidebar-plugin-fold` 行 |
| `index.js` | Host 半边（占位，渲染全在客户端） |
| `client.js` | 浏览器半边：折叠区渲染、开关逻辑与 localStorage 记忆 |
| `locale/en.json` `locale/zh.json` | 插件管理器里的标题与描述 |
| `icon.svg` | 插件管理器图标 |
| `notes/` | 工程记录 |

## 安装

```bash
plugin_manager install_bundle /Users/Treydong/Desktop/40_项目库/sidebar-plugin-fold
```

安装后刷新一次浏览器页面即可看到侧栏「更多」菜单里的折叠区。

## 验证

见 `notes/2026-11-06-sidebar-plugin-fold.md`。
