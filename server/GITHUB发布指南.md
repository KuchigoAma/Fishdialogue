# GitHub 发布和链接安装

## 1.4.3：Windows 双击安装服务端

GitHub 扩展安装后，在安装好的 Fishdialogue 文件夹双击 **install-server.cmd**。安装器自动向上定位 SillyTavern 根目录，并将附带 server 的四个文件安装到 plugins/fish-dialogue。账户级和全用户安装均支持。

请先关闭酒馆，运行安装器，确认成功后再启动酒馆。enableServerPlugins 必须为 true，原 requestProxy 设置保留。安装器不修改 config.yaml，不读取或改写账户 Key、聊天、音频和世界书。

旧服务端文件备份到酒馆根目录 fish-dialogue-install-backups；旧单文件 plugins/fish-dialogue.mjs 在备份后移出 plugins，避免重复加载。备份不会自动清理。安装器遇到未知目标目录或路径联接时拒绝覆盖。

这不是浏览器自动部署：酒馆的 GitHub 安装接口不会执行安装器，所以需要双击一次，并重启酒馆。Node.js 必须在 PATH 中；找不到 Node 时请在启动酒馆使用的 Node 环境运行。

如文件在酒馆目录之外，可在安装包目录执行：

```text
node install-server.mjs "你的酒馆根目录"
```

Linux/macOS 在扩展文件夹执行 node install-server.mjs。当前一键入口针对 Windows；此版本未在 Linux/macOS 实机验证。

更新服务端时重复运行安装器即可。仅前端更新不需要重复执行。已经安装正常的 1.4.2 服务端可继续使用。


已提供 Fish-Dialogue-v1.4.3-github.zip。解压后 manifest.json、index.js、style.css、各 mjs、Fish-Dialogue.json、README.md 应直接位于仓库根目录，server 是子目录。不要把整个外层文件夹、extension 文件夹或 ZIP 本身当作代码上传。

## 使用网页上传

1. 在 GitHub 点击 New repository，取名 fish-dialogue，选择 Public，创建仓库。
2. 选择 uploading an existing file（或 Add file → Upload files），上传解压后的全部文件和 server 文件夹，提交。
3. 确认仓库首页直接显示 manifest.json 和 index.js。可以把 manifest.json 的 author 改为希望公开的昵称，homePage 改为真实仓库首页；当前 author 是 Local，不含个人身份。
4. 如希望明确授权他人修改或分发，可自行选择开源许可证并添加 LICENSE；此包没有替你决定授权条款。
5. 在酒馆“扩展程序 → 安装扩展”粘贴 `https://github.com/你的用户名/fish-dialogue`。不要使用 ZIP 下载链接或 /tree/main/extension 子目录链接。
6. 若原本手动安装过本插件，先把旧前端目录移到扩展目录之外做备份，避免加载两份。重新用链接安装后，后续可从酒馆扩展管理里更新 Git 仓库版本。

## 服务端必须另装

GitHub 链接安装只安装浏览器前端，无法自动将 server 放进酒馆 plugins。请按照 README 复制 server 全部文件到 SillyTavern/plugins/fish-dialogue 并启用服务端插件、配置代理和重启。这是请求继承酒馆代理及本地音频持久化所必需的。1.4.1 用户已有服务端，无需重复安装。

## 后续更新

将新前端文件覆盖到仓库根目录并提交，更新 manifest.json 版本。服务端有变更时需通知用户单独覆盖 server 文件并重启酒馆。

当前包没有连接或发布到你的 GitHub。不要上传整个开发工作区、历史 ZIP、聊天记录、音频、账户设置或临时测试目录。源码包提供 .gitignore，但上传前仍需确认文件清单。

官方依据：
- https://docs.sillytavern.app/for-contributors/writing-extensions/
- https://docs.sillytavern.app/for-contributors/server-plugins/
- https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/templates/installExtension.html

可使用 GitHub 链接安装不等于加入官方扩展列表；官方内容库目前不接受依赖服务端插件才能工作的 UI 扩展。
