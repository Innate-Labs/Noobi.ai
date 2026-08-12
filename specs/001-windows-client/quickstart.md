# 快速验证：Windows 客户端

## Windows 11 x64 开发构建

```powershell
git clone https://github.com/Innate-Labs/Noobi.ai.git
Set-Location Noobi.ai
npm ci
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run package:win --workspace=@gameagent/desktop
```

预期安装包：

```text
packages/desktop/release/Noobi.ai-0.2.2-windows-x64-setup.exe
```

普通命令生成的是开发构建。它可以用于内部验证，但没有有效 Authenticode 时不得作为公开正式版。

## 验证安装包

```powershell
npm run verify:win-installer --workspace=@gameagent/desktop
Get-FileHash packages/desktop/release/Noobi.ai-0.2.2-windows-x64-setup.exe -Algorithm SHA256
Get-AuthenticodeSignature packages/desktop/release/Noobi.ai-0.2.2-windows-x64-setup.exe
```

正式签名构建使用 CI Secret 提供证书，再执行：

```powershell
npm run package:win:signed --workspace=@gameagent/desktop
```

## 干净机器验收

1. 在 Windows 11 x64 干净用户中运行 setup EXE。
2. 确认名称、IP 图标、开始菜单、桌面快捷方式和卸载入口。
3. 启动应用，验证最小化、最大化与关闭按钮。
4. 保存模型配置、重启并完成基础测速。
5. 在包含空格和中文的目录创建项目，让 Agent 完成最小 2D Web 游戏。
6. 停止并恢复 Agent；检查实际工具调用与项目文件。
7. 安装一个 Skill、配置一个测试 MCP，并在下一轮 Agent 中验证加载。
8. 在依赖页检测 Node.js、uv、Godot、Blender 与 Unity Hub；确认安装动作展示 WinGet 白名单。
9. 安装新版本覆盖测试，确认设置和项目仍存在。
10. 卸载应用，确认用户选择的项目目录未被删除。

## macOS 回归

```bash
npm run typecheck --workspace=@gameagent/desktop
npm test --workspace=@gameagent/desktop
npm run build --workspace=@gameagent/desktop
npm run smoke:runtime --workspace=@gameagent/desktop
```

Windows 产物只能在 Windows Runner 的验证结果通过后标记为可用。
