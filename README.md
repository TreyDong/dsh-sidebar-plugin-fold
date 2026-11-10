# sidebar-plugin-fold

DSH 插件：折叠并重排左侧栏里的插件入口，把不常用的行收起来、把常用的行放到顺手的位置。

## 问题

插件装多后，左侧栏的插件入口（Plugins、读书、邮箱、Banana Studio、Automation tasks、Projects、Agent office……）会占掉很长一段竖向空间，把工作区/会话列表挤到下面；而且顺序由各插件自己的 `order` 决定，用户改不了。

## 做法

侧栏的插件行由 DSH 自带的 `dsh-client-ui-sidebar` 渲染；它把「未固定（unpinned）」的面板行隐藏掉，而这个未固定集合保存在侧栏自己的内存 store 里，唯一能改它的入口是侧栏「更多」菜单的 `sidebar.panellist.actions` 插槽（owner props 提供 `onPinnedChange`）。

本插件因此在「更多」菜单里加了一段，一行一个面板，显示与顺序一起管：

- **✓ 复选框**：切换该面板在侧栏的显示/隐藏；`Plugins` 由侧栏固定，不能隐藏，用虚线框标出。
- **↑ ↓**：调整该面板在侧栏里的先后顺序。
- **↗**：直接打开该面板（被收起后也还能打开）。
- 顶部显示可见数量（如 `showing 3/6`），旁边的 **↺** 恢复默认顺序。
- 底部 **Collapse all / Expand all** 一键收起或展开全部。
- 折叠选择写入 `localStorage`（`dsh.sidebar.plugin-fold.v1`）；侧栏在页面刷新后会忘记自己的未固定集合，所以下次打开「更多」菜单时插件会把上次的折叠恢复，并提示「Restored your last fold (N hidden)」。
- 顺序写入 `localStorage`（`{{SECRET_i7o3hugf}}`），刷新后直接生效。

侧栏按每个面板注册的 `order` 排序，而 `order` 属于注册它的那个插件，第三方改不了。可行做法是：槽位对同一个 id 只保留一个条目，优先级更低（数值更小）的条目先入选。于是本插件在用户设定过顺序时，为每个面板注册一份「影子条目」——同一个 id、同一个图标组件与标题、自己的 `order`、优先级 `-1`；用户点「恢复默认顺序」时影子条目被撤销，侧栏回到插件自带的顺序。插件自身重新注册时，影子条目会自动跟着更新。

## 已知边界

- 折叠恢复发生在打开「更多」菜单时：刷新页面后侧栏会先恢复成全部展开的样子，打开「更多」即自动折叠回上次的状态。顺序没有这个限制，刷新后直接生效。
- 折叠与顺序状态由浏览器 `localStorage` 保存，换浏览器或清缓存后需要重新设置。
- 「Plugins」本身是侧栏固定行，不能隐藏（但可以参与排序）。
- 带有子插槽或 store 的面板条目无法被影子条目接管，这类面板会排在被接管的面板之后。

## 目录

| 文件 | 作用 |
|---|---|
| `package.json` | 包清单；`dsh.bundle.patch` 指向补丁，`dsh.client` 声明 Web 端插件 |
| `cordis.patch.yml` | Loader 补丁，插入 `@local/sidebar-plugin-fold` 行 |
| `index.js` | Host 半边（占位，渲染全在客户端） |
| `client.js` | 浏览器半边：折叠区与排序区渲染、影子条目接管、localStorage 记忆 |
| `locale/en.json` `locale/zh.json` | 插件管理器里的标题与描述 |
| `icon.svg` | 插件管理器图标 |
| `notes/` | 工程记录 |

## 安装

远端仓库：https://github.com/TreyDong/dsh-sidebar-plugin-fold

本机（已链接目录安装）：

```bash
plugin_manager install_bundle /Users/Treydong/Desktop/40_项目库/sidebar-plugin-fold
```

通过插件市场一键安装（已在 web profile 配好索引源）：

1. 侧栏 **Plugins** → **Discover** → **Add index source**。
2. 填入本仓库的索引文件地址：
   `https://raw.githubusercontent.com/TreyDong/dsh-sidebar-plugin-fold/main/index.json`
3. 在 Discover 里找到 **Sidebar plugin fold**，点安装即可。

索引文件为市场格式 1 的 `index.json`（仓库根目录），安装源是 git + 固定 commit；插件版本升级时更新其中的 `versions` 与 commit。

安装后刷新一次浏览器页面即可看到侧栏「更多」菜单里的折叠区。

## 验证

见 `notes/2026-11-06-sidebar-plugin-fold.md`。
