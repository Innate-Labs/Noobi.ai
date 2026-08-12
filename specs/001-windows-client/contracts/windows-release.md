# 契约：Windows 发行产物

## 产物

```text
packages/desktop/release/Noobi.ai-<version>-windows-x64-setup.exe
packages/desktop/release/win-unpacked/Noobi.ai.exe
```

NSIS 配置：引导式、当前用户安装、允许选择目录、创建开始菜单和桌面快捷方式，卸载不删除
Electron `userData`，更不能删除用户项目目录。

## 构建前置

1. Runner 必须为 `win32/x64`。
2. `npm ci` 必须在该 Runner 上执行。
3. Runtime manifest 必须声明 `win32/x64`。
4. desktop typecheck、tests、build 与 Runtime smoke 全部通过。

## 验证器

`verify-windows-installer.mjs` 必须失败关闭，并检查：

- 宿主为 Windows x64；
- setup EXE 存在且是有效 PE；NSIS bootstrap 可为 i386，但 unpacked `Noobi.ai.exe` payload 的
  PE machine 必须为 AMD64；
- product name、版本、appId 对应 package manifest；
- `app.asar`、Runtime CLI、Runtime manifest、Runtime node_modules 和 game-skill 资源存在；
- Runtime manifest target 为 `win32/x64`；
- `ELECTRON_RUN_AS_NODE=1` 可以运行打包 Runtime CLI 的 `--help`；
- release 模式下 Authenticode 状态必须为 `Valid`，证书 Subject 必须包含配置的预期发布者；dev
  模式明确输出 unsigned 状态。

## CI 与公开发布

- Pull Request/手工 CI 上传文件名包含 `unsigned-dev` 的开发安装包。
- 正式发布 job 只有在签名凭据存在、signed package 和验证器通过后才能上传。
- 发布同时生成安装包 SHA-256；安装包、checksum、版本和架构必须一致。
