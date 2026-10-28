# DSH 工作区浏览器

一款纯客户端 DSH 插件：从左侧面板入口打开全宽浏览器，先按工作区浏览，再进入工作区查看会话，并通过 DSH 原生导航打开对话。

## AI 实现说明

本插件的主要代码实现、重构及相关文档由 AI 编码代理完成，功能方向与需求由人类提出。AI 生成不构成质量、安全性或兼容性保证；使用前请结合源码、测试结果与已验证的 DSH 版本自行评估。

## 功能

- 工作区网格与详情页；工作区可按原生注册顺序、名称或最近会话活动排序，并可调用原生接口调整顺序。
- 工作区名称、路径、会话标题和 ID 的元数据搜索；支持全部、工作区、会话范围。
- 工作区／路径父目录分组／全部会话视图；显示未分组会话，不扫描磁盘、不自动改会话归属。
- 子代理会话默认隐藏，可按开关显示；判定依据是目录元数据里的 `origin` 字段，普通分叉会话仍然保留。
- 空白会话（`blank`）默认与原生会话树一致：只显示当前打开的那一个，标为“新会话 / 尚未开始对话”，切走即隐藏，搜索不命中。需要找回未发送的草稿时，打开“显示空白会话”开关即可列出全部并由元数据搜索。
- 紧凑（默认）与标准两档显示密度，同时作用于工作区卡片和会话行。
- 隐藏工作区支持选择性恢复：可筛选列表、逐项恢复、恢复勾选项，或恢复全部。
- 会话最近／手动顺序、归档筛选、原生会话置顶、重命名、归档与恢复、fork、复制 ID、新会话。
- 自适应布局、键盘焦点样式、中文界面；打开会话只切换到 DSH 原生对话页，不由本插件逐条加载历史。

## 安装

项目不发布 npm 包。发布产物是挂在 GitHub Release 上的预构建压缩包，安装时不需要编译，也不会执行安装脚本。

### 从 Release 压缩包安装（推荐）

1. 打开一个**已发布**的 Release，复制其 `.tgz` 附件地址，例如
   `https://github.com/FFFengMJL/dsh-workspace-browser/releases/download/v0.1.1/dsh-workspace-browser-0.1.1.tgz`。
   草稿状态的 Release 不提供可下载附件，发布后该地址才会生效。
2. 安装到运行 Web 界面的 profile：

   ```sh
   dsh plugin --profile web add <压缩包地址>
   ```

   DSH 会在安装过程中把新 bundle 登记进该 profile，不需要手工修改 `dsh.profile.bundles`。
3. 重启该 profile，再刷新 Web 界面，侧栏面板列表中即出现入口。

DSH 支持用 npm 包名、git 地址或压缩包地址安装插件。本项目特意选择压缩包：Release 里已经是构建结果，用户不需要本仓库的开发依赖，也不需要批准构建脚本。

若 bundle 已存在但处于关闭状态，请在插件管理器中重新启用；重复安装同一个包不会把它自动打开。

安装前可选做完整性校验：

```sh
curl -fLO <压缩包地址>
curl -fLO <压缩包地址>.sha256
sha256sum -c dsh-workspace-browser-0.1.1.tgz.sha256
dsh plugin --profile web add "$PWD/dsh-workspace-browser-0.1.1.tgz"
```

### 从本地源码安装（开发用）

1. 在仓库目录运行 `pnpm install`、`pnpm build`。
2. 运行 `dsh plugin --profile <profile> add link:/绝对路径/dsh-workspace-browser`。
3. 重启该 profile。`link:` 安装指向你的工作目录，不是可分发版本。

### 兼容性

唯一验证过的目标是 DSH `0.2.1-rc.4`，也是清单 `dsh.compatibility` 中声明的版本。其他版本未经验证；DSH 自身的兼容性检查可能要求显式批准才会加载未验证版本。插件不修改宿主代码。`./client` 导出是 DSH 模块加载器入口，不是通用 ESM 导入接口。

## 当前范围与限制

- 搜索仅匹配会话目录元数据，不读取对话正文。
- 分组、排序、归档筛选、显示密度、子代理可见性与工作区 pin／隐藏保存在插件自有版本化浏览器键 `dsh-workspace-browser.preferences.v1`；同源标签页通过 `storage` 事件同步。它们不与原生侧栏或其他浏览器配置同步。若浏览器存储不可用，偏好仅在当前内存中生效。搜索、详情页和滚动位置仍是临时状态。
- 重命名通过公开 `ctx.remote.session.rename`；本插件不改写会话日志。活跃会话归档会先显示确认框，再通过原生工作区服务请求停止并归档；DSH 仍负责最终执行与拒绝处理。
- fork 成功后可从提示条打开新会话；不自动切换会话。
- 添加工作区继续使用 DSH 原生侧栏流程。删除工作区、物理删除／迁移会话、旧工作区归属修复均不在插件范围内。

工作区置顶和隐藏是插件自己的浏览器偏好；它们不改变原生工作区顺序、注册或会话归属。卸载插件不会清除此插件的浏览器偏好键。会话置顶、归档和工作区手动顺序则通过 DSH 原生公开服务写入。

隐藏项对应的工作区若已不在注册表中，会单独计数、不渲染为卡片，但仍保留在偏好里，避免静默丢弃用户的隐藏选择。

## 开发

构建工具决定了下限：Node.js 22.18+（锁定版本的 `tsdown` 已不再支持更早的 22.x；24.11+ 与 26+ 亦可），以及通过 `packageManager` 固定的 pnpm 12.15.0。发布出去的插件本身除 DSH 自身要求外没有额外 Node 运行时要求。

```sh
pnpm install
pnpm verify     # 类型检查、测试、构建、loader 冒烟，再打包并检查安装包
```

可单独执行：`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:bundle`、`pnpm check`、`pnpm check:package`。

`pnpm check:package` 会把发布压缩包写入 `.release/`（已被 git 忽略），解包后校验 DSH 读取的清单字段、精确的文件集合、解包目录中的 loader 契约、是否夹带开发路径或秘密，并生成 SHA-256 校验文件。`pnpm pack` 通过 `prepack` 先跑 `pnpm check`，因此不会从没验证过的构建产出压缩包。

测试覆盖搜索、归属推导、归档与子代理筛选、排序、置顶优先级、隐藏项拆分、路径分组、偏好迁移，以及 10,000 条合成目录元数据。测试不读取本机 DSH 会话正文或生产数据。

### 源码职责

| 路径 | 职责 |
| --- | --- |
| `src/client.tsx` | Cordis 边界：`inject` 声明、侧栏入口、带 key 的 `main` 视图，以及唯一的运行时 Context 断言。 |
| `src/ui/runtime.ts` | 窄服务端口与快照订阅 hook；不直接调用 Cordis。 |
| `src/ui/WorkspaceBrowser.tsx` | 面板状态、列表派生、DSH 动作接线。 |
| `src/ui/cards.tsx` | 纯展示的工作区卡片与会话行。 |
| `src/ui/dialogs.tsx` | 可访问的弹窗外壳、归档/重命名确认、隐藏工作区管理。 |
| `src/ui/preferences.ts` | 偏好的读取、持久化与跨标签页同步。 |
| `src/ui/styles.ts` | 单份注入样式表；密度由 CSS 变量表达。 |
| `src/logic.ts` | 无 React 的数据规则（筛选、排序、分组、偏好解析），并有单元测试覆盖。 |
| `scripts/check-bundle.mjs` | 复现 DSH 客户端 loader 契约与注入的服务端口。 |
| `scripts/check-package.mjs` | 打包、解包并校验可安装的压缩包。 |

这些文件里的注释解释约束而不是复述代码：`origin` 与分叉的 `parentId` 为何不同、偏好为何只属于本插件、存储失败为何退化为内存、以及所有列表为何共用一个筛选入口。

## 发布新版本

`.github/workflows/release.yml` 在推送 `v*` 标签时构建压缩包，并创建**草稿** GitHub Release。需要维护者手动发布，因此不会自动分发。

**发布产物只来自标签指向的那次提交。** 工作流显式按触发用的 `refs/tags/<tag>` 检出，并在构建前校验触发事件是标签、检出的 `HEAD` 等于触发该次运行的提交；因此它不会去取 `main` 的最新状态，`main` 在打标签之后又多出的提交不会被计入发布包。标签指向提交，而非分支：不需要（也不应）为一次发布去建同名分支。

1. 修改 `package.json` 版本号并运行 `pnpm verify`。
2. 提交后执行 `git tag v<版本号>` 并推送该标签。
3. 标签与 `v<版本号>` 不一致时工作流直接失败；一致时才重新构建、复验压缩包与校验文件，并生成带安装命令的草稿。
4. 审核草稿后点击发布；发布前附件地址不可下载。对已存在的标签重跑发布会失败，不会覆盖已发布的字节。

CI（`.github/workflows/ci.yml`）在每次推送和 PR 上运行同一套 `pnpm verify`，并保留可下载的压缩包制品；那里的压缩包只是验证副本，用于确认 main 上仍可构建，**不是**发布来源，也不会被 Release 工作流取用。

清单中的 `repository`、`homepage`、`bugs` 已指向本仓库，安装包会带回项目地址。

## 安全与数据

插件只订阅工作区和会话列表快照；持久化偏好只包含工作区 ID 与筛选枚举，不存会话正文或路径。不会扫描工作目录、读取凭据或会话历史、添加模型工具、修改宿主源码，或手工改写 DSH 生成状态。卸载插件不会删除或移动任何 DSH 数据。

## 参与与反馈

提交 PR 前请运行 `pnpm verify`，并注明实际测试过的 DSH 版本。安全问题请通过仓库的安全公告渠道私下报告，不要开公开 issue。这些检查用于防止打包错误，不构成安全审计。

## 许可证

MIT，见 [LICENSE](LICENSE)。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
